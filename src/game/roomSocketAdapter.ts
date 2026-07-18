import {
  createSecureSessionToken,
  createRoomSession,
  getClientRoomView,
  handleRoomAction,
  joinRoomSession,
  markSessionDisconnected,
  resumeRoomSession,
  tickRoomDeadlines,
  type NowFactory,
  type RoomAction,
  type RoomServiceState,
  type SessionTokenFactory,
} from "./roomService.ts";
import {
  toClientVisibleRoomEvent,
  type ClientRoomEvent,
  type ClientVisibleRoomState,
  type RoomEvent,
} from "./room.ts";

export type RoomSocketAdapterState = {
  rooms: RoomSocketRoomState[];
  roomSeedFactory: RoomSeedFactory;
  sessionTokenFactory: SessionTokenFactory;
  nowFactory: NowFactory;
  responseWindowTimeoutMs: number;
  turnActionTimeoutMs: number;
};

export type RoomSeedFactory = () => string;

export type RoomSocketAdapterOptions = {
  roomSeedFactory?: RoomSeedFactory;
  sessionTokenFactory?: SessionTokenFactory;
  nowFactory?: NowFactory;
  responseWindowTimeoutMs?: number;
  turnActionTimeoutMs?: number;
};

export type RoomSocketRoomState = {
  roomId: string;
  service: RoomServiceState;
};

export type RoomSocketClientMessage = ClientContractMessage;

export type RoomSocketServerMessage =
  | {
      protocolVersion: 1;
      serverEventId: number;
      roomId: string;
      type: "roomSnapshot";
      payload: RoomSnapshotPayload;
    }
  | {
      protocolVersion: 1;
      serverEventId: number;
      roomId: string;
      recipientSessionToken: string;
      type: "actionAccepted";
      payload: { clientMessageId: string; playerId: string };
    }
  | {
      protocolVersion: 1;
      serverEventId: number;
      roomId: string;
      recipientSessionToken: string | null;
      type: "actionRejected";
      payload: { clientMessageId: string; code: RoomSocketErrorCode; message: string };
    };

export type RoomSnapshotPayload = {
  view: ClientVisibleRoomState;
  playerId: string;
  lastEventId: number;
  serverNow: number;
  events: ClientRoomEvent[];
};

export type RoomSocketErrorCode = ClientContractErrorCode;

export type RoomSocketAdapterResult = {
  adapter: RoomSocketAdapterState;
  messages: RoomSocketServerMessage[];
};

export type RoomSocketDeadlineTickResult = RoomSocketAdapterResult & {
  expiredWindowIds: string[];
};

export type RoomSocketPresenceResult = RoomSocketAdapterResult & {
  changed: boolean;
};

export function createRoomSocketAdapterState(options: RoomSocketAdapterOptions = {}): RoomSocketAdapterState {
  return {
    rooms: [],
    roomSeedFactory: options.roomSeedFactory ?? createSecureRoomSeed,
    sessionTokenFactory: options.sessionTokenFactory ?? createSecureSessionToken,
    nowFactory: options.nowFactory ?? Date.now,
    responseWindowTimeoutMs: options.responseWindowTimeoutMs ?? 15_000,
    turnActionTimeoutMs: options.turnActionTimeoutMs ?? 30_000,
  };
}

export function handleRoomSocketMessage(
  adapter: RoomSocketAdapterState,
  message: RoomSocketClientMessage,
): RoomSocketAdapterResult {
  if (message.type === "createRoom") {
    return handleCreateRoom(adapter, message);
  }

  const room = findRoom(adapter, message.roomId);

  if (room === undefined) {
    return {
      adapter,
      messages: [rejectedMessage(message, message.roomId, sessionTokenFromMessage(message), "roomNotFound")],
    };
  }

  if (message.type === "joinRoom") {
    return handleJoinRoom(adapter, room.service, message);
  }

  if (message.type === "resumeSession") {
    return handleResumeSession(adapter, room.service, message);
  }

  return handleRoomServiceAction(adapter, room.service, message, clientMessageToRoomAction(message));
}

