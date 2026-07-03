import {
  createRoomSession,
  getClientRoomView,
  handleRoomAction,
  joinRoomSession,
  resumeRoomSession,
  type RoomAction,
  type RoomServiceError,
  type RoomServiceState,
} from "./roomService.ts";
import type { ClientVisibleRoomState, RoomEvent } from "./room.ts";
import type { PlayerId, Suit, Tile } from "./types.ts";

export type RoomSocketAdapterState = {
  rooms: RoomSocketRoomState[];
};

export type RoomSocketRoomState = {
  roomId: string;
  service: RoomServiceState;
};

export type RoomSocketClientMessage =
  | {
      protocolVersion: 1;
      clientMessageId: string;
      type: "createRoom";
      payload: { roomId: string; seed: string; displayName: string };
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      type: "joinRoom";
      payload: { displayName: string };
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "takeSeat";
      payload: { seatId: PlayerId };
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "toggleReady";
      payload: Record<string, never>;
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "startRound";
      payload: { dealer?: PlayerId };
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "chooseMissingSuit";
      payload: { suit: Suit };
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "drawTile";
      payload: Record<string, never>;
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "discardTile";
      payload: { tile: Tile };
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "passClaim";
      payload: Record<string, never>;
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "claimHu";
      payload: Record<string, never>;
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "claimPeng";
      payload: Record<string, never>;
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "claimMingGang";
      payload: Record<string, never>;
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "claimAnGang";
      payload: { tile: Tile };
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "claimBaGang";
      payload: { tile: Tile };
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "expireClaimWindow";
      payload: Record<string, never>;
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "resumeSession";
      payload: { lastSeenEventId?: number };
    };

export type RoomSocketServerMessage =
  | {
      protocolVersion: 1;
      serverEventId: number;
      roomId: string;
      recipientSessionToken: string;
      type: "roomSnapshot";
      payload: RoomSnapshotPayload;
    }
  | {
      protocolVersion: 1;
      serverEventId: number;
      roomId: string;
      recipientSessionToken: string;
      type: "actionAccepted";
      payload: { clientMessageId: string };
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
  sessionToken: string;
  playerId: string;
  lastEventId: number;
  events: RoomEvent[];
};

export type RoomSocketErrorCode = "roomNotFound" | "roomAlreadyExists" | RoomServiceError;

export type RoomSocketAdapterResult = {
  adapter: RoomSocketAdapterState;
  messages: RoomSocketServerMessage[];
};

export function createRoomSocketAdapterState(): RoomSocketAdapterState {
  return { rooms: [] };
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

  const result = createRoomSession(message.payload);
  const nextAdapter = upsertRoom(adapter, result.service);

  return {
    adapter: nextAdapter,
    messages: [
      acceptedMessage(message, result.service.room.id, result.session.sessionToken, result.lastEventId),
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
      acceptedMessage(message, result.service.room.id, result.session.sessionToken, result.lastEventId),
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

  return {
    adapter: nextAdapter,
    messages: [
      acceptedMessage(message, result.service.room.id, message.sessionToken, result.lastEventId),
      snapshotMessage(result.service, message.sessionToken, result.missedEvents),
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
        | "chooseMissingSuit"
        | "drawTile"
        | "discardTile"
        | "passClaim"
        | "claimHu"
        | "claimPeng"
        | "claimMingGang"
        | "claimAnGang"
        | "claimBaGang"
        | "expireClaimWindow";
    }
  >,
  action: RoomAction,
): RoomSocketAdapterResult {
  const result = handleRoomAction(service, message.sessionToken, action);

  if (!result.ok) {
    return {
      adapter,
      messages: [rejectedMessage(message, service.room.id, message.sessionToken, result.reason)],
    };
  }

  const nextAdapter = upsertRoom(adapter, result.service);

  return {
    adapter: nextAdapter,
    messages: [
      acceptedMessage(message, result.service.room.id, message.sessionToken, result.lastEventId),
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
        | "chooseMissingSuit"
        | "drawTile"
        | "discardTile"
        | "passClaim"
        | "claimHu"
        | "claimPeng"
        | "claimMingGang"
        | "claimAnGang"
        | "claimBaGang"
        | "expireClaimWindow";
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

  if (message.type === "drawTile") {
    return { type: "drawTile" };
  }

  if (message.type === "discardTile") {
    return { type: "discardTile", tile: message.payload.tile };
  }

  if (message.type === "passClaim") {
    return { type: "passClaim" };
  }

  if (message.type === "claimHu") {
    return { type: "claimHu" };
  }

  if (message.type === "claimPeng") {
    return { type: "claimPeng" };
  }

  if (message.type === "claimMingGang") {
    return { type: "claimMingGang" };
  }

  if (message.type === "claimAnGang") {
    return { type: "claimAnGang", tile: message.payload.tile };
  }

  if (message.type === "claimBaGang") {
    return { type: "claimBaGang", tile: message.payload.tile };
  }

  if (message.type === "expireClaimWindow") {
    return { type: "expireClaimWindow" };
  }

  return { type: "chooseMissingSuit", suit: message.payload.suit };
}

function snapshotMessagesForSessions(service: RoomServiceState, events: RoomEvent[]): RoomSocketServerMessage[] {
  return service.sessions.map((session) => snapshotMessage(service, session.sessionToken, events));
}

function snapshotMessage(
  service: RoomServiceState,
  sessionToken: string,
  events: RoomEvent[],
): RoomSocketServerMessage {
  const view = getClientRoomView(service, sessionToken);

  if (!view.ok) {
    throw new Error(view.reason);
  }

  return {
    protocolVersion: 1,
    serverEventId: service.lastEventId,
    roomId: service.room.id,
    recipientSessionToken: sessionToken,
    type: "roomSnapshot",
    payload: {
      view: view.view,
      sessionToken,
      playerId: view.session.playerId,
      lastEventId: service.lastEventId,
      events,
    },
  };
}

function acceptedMessage(
  message: RoomSocketClientMessage,
  roomId: string,
  sessionToken: string,
  serverEventId: number,
): RoomSocketServerMessage {
  return {
    protocolVersion: 1,
    serverEventId,
    roomId,
    recipientSessionToken: sessionToken,
    type: "actionAccepted",
    payload: { clientMessageId: message.clientMessageId },
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
    wallEmpty: "Wall is empty.",
    playerAlreadyWon: "Player has already won.",
    tileNotInHand: "Tile is not in hand.",
    mustDiscardMissingSuitFirst: "Missing-suit tiles must be discarded first.",
    cannotDiscardYaoJi: "Yao ji cannot be actively discarded.",
    claimWindowOpen: "A claim window is currently open.",
    noClaimWindow: "There is no active claim window.",
    claimNotAllowed: "This player cannot respond to the claim window.",
    claimAlreadyResponded: "This player has already responded to the claim window.",
    cannotAnGang: "This player cannot claim an gang with this tile.",
    cannotBaGang: "This player cannot claim ba gang with this tile.",
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
    rooms: exists
      ? adapter.rooms.map((room) => (room.roomId === service.room.id ? roomState : room))
      : [...adapter.rooms, roomState],
  };
}
