import {
  parseMobileRoomServerMessage,
  type MobileRoomServerMessage,
  type MobilePublicEvent,
  type PlayerId,
  type ProtocolErrorCode,
  type RoomSocketClientMessage,
  type Suit,
  type Tile,
} from "./contract.ts";
import type {
  ClientTransportActionResult,
  MobileRoomTransport,
  MobileRoomTransportState,
} from "./transport.ts";
import {
  DEFAULT_MOBILE_EVENT_LIMIT,
  mergeMobilePublicEvents,
} from "./mobilePublicEvents.ts";

export type MobileWebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (event: { data?: unknown; message?: unknown; error?: unknown }) => void,
  ): void;
};

export type MobileRoomTransportOptions = {
  url: string;
  roomId: string;
  actionTimeoutMs?: number;
  socketFactory?: (url: string) => MobileWebSocketLike;
  initialEvents?: MobilePublicEvent[];
  eventLimit?: number;
};

type ActionWaiter = {
  resolve: (result: ClientTransportActionResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

export async function createMobileRoomTransport(
  options: MobileRoomTransportOptions,
): Promise<MobileRoomTransport> {
  const url = options.url.trim();
  const roomId = options.roomId.trim();
  const socket = (options.socketFactory ?? defaultSocketFactory)(url);
  const actionTimeoutMs = options.actionTimeoutMs ?? 5_000;
  const listeners = new Set<(state: MobileRoomTransportState) => void>();
  const waiters = new Map<string, ActionWaiter>();
  const snapshotWaiters = new Set<{
    resolve: (view: MobileRoomTransportState["snapshot"] extends infer T ? NonNullable<T> : never) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  let messageSequence = 0;
  let state: MobileRoomTransportState = {
    url,
    roomId,
    status: "connecting",
    playerId: null,
    sessionToken: null,
    snapshot: null,
    lastEventId: 0,
    serverNow: null,
    events: mergeMobilePublicEvents([], options.initialEvents ?? [], options.eventLimit ?? DEFAULT_MOBILE_EVENT_LIMIT),
    lastError: null,
  };

  socket.addEventListener("message", (event) => handleIncoming(event.data));
  socket.addEventListener("close", () => {
    if (state.status !== "error") {
      failTransport("closed", "连接已关闭");
    }
  });
  socket.addEventListener("error", () => failTransport("closed", "WebSocket 连接失败"));

  await waitForOpen(socket, actionTimeoutMs);
  updateState({ ...state, status: "online", lastError: null });

  const transport: MobileRoomTransport = {
    createRoomSession: ({ displayName }) => send({
      protocolVersion: 1,
      clientMessageId: nextMessageId(),
      type: "createRoom",
      payload: { roomId, displayName },
    }),
    joinRoomSession: ({ displayName }) => send({
      protocolVersion: 1,
      clientMessageId: nextMessageId(),
      roomId,
      type: "joinRoom",
      payload: { displayName },
    }),
    resumeSession: ({ sessionToken, lastSeenEventId }) => send({
      protocolVersion: 1,
      clientMessageId: nextMessageId(),
      roomId,
      sessionToken,
      type: "resumeSession",
      payload: lastSeenEventId === undefined ? {} : { lastSeenEventId },
    }),
    takeSeat: (seatId) => sendSessionAction("takeSeat", { seatId }),
    toggleReady: () => sendSessionAction("toggleReady", {}),
    startRound: (dealer) => sendSessionAction("startRound", dealer === undefined ? {} : { dealer }),
    readyNextRound: (expectedActionId) => sendGuardedSessionAction("readyNextRound", {}, expectedActionId),
    startNextRound: (expectedActionId) => sendGuardedSessionAction("startNextRound", {}, expectedActionId),
    finishGame: (expectedActionId) => sendGuardedSessionAction("finishGame", {}, expectedActionId),
    chooseMissingSuit: (suit) => sendSessionAction("chooseMissingSuit", { suit }),
    drawTile: (expectedActionId) => sendGuardedSessionAction("drawTile", {}, expectedActionId),
    drawGangTile: (expectedActionId) => sendGuardedSessionAction("drawGangTile", {}, expectedActionId),
    discardTile: (tile, expectedActionId) => sendGuardedSessionAction("discardTile", { tile }, expectedActionId),
    passClaim: (expectedActionId) => sendGuardedSessionAction("passClaim", {}, expectedActionId),
    claimHu: (expectedActionId) => sendGuardedSessionAction("claimHu", {}, expectedActionId),
    claimSelfDrawHu: (expectedActionId) => sendGuardedSessionAction("claimSelfDrawHu", {}, expectedActionId),
    claimPeng: (expectedActionId) => sendGuardedSessionAction("claimPeng", {}, expectedActionId),
    claimMingGang: (expectedActionId) => sendGuardedSessionAction("claimMingGang", {}, expectedActionId),
    claimAnGang: (tile, expectedActionId) => sendGuardedSessionAction("claimAnGang", { tile }, expectedActionId),
    claimBaGang: (tile, expectedActionId) => sendGuardedSessionAction("claimBaGang", { tile }, expectedActionId),
    passQiangGang: (expectedActionId) => sendGuardedSessionAction("passQiangGang", {}, expectedActionId),
    claimQiangGangHu: (expectedActionId) => sendGuardedSessionAction("claimQiangGangHu", {}, expectedActionId),
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    waitForSnapshot(timeoutMs = actionTimeoutMs) {
      if (state.snapshot !== null) {
        return Promise.resolve(state.snapshot);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            snapshotWaiters.delete(waiter);
            reject(new Error("Timed out waiting for room snapshot."));
          }, timeoutMs),
        };
        snapshotWaiters.add(waiter);
      });
    },
    close() {
      socket.close();
      failTransport("closed", "连接已关闭");
    },
  };

  return transport;

  function sendSessionAction(
    type: Exclude<RoomSocketClientMessage["type"], "createRoom" | "joinRoom" | "resumeSession">,
    payload: Record<string, unknown>,
  ): Promise<ClientTransportActionResult> {
    if (state.sessionToken === null) {
      return Promise.resolve({
        ok: false,
        kind: "transport",
        code: "missingSessionToken",
        reason: "missingSessionToken",
      });
    }
    return send({
      protocolVersion: 1,
      clientMessageId: nextMessageId(),
      roomId,
      sessionToken: state.sessionToken,
      type,
      payload,
    } as RoomSocketClientMessage);
  }

  function sendGuardedSessionAction(
    type: Extract<
      RoomSocketClientMessage["type"],
      | "drawTile"
      | "drawGangTile"
      | "readyNextRound"
      | "startNextRound"
      | "finishGame"
      | "discardTile"
      | "passClaim"
      | "claimHu"
      | "claimSelfDrawHu"
      | "claimPeng"
      | "claimMingGang"
      | "claimAnGang"
      | "claimBaGang"
      | "passQiangGang"
      | "claimQiangGangHu"
    >,
    payload: Record<string, unknown>,
    expectedActionId: string,
  ): Promise<ClientTransportActionResult> {
    const currentDescriptor = state.snapshot?.actionDescriptors.find(
      (descriptor) => descriptor.action === type,
    );
    if (currentDescriptor?.actionId !== expectedActionId) {
      return Promise.resolve({
        ok: false,
        kind: "action",
        code: "staleAction",
        reason: "staleAction",
      });
    }
    return sendSessionAction(type, { ...payload, expectedActionId });
  }

  function send(message: RoomSocketClientMessage): Promise<ClientTransportActionResult> {
    if (state.status !== "online" || socket.readyState !== 1) {
      return Promise.resolve({ ok: false, kind: "transport", code: "closed", reason: "closed" });
    }
    return new Promise((resolve) => {
      const waiter: ActionWaiter = {
        resolve,
        timer: setTimeout(() => {
          waiters.delete(message.clientMessageId);
          resolve({ ok: false, kind: "transport", code: "timeout", reason: "timeout" });
        }, actionTimeoutMs),
      };
      waiters.set(message.clientMessageId, waiter);
      socket.send(JSON.stringify(message));
    });
  }

  function handleIncoming(data: unknown) {
    const parsed = parseMobileRoomServerMessage(data);
    if (!parsed.ok) {
      failTransport("malformedServerMessage", parsed.reason);
      socket.close();
      return;
    }
    const message = parsed.message;
    if (message.type === "protocolError") {
      failTransport(message.payload.code, message.payload.message);
      socket.close();
      return;
    }
    if (message.roomId !== roomId) {
      failTransport("malformedServerMessage", "服务端消息房间号不匹配");
      socket.close();
      return;
    }

    if (message.type === "roomSnapshot") {
      if (state.playerId !== null && message.payload.playerId !== state.playerId) {
        failTransport("malformedServerMessage", "服务端返回了其他玩家的快照");
        socket.close();
        return;
      }
      let events: MobilePublicEvent[];
      try {
        events = mergeMobilePublicEvents(
          state.events,
          message.payload.events,
          options.eventLimit ?? DEFAULT_MOBILE_EVENT_LIMIT,
        );
      } catch {
        failTransport("malformedServerMessage", "服务端返回了冲突的公开事件");
        socket.close();
        return;
      }
      updateState({
        ...state,
        snapshot: message.payload.view,
        lastEventId: message.payload.lastEventId,
        serverNow: message.payload.serverNow,
        events,
        lastError: null,
      });
      for (const waiter of snapshotWaiters) {
        clearTimeout(waiter.timer);
        waiter.resolve(message.payload.view);
      }
      snapshotWaiters.clear();
      return;
    }

    const waiter = waiters.get(message.payload.clientMessageId);
    if (waiter === undefined) {
      return;
    }
    clearTimeout(waiter.timer);
    waiters.delete(message.payload.clientMessageId);

    if (message.type === "actionRejected") {
      waiter.resolve({
        ok: false,
        kind: "action",
        code: message.payload.code,
        reason: message.payload.code,
      });
      return;
    }

    updateState({
      ...state,
      playerId: message.payload.playerId,
      sessionToken: message.recipientSessionToken,
      lastError: null,
    });
    waiter.resolve({
      ok: true,
      clientMessageId: message.payload.clientMessageId,
      playerId: message.payload.playerId,
      sessionToken: message.recipientSessionToken,
    });
  }

  function failTransport(
    code: "malformedServerMessage" | "closed" | ProtocolErrorCode,
    reason: string,
  ) {
    if (state.status !== "error" || state.lastError !== reason) {
      updateState({ ...state, status: code === "closed" ? "closed" : "error", lastError: reason });
    }
    for (const waiter of waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ ok: false, kind: code === "closed" ? "transport" : "protocol", code, reason });
    }
    waiters.clear();
    for (const waiter of snapshotWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(reason));
    }
    snapshotWaiters.clear();
  }

  function updateState(nextState: MobileRoomTransportState) {
    state = nextState;
    for (const listener of listeners) {
      listener(state);
    }
  }

  function nextMessageId(): string {
    messageSequence += 1;
    return `mobile-${messageSequence}`;
  }
}

function defaultSocketFactory(url: string): MobileWebSocketLike {
  const SocketConstructor = globalThis.WebSocket;
  if (SocketConstructor === undefined) {
    throw new Error("WebSocket is not available in this runtime.");
  }
  return new SocketConstructor(url) as unknown as MobileWebSocketLike;
}

function waitForOpen(socket: MobileWebSocketLike, timeoutMs: number): Promise<void> {
  if (socket.readyState === 1) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening WebSocket.")), timeoutMs);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.addEventListener("error", (event) => {
      clearTimeout(timer);
      reject(new Error(webSocketErrorMessage(event)));
    });
  });
}

function webSocketErrorMessage(event: { message?: unknown; error?: unknown }): string {
  if (typeof event.message === "string" && event.message.trim() !== "") {
    return event.message;
  }
  if (event.error instanceof Error && event.error.message.trim() !== "") {
    return event.error.message;
  }
  return "WebSocket connection failed.";
}
