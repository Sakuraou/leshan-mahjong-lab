import type {
  ClientVisibleRoomState,
  PlayerId,
  RoomSocketClientMessage,
  RoomSocketServerMessage,
  Suit,
  Tile,
} from "./game/index.ts";

export type WebSocketRoomTransportState = {
  url: string;
  roomId: string;
  status: "connecting" | "open" | "closed";
  nextClientMessageNumber: number;
  sessionTokenByPlayerId: Record<string, string | undefined>;
  snapshotByPlayerId: Record<string, ClientVisibleRoomState | undefined>;
  serverNowByPlayerId: Record<string, number | undefined>;
  snapshotReceivedAtByPlayerId: Record<string, number | undefined>;
  messages: RoomSocketServerMessage[];
  acceptedMessages: Extract<RoomSocketServerMessage, { type: "actionAccepted" }>[];
  rejectedMessages: Extract<RoomSocketServerMessage, { type: "actionRejected" }>[];
};

export type WebSocketRoomTransport = {
  createRoomSession: (input: { displayName: string }) => Promise<WebSocketRoomTransportActionResult>;
  joinRoomSession: (input: { displayName: string }) => Promise<WebSocketRoomTransportActionResult>;
  resumeSession: (input: { sessionToken: string; lastSeenEventId?: number }) => Promise<WebSocketRoomTransportActionResult>;
  takeSeat: (playerId: string, seatId: PlayerId) => Promise<WebSocketRoomTransportActionResult>;
  toggleReady: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  startRound: (playerId: string, dealer?: PlayerId) => Promise<WebSocketRoomTransportActionResult>;
  readyNextRound: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  startNextRound: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  finishGame: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  chooseMissingSuit: (playerId: string, suit: Suit) => Promise<WebSocketRoomTransportActionResult>;
  drawTile: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  drawGangTile: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  discardTile: (playerId: string, tile: Tile) => Promise<WebSocketRoomTransportActionResult>;
  passClaim: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  claimHu: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  claimSelfDrawHu: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  claimPeng: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  claimMingGang: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  claimAnGang: (playerId: string, tile: Tile) => Promise<WebSocketRoomTransportActionResult>;
  claimBaGang: (playerId: string, tile: Tile) => Promise<WebSocketRoomTransportActionResult>;
  passQiangGang: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  claimQiangGangHu: (playerId: string) => Promise<WebSocketRoomTransportActionResult>;
  waitForSnapshot: (playerId: string, timeoutMs?: number) => Promise<ClientVisibleRoomState>;
  waitForMessageCount: (count: number, timeoutMs?: number) => Promise<RoomSocketServerMessage[]>;
  getClientView: (playerId: string) => ClientVisibleRoomState | undefined;
  getSessionToken: (playerId: string) => string | undefined;
  getState: () => WebSocketRoomTransportState;
  close: () => void;
};

export type WebSocketRoomTransportActionResult =
  | {
      ok: true;
      playerId: string;
      sessionToken: string;
      clientMessageId: string;
      acceptedMessage: Extract<RoomSocketServerMessage, { type: "actionAccepted" }>;
      state: WebSocketRoomTransportState;
    }
  | {
      ok: false;
      clientMessageId: string;
      rejectedMessage?: Extract<RoomSocketServerMessage, { type: "actionRejected" }>;
      reason: "actionRejected" | "missingSessionToken" | "timeout" | "closed";
      state: WebSocketRoomTransportState;
    };

export type WebSocketRoomTransportOptions = {
  url?: string;
  roomId: string;
  webSocketFactory?: (url: string) => WebSocketLike;
  actionTimeoutMs?: number;
};

export type WebSocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: "open" | "message" | "close" | "error", listener: (event: WebSocketLikeEvent) => void) => void;
};

export type WebSocketLikeEvent = {
  data?: unknown;
};

const defaultUrl = "ws://127.0.0.1:8787";
const openReadyState = 1;

