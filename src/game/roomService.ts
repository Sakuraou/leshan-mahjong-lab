import {
  claimHu,
  claimPeng,
  chooseMissingSuit,
  createRoom,
  discardRoomTile,
  drawRoomTile,
  expireClaimWindow,
  joinRoom,
  passClaim,
  startRoomRound,
  takeSeat,
  toggleReady,
  toClientVisibleRoomState,
  type ClaimHuResult,
  type ClaimPengResult,
  type ChooseMissingSuitResult,
  type ClientVisibleRoomState,
  type DiscardRoomTileResult,
  type DrawRoomTileResult,
  type ExpireClaimWindowResult,
  type JoinRoomResult,
  type PassClaimResult,
  type RoomEvent,
  type RoomState,
  type StartRoomRoundResult,
  type TakeSeatResult,
  type ToggleReadyResult,
} from "./room.ts";
import type { PlayerId, Suit, Tile } from "./types.ts";

export type RoomSession = {
  sessionToken: string;
  playerId: string;
  displayName: string;
  lastEventId: number;
};

export type RoomServiceState = {
  room: RoomState;
  sessions: RoomSession[];
  lastEventId: number;
  nextPlayerNumber: number;
  nextSessionNumber: number;
};

export type CreateRoomSessionInput = {
  roomId: string;
  seed: string;
  displayName: string;
};

export type JoinRoomSessionInput = {
  displayName: string;
};

export type RoomAction =
  | { type: "takeSeat"; seatId: PlayerId }
  | { type: "toggleReady" }
  | { type: "startRound"; dealer?: PlayerId }
  | { type: "chooseMissingSuit"; suit: Suit }
  | { type: "drawTile" }
  | { type: "discardTile"; tile: Tile }
  | { type: "passClaim" }
  | { type: "claimHu" }
  | { type: "claimPeng" }
  | { type: "expireClaimWindow" };

export type RoomServiceError =
  | "invalidSession"
  | JoinRoomResult["reason"]
  | TakeSeatResult["reason"]
  | ToggleReadyResult["reason"]
  | StartRoomRoundResult["reason"]
  | ChooseMissingSuitResult["reason"]
  | DrawRoomTileResult["reason"]
  | DiscardRoomTileResult["reason"]
  | ClaimHuResult["reason"]
  | ClaimPengResult["reason"]
  | PassClaimResult["reason"]
  | ExpireClaimWindowResult["reason"];

export type RoomServiceResponse = {
  service: RoomServiceState;
  session: RoomSession;
  view: ClientVisibleRoomState;
  lastEventId: number;
  events: RoomEvent[];
};

export type RoomServiceResult =
  | ({ ok: true } & RoomServiceResponse)
  | { ok: false; reason: RoomServiceError; service: RoomServiceState };

export type CreateRoomSessionResult = { ok: true } & RoomServiceResponse;

export type ResumeRoomSessionResult =
  | ({ ok: true } & RoomServiceResponse & { missedEvents: RoomEvent[] })
  | { ok: false; reason: "invalidSession"; service: RoomServiceState };

export type GetClientRoomViewResult =
  | { ok: true; session: RoomSession; view: ClientVisibleRoomState; lastEventId: number }
  | { ok: false; reason: "invalidSession" };

export function createRoomSession(input: CreateRoomSessionInput): CreateRoomSessionResult {
  const playerId = "player-1";
  const sessionToken = "session-1";
  const created = createRoom({ id: input.roomId, seed: input.seed });
  const joined = joinRoom(created, { playerId, displayName: input.displayName });

  if (!joined.ok) {
    throw new Error(joined.reason);
  }

  const lastEventId = joined.room.eventLog.length;
  const session: RoomSession = {
    sessionToken,
    playerId,
    displayName: input.displayName,
    lastEventId,
  };
  const service: RoomServiceState = {
    room: joined.room,
    sessions: [session],
    lastEventId,
    nextPlayerNumber: 2,
    nextSessionNumber: 2,
  };

  return {
    ok: true,
    service,
    session,
    view: toClientVisibleRoomState(joined.room, playerId),
    lastEventId,
    events: joined.room.eventLog,
  };
}

export function joinRoomSession(
  service: RoomServiceState,
  input: JoinRoomSessionInput,
): RoomServiceResult {
  const playerId = `player-${service.nextPlayerNumber}`;
  const sessionToken = `session-${service.nextSessionNumber}`;
  const result = joinRoom(service.room, { playerId, displayName: input.displayName });

  if (!result.ok) {
    return { ok: false, reason: result.reason, service };
  }

  const nextLastEventId = advanceEventId(service, result.room);
  const session: RoomSession = {
    sessionToken,
    playerId,
    displayName: input.displayName,
    lastEventId: nextLastEventId,
  };
  const nextService: RoomServiceState = {
    ...service,
    room: result.room,
    sessions: [...service.sessions, session],
    lastEventId: nextLastEventId,
    nextPlayerNumber: service.nextPlayerNumber + 1,
    nextSessionNumber: service.nextSessionNumber + 1,
  };

  return buildResponse(nextService, sessionToken, service.lastEventId);
}