export function tickRoomSocketDeadlines(
  adapter: RoomSocketAdapterState,
  now = adapter.nowFactory(),
): RoomSocketDeadlineTickResult {
  let nextAdapter = adapter;
  const messages: RoomSocketServerMessage[] = [];
  const expiredWindowIds: string[] = [];

  for (const room of adapter.rooms) {
    const result = tickRoomDeadlines(room.service, now);

    if (!result.changed || result.expiredWindowId === null) {
      continue;
    }

    nextAdapter = upsertRoom(nextAdapter, result.service);
    expiredWindowIds.push(result.expiredWindowId);
    messages.push(...snapshotMessagesForSessions(result.service, result.events, now));
  }

  return { adapter: nextAdapter, messages, expiredWindowIds };
}

export function markRoomSocketSessionDisconnected(
  adapter: RoomSocketAdapterState,
  roomId: string,
  sessionToken: string,
): RoomSocketPresenceResult {
  const room = findRoom(adapter, roomId);

  if (room === undefined) {
    return { adapter, messages: [], changed: false };
  }

  const result = markSessionDisconnected(room.service, sessionToken);

  if (!result.ok || !result.changed) {
    return { adapter, messages: [], changed: false };
  }

  return {
    adapter: upsertRoom(adapter, result.service),
    messages: snapshotMessagesForSessions(result.service, result.events),
    changed: true,
  };
}

function handleCreateRoom(
  adapter: RoomSocketAdapterState,
  message: Extract<RoomSocketClientMessage, { type: "createRoom" }>,
): RoomSocketAdapterResult {
  if (findRoom(adapter, message.payload.roomId) !== undefined) {
    return {
      adapter,
      messages: [rejectedMessage(message, message.payload.roomId, null, "roomAlreadyExists")],
    };
  }

  const result = createRoomSession(
    {
      roomId: message.payload.roomId,
      seed: adapter.roomSeedFactory(),
      displayName: message.payload.displayName,
    },
    {
      sessionTokenFactory: adapter.sessionTokenFactory,
      nowFactory: adapter.nowFactory,
      responseWindowTimeoutMs: adapter.responseWindowTimeoutMs,
      turnActionTimeoutMs: adapter.turnActionTimeoutMs,
    },
  );
  const nextAdapter = upsertRoom(adapter, result.service);

  return {
    adapter: nextAdapter,
    messages: [
      acceptedMessage(
        message,
        result.service.room.id,
        result.session.sessionToken,
        result.session.playerId,
        result.lastEventId,
      ),
      snapshotMessage(result.service, result.session.sessionToken, result.events),
    ],
  };
}

function handleJoinRoom(
  adapter: RoomSocketAdapterState,
  service: RoomServiceState,
  message: Extract<RoomSocketClientMessage, { type: "joinRoom" }>,
): RoomSocketAdapterResult {
  const result = joinRoomSession(service, message.payload);

  if (!result.ok) {
    return {
      adapter,
      messages: [rejectedMessage(message, service.room.id, null, result.reason)],
    };
  }

  const nextAdapter = upsertRoom(adapter, result.service);

  return {
    adapter: nextAdapter,
    messages: [
      acceptedMessage(
        message,
        result.service.room.id,
        result.session.sessionToken,
        result.session.playerId,
        result.lastEventId,
      ),
      ...snapshotMessagesForSessions(result.service, result.events),
    ],
  };
}

function handleResumeSession(
  adapter: RoomSocketAdapterState,
  service: RoomServiceState,
  message: Extract<RoomSocketClientMessage, { type: "resumeSession" }>,
): RoomSocketAdapterResult {
  const result = resumeRoomSession(service, {
    sessionToken: message.sessionToken,
    lastSeenEventId: message.payload.lastSeenEventId,
  });

  if (!result.ok) {
    return {
      adapter,
      messages: [rejectedMessage(message, service.room.id, message.sessionToken, result.reason)],
    };
  }

  const nextAdapter = upsertRoom(adapter, result.service);
  const presenceBroadcasts = result.presenceChanged
    ? result.service.sessions
        .filter((session) => session.sessionToken !== message.sessionToken)
        .map((session) => snapshotMessage(result.service, session.sessionToken, result.presenceEvents))
    : [];

  return {
    adapter: nextAdapter,
    messages: [
      acceptedMessage(
        message,
        result.service.room.id,
        message.sessionToken,
        result.session.playerId,
        result.lastEventId,
      ),
      snapshotMessage(result.service, message.sessionToken, result.missedEvents),
      ...presenceBroadcasts,
    ],
  };
}