export async function createWebSocketRoomTransport(
  options: WebSocketRoomTransportOptions,
): Promise<WebSocketRoomTransport> {
  const url = options.url ?? defaultUrl;
  const socket = (options.webSocketFactory ?? defaultWebSocketFactory)(url);
  const actionTimeoutMs = options.actionTimeoutMs ?? 3_000;
  const actionWaiters = new Map<string, (message: RoomSocketServerMessage) => void>();
  const snapshotWaiters: Array<{
    playerId: string;
    resolve: (view: ClientVisibleRoomState) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];
  const messageCountWaiters: Array<{
    count: number;
    resolve: (messages: RoomSocketServerMessage[]) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];
  let state: WebSocketRoomTransportState = {
    url,
    roomId: options.roomId,
    status: "connecting",
    nextClientMessageNumber: 1,
    sessionTokenByPlayerId: {},
    snapshotByPlayerId: {},
    serverNowByPlayerId: {},
    snapshotReceivedAtByPlayerId: {},
    messages: [],
    acceptedMessages: [],
    rejectedMessages: [],
  };

  socket.addEventListener("open", () => {
    state = { ...state, status: "open" };
  });
  socket.addEventListener("close", () => {
    state = { ...state, status: "closed" };
  });
  socket.addEventListener("message", (event) => {
    const message = parseServerMessage(event.data);
    state = applyServerMessage(state, message);
    resolveActionWaiter(actionWaiters, message);
    resolveSnapshotWaiters(snapshotWaiters, message);
    resolveMessageCountWaiters(messageCountWaiters, state.messages);
  });

  await waitForSocketOpen(socket, actionTimeoutMs);
  state = { ...state, status: "open" };

  function sendRoomMessage(message: RoomSocketClientMessage): Promise<WebSocketRoomTransportActionResult> {
    const clientMessageId = message.clientMessageId;
    state = {
      ...state,
      nextClientMessageNumber: state.nextClientMessageNumber + 1,
    };

    if (socket.readyState !== openReadyState) {
      return Promise.resolve({ ok: false, clientMessageId, reason: "closed", state });
    }

    const actionResult = waitForActionResult(actionWaiters, clientMessageId, actionTimeoutMs, () => state);
    socket.send(JSON.stringify(message));
    return actionResult;
  }

  function sendSessionMessage(
    playerId: string,
    message: Omit<
      Extract<
        RoomSocketClientMessage,
        {
          type:
            | "takeSeat"
            | "toggleReady"
            | "startRound"
            | "readyNextRound"
            | "startNextRound"
            | "finishGame"
            | "chooseMissingSuit"
            | "drawTile"
            | "drawGangTile"
            | "discardTile"
            | "passClaim"
            | "claimHu"
            | "claimSelfDrawHu"
            | "claimPeng"
            | "claimMingGang"
            | "claimAnGang"
            | "claimBaGang"
            | "passQiangGang"
            | "claimQiangGangHu";
        }
      >,
      "protocolVersion" | "clientMessageId" | "roomId" | "sessionToken"
    >,
  ): Promise<WebSocketRoomTransportActionResult> {
    const clientMessageId = nextClientMessageId(state);
    const sessionToken = state.sessionTokenByPlayerId[playerId];

    if (sessionToken === undefined) {
      state = {
        ...state,
        nextClientMessageNumber: state.nextClientMessageNumber + 1,
      };

      return Promise.resolve({
        ok: false,
        clientMessageId,
        reason: "missingSessionToken",
        state,
      });
    }

    return sendRoomMessage({
      protocolVersion: 1,
      clientMessageId,
      roomId: state.roomId,
      sessionToken,
      ...message,
    } as RoomSocketClientMessage);
  }

  return {
    createRoomSession: (input) =>
      sendRoomMessage({
        protocolVersion: 1,
        clientMessageId: nextClientMessageId(state),
        type: "createRoom",
        payload: { roomId: state.roomId, displayName: input.displayName },
      }),
    joinRoomSession: (input) =>
      sendRoomMessage({
        protocolVersion: 1,
        clientMessageId: nextClientMessageId(state),
        roomId: state.roomId,
        type: "joinRoom",
        payload: { displayName: input.displayName },
      }),
    resumeSession: (input) =>
      sendRoomMessage({
        protocolVersion: 1,
        clientMessageId: nextClientMessageId(state),
        roomId: state.roomId,
        sessionToken: input.sessionToken,
        type: "resumeSession",
        payload: { lastSeenEventId: input.lastSeenEventId },
      }),
    takeSeat: (playerId, seatId) => sendSessionMessage(playerId, { type: "takeSeat", payload: { seatId } }),
    toggleReady: (playerId) => sendSessionMessage(playerId, { type: "toggleReady", payload: {} }),
    startRound: (playerId, dealer) => sendSessionMessage(playerId, { type: "startRound", payload: { dealer } }),
    readyNextRound: (playerId) => sendSessionMessage(playerId, { type: "readyNextRound", payload: {} }),
    startNextRound: (playerId) => sendSessionMessage(playerId, { type: "startNextRound", payload: {} }),
    finishGame: (playerId) => sendSessionMessage(playerId, { type: "finishGame", payload: {} }),
    chooseMissingSuit: (playerId, suit) => sendSessionMessage(playerId, { type: "chooseMissingSuit", payload: { suit } }),
    drawTile: (playerId) => sendSessionMessage(playerId, { type: "drawTile", payload: {} }),
    drawGangTile: (playerId) => sendSessionMessage(playerId, { type: "drawGangTile", payload: {} }),
    discardTile: (playerId, tile) => sendSessionMessage(playerId, { type: "discardTile", payload: { tile } }),
    passClaim: (playerId) => sendSessionMessage(playerId, { type: "passClaim", payload: {} }),
    claimHu: (playerId) => sendSessionMessage(playerId, { type: "claimHu", payload: {} }),
    claimSelfDrawHu: (playerId) => sendSessionMessage(playerId, { type: "claimSelfDrawHu", payload: {} }),
    claimPeng: (playerId) => sendSessionMessage(playerId, { type: "claimPeng", payload: {} }),
    claimMingGang: (playerId) => sendSessionMessage(playerId, { type: "claimMingGang", payload: {} }),
    claimAnGang: (playerId, tile) => sendSessionMessage(playerId, { type: "claimAnGang", payload: { tile } }),
    claimBaGang: (playerId, tile) => sendSessionMessage(playerId, { type: "claimBaGang", payload: { tile } }),
    passQiangGang: (playerId) => sendSessionMessage(playerId, { type: "passQiangGang", payload: {} }),
    claimQiangGangHu: (playerId) => sendSessionMessage(playerId, { type: "claimQiangGangHu", payload: {} }),
    waitForSnapshot: (playerId, timeoutMs = actionTimeoutMs) => waitForSnapshot(state, snapshotWaiters, playerId, timeoutMs),
    waitForMessageCount: (count, timeoutMs = actionTimeoutMs) =>
      waitForMessageCount(state, messageCountWaiters, count, timeoutMs),
    getClientView: (playerId) => state.snapshotByPlayerId[playerId],
    getSessionToken: (playerId) => state.sessionTokenByPlayerId[playerId],
    getState: () => state,
    close: () => socket.close(),
  };
}

function defaultWebSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url);
}

function applyServerMessage(
  state: WebSocketRoomTransportState,
  message: RoomSocketServerMessage,
): WebSocketRoomTransportState {
  const messages = [...state.messages, message];

  if (message.type === "actionAccepted") {
    return {
      ...state,
      messages,
      sessionTokenByPlayerId: {
        ...state.sessionTokenByPlayerId,
        [message.payload.playerId]: message.recipientSessionToken,
      },
      acceptedMessages: [...state.acceptedMessages, message],
    };
  }

  if (message.type === "actionRejected") {
    return {
      ...state,
      messages,
      rejectedMessages: [...state.rejectedMessages, message],
    };
  }

  return {
    ...state,
    messages,
    snapshotByPlayerId: {
      ...state.snapshotByPlayerId,
      [message.payload.playerId]: message.payload.view,
    },
    serverNowByPlayerId: {
      ...state.serverNowByPlayerId,
      [message.payload.playerId]: message.payload.serverNow,
    },
    snapshotReceivedAtByPlayerId: {
      ...state.snapshotReceivedAtByPlayerId,
      [message.payload.playerId]: Date.now(),
    },
  };
}

function resolveActionWaiter(
  waiters: Map<string, (message: RoomSocketServerMessage) => void>,
  message: RoomSocketServerMessage,
) {
  if (message.type !== "actionAccepted" && message.type !== "actionRejected") {
    return;
  }

  const waiter = waiters.get(message.payload.clientMessageId);

  if (waiter === undefined) {
    return;
  }

  waiters.delete(message.payload.clientMessageId);
  waiter(message);
}