export function handleRoomAction(
  service: RoomServiceState,
  sessionToken: string,
  action: RoomAction,
): RoomServiceResult {
  const session = findSession(service, sessionToken);

  if (session === undefined) {
    return { ok: false, reason: "invalidSession", service };
  }

  const result = applyRoomAction(service.room, session.playerId, action);

  if (!result.ok) {
    return { ok: false, reason: result.reason, service };
  }

  const nextLastEventId = advanceEventId(service, result.room);
  const nextService: RoomServiceState = {
    ...service,
    room: result.room,
    sessions: updateSessionLastEventId(service.sessions, sessionToken, nextLastEventId),
    lastEventId: nextLastEventId,
  };

  return buildResponse(nextService, sessionToken, service.lastEventId);
}

export function resumeRoomSession(
  service: RoomServiceState,
  input: { sessionToken: string; lastSeenEventId?: number },
): ResumeRoomSessionResult {
  const session = findSession(service, input.sessionToken);

  if (session === undefined) {
    return { ok: false, reason: "invalidSession", service };
  }

  const lastSeenEventId = input.lastSeenEventId ?? session.lastEventId;
  const missedEvents = service.room.eventLog.slice(lastSeenEventId);
  const nextService: RoomServiceState = {
    ...service,
    sessions: updateSessionLastEventId(service.sessions, input.sessionToken, service.lastEventId),
  };
  const nextSession = findSession(nextService, input.sessionToken)!;

  return {
    ok: true,
    service: nextService,
    session: nextSession,
    view: toClientVisibleRoomState(nextService.room, nextSession.playerId),
    lastEventId: nextService.lastEventId,
    events: missedEvents,
    missedEvents,
  };
}

export function getClientRoomView(
  service: RoomServiceState,
  sessionToken: string,
): GetClientRoomViewResult {
  const session = findSession(service, sessionToken);

  if (session === undefined) {
    return { ok: false, reason: "invalidSession" };
  }

  return {
    ok: true,
    session,
    view: toClientVisibleRoomState(service.room, session.playerId),
    lastEventId: service.lastEventId,
  };
}

function applyRoomAction(
  room: RoomState,
  playerId: string,
  action: RoomAction,
):
  | TakeSeatResult
  | ToggleReadyResult
  | StartRoomRoundResult
  | ChooseMissingSuitResult
  | DrawRoomTileResult
  | DiscardRoomTileResult
  | ClaimHuResult
  | ClaimPengResult
  | PassClaimResult
  | ExpireClaimWindowResult {
  if (action.type === "takeSeat") {
    return takeSeat(room, playerId, action.seatId);
  }

  if (action.type === "toggleReady") {
    return toggleReady(room, playerId);
  }

  if (action.type === "startRound") {
    return startRoomRound(room, action.dealer);
  }

  if (action.type === "drawTile") {
    return drawRoomTile(room, playerId);
  }

  if (action.type === "discardTile") {
    return discardRoomTile(room, playerId, action.tile);
  }

  if (action.type === "passClaim") {
    return passClaim(room, playerId);
  }

  if (action.type === "claimHu") {
    return claimHu(room, playerId);
  }

  if (action.type === "claimPeng") {
    return claimPeng(room, playerId);
  }

  if (action.type === "expireClaimWindow") {
    return expireClaimWindow(room);
  }

  return chooseMissingSuit(room, playerId, action.suit);
}

function buildResponse(
  service: RoomServiceState,
  sessionToken: string,
  previousLastEventId: number,
): RoomServiceResult {
  const session = findSession(service, sessionToken);

  if (session === undefined) {
    return { ok: false, reason: "invalidSession", service };
  }

  return {
    ok: true,
    service,
    session,
    view: toClientVisibleRoomState(service.room, session.playerId),
    lastEventId: service.lastEventId,
    events: service.room.eventLog.slice(previousLastEventId),
  };
}

function advanceEventId(service: RoomServiceState, nextRoom: RoomState): number {
  return service.lastEventId + Math.max(0, nextRoom.eventLog.length - service.room.eventLog.length);
}

function findSession(service: RoomServiceState, sessionToken: string): RoomSession | undefined {
  return service.sessions.find((session) => session.sessionToken === sessionToken);
}

function updateSessionLastEventId(
  sessions: RoomSession[],
  sessionToken: string,
  lastEventId: number,
): RoomSession[] {
  return sessions.map((session) => (session.sessionToken === sessionToken ? { ...session, lastEventId } : session));
}