function handleRoomServiceAction(
  adapter: RoomSocketAdapterState,
  service: RoomServiceState,
  message: Extract<
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
        | "exchangeGangYaoJi"
        | "passQiangGang"
        | "claimQiangGangHu";
    }
  >,
  action: RoomAction,
): RoomSocketAdapterResult {
  const result = handleRoomAction(service, message.sessionToken, action);

  if (!result.ok) {
    const serviceChanged = result.service !== service;
    const snapshotMessages = serviceChanged
      ? snapshotMessagesForSessions(
          result.service,
          result.service.room.eventLog.slice(service.lastEventId),
        )
      : result.reason === "staleAction"
        ? [snapshotMessage(result.service, message.sessionToken, [])]
        : [];
    return {
      adapter: serviceChanged ? upsertRoom(adapter, result.service) : adapter,
      messages: [
        rejectedMessage(message, result.service.room.id, message.sessionToken, result.reason),
        ...snapshotMessages,
      ],
    };
  }

  const nextAdapter = upsertRoom(adapter, result.service);

  return {
    adapter: nextAdapter,
    messages: [
      acceptedMessage(
        message,
        result.service.room.id,
        message.sessionToken,
        result.session.playerId,
        result.lastEventId,
      ),
      ...snapshotMessagesForSessions(result.service, result.events),
    ],
  };
}