function resolveSnapshotWaiters(waiters: WebSocketRoomTransportSnapshotWaiter[], message: RoomSocketServerMessage) {
  if (message.type !== "roomSnapshot") {
    return;
  }

  for (const waiter of [...waiters]) {
    if (waiter.playerId !== message.payload.playerId) {
      continue;
    }

    clearTimeout(waiter.timeout);
    waiters.splice(waiters.indexOf(waiter), 1);
    waiter.resolve(message.payload.view);
  }
}

function resolveMessageCountWaiters(
  waiters: WebSocketRoomTransportMessageCountWaiter[],
  messages: RoomSocketServerMessage[],
) {
  for (const waiter of [...waiters]) {
    if (messages.length < waiter.count) {
      continue;
    }

    clearTimeout(waiter.timeout);
    waiters.splice(waiters.indexOf(waiter), 1);
    waiter.resolve(messages);
  }
}

type WebSocketRoomTransportSnapshotWaiter = {
  playerId: string;
  resolve: (view: ClientVisibleRoomState) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type WebSocketRoomTransportMessageCountWaiter = {
  count: number;
  resolve: (messages: RoomSocketServerMessage[]) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

function waitForActionResult(
  waiters: Map<string, (message: RoomSocketServerMessage) => void>,
  clientMessageId: string,
  timeoutMs: number,
  getState: () => WebSocketRoomTransportState,
): Promise<WebSocketRoomTransportActionResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      waiters.delete(clientMessageId);
      resolve({ ok: false, clientMessageId, reason: "timeout", state: getState() });
    }, timeoutMs);

    waiters.set(clientMessageId, (message) => {
      clearTimeout(timeout);

      if (message.type === "actionRejected") {
        resolve({
          ok: false,
          clientMessageId,
          reason: "actionRejected",
          rejectedMessage: message,
          state: getState(),
        });
        return;
      }

      if (message.type === "actionAccepted") {
        resolve({
          ok: true,
          playerId: message.payload.playerId,
          sessionToken: message.recipientSessionToken,
          clientMessageId,
          acceptedMessage: message,
          state: getState(),
        });
      }
    });
  });
}

function waitForSnapshot(
  state: WebSocketRoomTransportState,
  waiters: WebSocketRoomTransportSnapshotWaiter[],
  playerId: string,
  timeoutMs: number,
): Promise<ClientVisibleRoomState> {
  const existing = state.snapshotByPlayerId[playerId];

  if (existing !== undefined) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const index = waiters.findIndex((waiter) => waiter.playerId === playerId);

      if (index !== -1) {
        waiters.splice(index, 1);
      }

      reject(new Error(`Timed out waiting for ${playerId} snapshot.`));
    }, timeoutMs);

    waiters.push({ playerId, resolve, reject, timeout });
  });
}

function waitForMessageCount(
  state: WebSocketRoomTransportState,
  waiters: WebSocketRoomTransportMessageCountWaiter[],
  count: number,
  timeoutMs: number,
): Promise<RoomSocketServerMessage[]> {
  if (state.messages.length >= count) {
    return Promise.resolve(state.messages);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const index = waiters.findIndex((waiter) => waiter.count === count);

      if (index !== -1) {
        waiters.splice(index, 1);
      }

      reject(new Error(`Timed out waiting for ${count} WebSocket messages.`));
    }, timeoutMs);

    waiters.push({ count, resolve, reject, timeout });
  });
}

async function waitForSocketOpen(socket: WebSocketLike, timeoutMs: number): Promise<void> {
  if (socket.readyState === openReadyState) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for WebSocket to open.")), timeoutMs);

    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket connection failed."));
    });
  });
}

function parseServerMessage(data: unknown): RoomSocketServerMessage {
  if (typeof data === "string") {
    return JSON.parse(data) as RoomSocketServerMessage;
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(data)) as RoomSocketServerMessage;
  }

  return JSON.parse(String(data)) as RoomSocketServerMessage;
}

function nextClientMessageId(state: WebSocketRoomTransportState): string {
  return `ws-${state.nextClientMessageNumber}`;
}