function clientMessageToRoomAction(
  message: Extract<
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
        | "exchangeGangYaoJi"
        | "passQiangGang"
        | "claimQiangGangHu";
    }
  >,
): RoomAction {
  if (message.type === "takeSeat") {
    return { type: "takeSeat", seatId: message.payload.seatId };
  }

  if (message.type === "toggleReady") {
    return { type: "toggleReady" };
  }

  if (message.type === "startRound") {
    return { type: "startRound", dealer: message.payload.dealer };
  }

  if (message.type === "readyNextRound") {
    return { type: "readyNextRound", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "startNextRound") {
    return { type: "startNextRound", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "finishGame") {
    return { type: "finishGame", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "drawTile") {
    return { type: "drawTile", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "drawGangTile") {
    return { type: "drawGangTile", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "discardTile") {
    return {
      type: "discardTile",
      tile: message.payload.tile,
      tileId: message.payload.tileId,
      expectedActionId: message.payload.expectedActionId,
    };
  }

  if (message.type === "passClaim") {
    return { type: "passClaim", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "claimHu") {
    return { type: "claimHu", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "claimSelfDrawHu") {
    return { type: "claimSelfDrawHu", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "claimPeng") {
    return { type: "claimPeng", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "claimMingGang") {
    return { type: "claimMingGang", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "claimAnGang") {
    return { type: "claimAnGang", tile: message.payload.tile, expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "claimBaGang") {
    return message.payload.candidateId !== undefined
      ? { type: "claimBaGang", candidateId: message.payload.candidateId, expectedActionId: message.payload.expectedActionId }
      : { type: "claimBaGang", tile: message.payload.tile!, expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "exchangeGangYaoJi") {
    return {
      type: "exchangeGangYaoJi",
      candidateId: message.payload.candidateId,
      expectedActionId: message.payload.expectedActionId,
    };
  }

  if (message.type === "passQiangGang") {
    return { type: "passQiangGang", expectedActionId: message.payload.expectedActionId };
  }

  if (message.type === "claimQiangGangHu") {
    return { type: "claimQiangGangHu", expectedActionId: message.payload.expectedActionId };
  }

  return { type: "chooseMissingSuit", suit: message.payload.suit };
}

function snapshotMessagesForSessions(
  service: RoomServiceState,
  events: RoomEvent[],
  serverNow = service.nowFactory(),
): RoomSocketServerMessage[] {
  return service.sessions.map((session) => snapshotMessage(service, session.sessionToken, events, serverNow));
}

function snapshotMessage(
  service: RoomServiceState,
  sessionToken: string,
  events: RoomEvent[],
  serverNow = service.nowFactory(),
): RoomSocketServerMessage {
  const view = getClientRoomView(service, sessionToken, serverNow);

  if (!view.ok) {
    throw new Error(view.reason);
  }

  return {
    protocolVersion: 1,
    serverEventId: service.lastEventId,
    roomId: service.room.id,
    type: "roomSnapshot",
    payload: {
      view: view.view,
      playerId: view.session.playerId,
      lastEventId: service.lastEventId,
      serverNow,
      events: events.map((event) => toClientVisibleRoomEvent(event, view.view.localSeatId)),
    },
  };
}

function acceptedMessage(
  message: RoomSocketClientMessage,
  roomId: string,
  sessionToken: string,
  playerId: string,
  serverEventId: number,
): RoomSocketServerMessage {
  return {
    protocolVersion: 1,
    serverEventId,
    roomId,
    recipientSessionToken: sessionToken,
    type: "actionAccepted",
    payload: { clientMessageId: message.clientMessageId, playerId },
  };
}

function rejectedMessage(
  message: RoomSocketClientMessage,
  roomId: string,
  sessionToken: string | null,
  code: RoomSocketErrorCode,
): RoomSocketServerMessage {
  return {
    protocolVersion: 1,
    serverEventId: 0,
    roomId,
    recipientSessionToken: sessionToken,
    type: "actionRejected",
    payload: {
      clientMessageId: message.clientMessageId,
      code,
      message: errorMessage(code),
    },
  };
}

function errorMessage(code: RoomSocketErrorCode): string {
  const messages: Record<RoomSocketErrorCode, string> = {
    roomNotFound: "Room was not found.",
    roomAlreadyExists: "Room already exists.",
    invalidSession: "Session is invalid.",
    sessionDisconnected: "Session is disconnected; resume it before sending actions.",
    roomAlreadyStarted: "Room has already started.",
    playerAlreadyJoined: "Player already joined.",
    playerNotInRoom: "Player is not in the room.",
    seatOccupied: "Seat is already occupied.",
    playerAlreadySeated: "Player is already seated.",
    playerNotSeated: "Player is not seated.",
    notEnoughPlayers: "Not enough players are seated.",
    notAllPlayersReady: "Not all players are ready.",
    roundNotStarted: "Round has not started.",
    missingSuitAlreadyChosen: "Missing suit has already been chosen.",
    missingSuitNotSet: "Missing suit has not been chosen.",
    notCurrentPlayer: "It is not this player's turn.",
    notDrawPhase: "The current player is not in a draw phase.",
    notDiscardPhase: "The current player is not in a discard phase.",
    roundFinished: "Round is already finished.",
    wallEmpty: "Wall is empty.",
    playerAlreadyWon: "Player has already won.",
    tileNotInHand: "Tile is not in hand.",
    mustDiscardMissingSuitFirst: "Missing-suit tiles must be discarded first.",
    cannotDiscardYaoJi: "Yao ji cannot be actively discarded.",
    claimWindowOpen: "A claim window is currently open.",
    gangDrawPending: "A gang draw is pending.",
    noClaimWindow: "There is no active claim window.",
    noQiangGangWindow: "There is no active rob-kong claim window.",
    noGangDraw: "There is no active gang draw.",
    claimNotAllowed: "This player cannot respond to the claim window.",
    claimAlreadyResponded: "This player has already responded to the claim window.",
    cannotAnGang: "This player cannot claim an gang with this tile.",
    cannotBaGang: "This player cannot claim ba gang with this tile.",
    cannotExchangeGangYaoJi: "This player cannot exchange yao ji in this gang.",
    roundNotFinished: "The current round has not reached the between-rounds state.",
    gameFinished: "The game has already finished.",
    nextDealerUnavailable: "The next dealer decision is unavailable.",
    staleAction: "This action is stale; refresh the room snapshot before trying again.",
    cannotHu: "This player cannot claim hu on the discarded tile.",
    cannotPeng: "This player cannot claim peng on the discarded tile.",
    cannotMingGang: "This player cannot claim ming gang on the discarded tile.",
  };
  return messages[code];
}

function sessionTokenFromMessage(message: RoomSocketClientMessage): string | null {
  return "sessionToken" in message ? message.sessionToken : null;
}

function findRoom(adapter: RoomSocketAdapterState, roomId: string): RoomSocketRoomState | undefined {
  return adapter.rooms.find((room) => room.roomId === roomId);
}

function upsertRoom(adapter: RoomSocketAdapterState, service: RoomServiceState): RoomSocketAdapterState {
  const roomState = { roomId: service.room.id, service };
  const exists = adapter.rooms.some((room) => room.roomId === service.room.id);

  return {
    ...adapter,
    rooms: exists
      ? adapter.rooms.map((room) => (room.roomId === service.room.id ? roomState : room))
      : [...adapter.rooms, roomState],
  };
}

function createSecureRoomSeed(): string {
  return `round-${globalThis.crypto.randomUUID()}`;
}
import type {
  RoomSocketClientMessage as ClientContractMessage,
  RoomSocketErrorCode as ClientContractErrorCode,
} from "@leshan-mahjong/client-core";
