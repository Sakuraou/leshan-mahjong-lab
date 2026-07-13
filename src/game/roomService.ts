import {
  claimAnGang,
  claimBaGang,
  claimHu,
  claimMingGang,
  claimPeng,
  claimQiangGangHu,
  claimSelfDrawHu,
  chooseMissingSuit,
  createRoom,
  discardRoomTile,
  drawGangTile,
  drawRoomTile,
  joinRoom,
  passClaim,
  passQiangGang,
  setPlayerPresence,
  startRoomRound,
  takeSeat,
  toggleReady,
  toClientVisibleRoomState,
  tickRoomStateDeadlines,
  DEFAULT_RESPONSE_WINDOW_TIMEOUT_MS,
  type ClaimHuResult,
  type ClaimAnGangResult,
  type ClaimBaGangResult,
  type ClaimMingGangResult,
  type ClaimPengResult,
  type ClaimQiangGangHuResult,
  type ClaimSelfDrawHuResult,
  type ChooseMissingSuitResult,
  type ClientVisibleRoomState,
  type DiscardRoomTileResult,
  type DrawGangTileResult,
  type DrawRoomTileResult,
  type JoinRoomResult,
  type PassClaimResult,
  type PassQiangGangResult,
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

export type SessionTokenFactory = () => string;
export type NowFactory = () => number;

export type CreateRoomSessionOptions = {
  sessionTokenFactory?: SessionTokenFactory;
  nowFactory?: NowFactory;
  responseWindowTimeoutMs?: number;
};

export type RoomServiceState = {
  room: RoomState;
  sessions: RoomSession[];
  lastEventId: number;
  nextPlayerNumber: number;
  sessionTokenFactory: SessionTokenFactory;
  nowFactory: NowFactory;
  responseWindowTimeoutMs: number;
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
  | { type: "drawGangTile" }
  | { type: "discardTile"; tile: Tile }
  | { type: "passClaim" }
  | { type: "claimHu" }
  | { type: "claimSelfDrawHu" }
  | { type: "claimPeng" }
  | { type: "claimMingGang" }
  | { type: "claimAnGang"; tile: Tile }
  | { type: "claimBaGang"; tile: Tile }
  | { type: "passQiangGang" }
  | { type: "claimQiangGangHu" };

export type RoomServiceError =
  | "invalidSession"
  | "sessionDisconnected"
  | ResultFailureReason<JoinRoomResult>
  | ResultFailureReason<TakeSeatResult>
  | ResultFailureReason<ToggleReadyResult>
  | ResultFailureReason<StartRoomRoundResult>
  | ResultFailureReason<ChooseMissingSuitResult>
  | ResultFailureReason<DrawGangTileResult>
  | ResultFailureReason<DrawRoomTileResult>
  | ResultFailureReason<DiscardRoomTileResult>
  | ResultFailureReason<ClaimAnGangResult>
  | ResultFailureReason<ClaimBaGangResult>
  | ResultFailureReason<ClaimHuResult>
  | ResultFailureReason<ClaimMingGangResult>
  | ResultFailureReason<ClaimPengResult>
  | ResultFailureReason<ClaimQiangGangHuResult>
  | ResultFailureReason<ClaimSelfDrawHuResult>
  | ResultFailureReason<PassClaimResult>
  | ResultFailureReason<PassQiangGangResult>;

type ResultFailureReason<TResult> = TResult extends { ok: false; reason: infer TReason } ? TReason : never;

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
  | ({
      ok: true;
      missedEvents: RoomEvent[];
      presenceChanged: boolean;
      presenceEvents: RoomEvent[];
    } & RoomServiceResponse)
  | { ok: false; reason: "invalidSession"; service: RoomServiceState };

export type RoomPresenceUpdateResult =
  | {
      ok: true;
      service: RoomServiceState;
      session: RoomSession;
      changed: boolean;
      events: RoomEvent[];
    }
  | { ok: false; reason: "invalidSession"; service: RoomServiceState };

export type GetClientRoomViewResult =
  | { ok: true; session: RoomSession; view: ClientVisibleRoomState; lastEventId: number }
  | { ok: false; reason: "invalidSession" };

export type RoomDeadlineTickResult = {
  service: RoomServiceState;
  changed: boolean;
  expiredWindowId: string | null;
  events: RoomEvent[];
};

export function createRoomSession(
  input: CreateRoomSessionInput,
  options: CreateRoomSessionOptions = {},
): CreateRoomSessionResult {
  const playerId = "player-1";
  const sessionTokenFactory = options.sessionTokenFactory ?? createSecureSessionToken;
  const nowFactory = options.nowFactory ?? Date.now;
  const responseWindowTimeoutMs = options.responseWindowTimeoutMs ?? DEFAULT_RESPONSE_WINDOW_TIMEOUT_MS;
  const sessionToken = issueSessionToken(sessionTokenFactory, []);
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
    sessionTokenFactory,
    nowFactory,
    responseWindowTimeoutMs,
  };

  return {
    ok: true,
    service,
    session,
    view: toClientVisibleRoomState(joined.room, playerId, nowFactory()),
    lastEventId,
    events: joined.room.eventLog,
  };
}

export function joinRoomSession(
  service: RoomServiceState,
  input: JoinRoomSessionInput,
): RoomServiceResult {
  const playerId = `player-${service.nextPlayerNumber}`;
  const sessionToken = issueSessionToken(service.sessionTokenFactory, service.sessions);
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

  const member = service.room.members.find((value) => value.playerId === session.playerId);

  if (member?.connected === false) {
    return { ok: false, reason: "sessionDisconnected", service };
  }

  const now = service.nowFactory();
  const result = applyRoomAction(service, session.playerId, action, now);

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

  return buildResponse(nextService, sessionToken, service.lastEventId, now);
}

export function tickRoomDeadlines(
  service: RoomServiceState,
  now = service.nowFactory(),
): RoomDeadlineTickResult {
  const result = tickRoomStateDeadlines(service.room, now);

  if (!result.changed) {
    return { service, changed: false, expiredWindowId: null, events: [] };
  }

  const nextLastEventId = advanceEventId(service, result.room);
  const nextService: RoomServiceState = {
    ...service,
    room: result.room,
    lastEventId: nextLastEventId,
  };

  return {
    service: nextService,
    changed: true,
    expiredWindowId: result.expiredWindowId,
    events: result.room.eventLog.slice(service.lastEventId),
  };
}

export function markSessionDisconnected(
  service: RoomServiceState,
  sessionToken: string,
): RoomPresenceUpdateResult {
  return updateSessionPresence(service, sessionToken, false, "connectionClosed");
}

export function markSessionConnected(
  service: RoomServiceState,
  sessionToken: string,
): RoomPresenceUpdateResult {
  return updateSessionPresence(service, sessionToken, true, "sessionResumed");
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
  const presence = markSessionConnected(service, input.sessionToken);

  if (!presence.ok) {
    return presence;
  }

  const missedEvents = presence.service.room.eventLog.slice(lastSeenEventId);
  const nextService: RoomServiceState = {
    ...presence.service,
    sessions: updateSessionLastEventId(
      presence.service.sessions,
      input.sessionToken,
      presence.service.lastEventId,
    ),
  };
  const nextSession = findSession(nextService, input.sessionToken)!;

  return {
    ok: true,
    service: nextService,
    session: nextSession,
    view: toClientVisibleRoomState(nextService.room, nextSession.playerId, nextService.nowFactory()),
    lastEventId: nextService.lastEventId,
    events: missedEvents,
    missedEvents,
    presenceChanged: presence.changed,
    presenceEvents: presence.events,
  };
}

export function getClientRoomView(
  service: RoomServiceState,
  sessionToken: string,
  now = service.nowFactory(),
): GetClientRoomViewResult {
  const session = findSession(service, sessionToken);

  if (session === undefined) {
    return { ok: false, reason: "invalidSession" };
  }

  return {
    ok: true,
    session,
    view: toClientVisibleRoomState(service.room, session.playerId, now),
    lastEventId: service.lastEventId,
  };
}

function applyRoomAction(
  service: RoomServiceState,
  playerId: string,
  action: RoomAction,
  now: number,
):
  | TakeSeatResult
  | ToggleReadyResult
  | StartRoomRoundResult
  | ChooseMissingSuitResult
  | DrawGangTileResult
  | DrawRoomTileResult
  | DiscardRoomTileResult
  | ClaimAnGangResult
  | ClaimBaGangResult
  | ClaimHuResult
  | ClaimMingGangResult
  | ClaimPengResult
  | ClaimQiangGangHuResult
  | ClaimSelfDrawHuResult
  | PassClaimResult
  | PassQiangGangResult {
  const room = service.room;
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

  if (action.type === "drawGangTile") {
    return drawGangTile(room, playerId);
  }

  if (action.type === "discardTile") {
    return discardRoomTile(room, playerId, action.tile, {
      now,
      timeoutMs: service.responseWindowTimeoutMs,
    });
  }

  if (action.type === "passClaim") {
    return passClaim(room, playerId);
  }

  if (action.type === "claimHu") {
    return claimHu(room, playerId);
  }

  if (action.type === "claimSelfDrawHu") {
    return claimSelfDrawHu(room, playerId);
  }

  if (action.type === "claimPeng") {
    return claimPeng(room, playerId);
  }

  if (action.type === "claimMingGang") {
    return claimMingGang(room, playerId);
  }

  if (action.type === "claimAnGang") {
    return claimAnGang(room, playerId, action.tile);
  }

  if (action.type === "claimBaGang") {
    return claimBaGang(room, playerId, action.tile, {
      now,
      timeoutMs: service.responseWindowTimeoutMs,
    });
  }

  if (action.type === "passQiangGang") {
    return passQiangGang(room, playerId);
  }

  if (action.type === "claimQiangGangHu") {
    return claimQiangGangHu(room, playerId);
  }

  return chooseMissingSuit(room, playerId, action.suit);
}

function buildResponse(
  service: RoomServiceState,
  sessionToken: string,
  previousLastEventId: number,
  now = service.nowFactory(),
): RoomServiceResult {
  const session = findSession(service, sessionToken);

  if (session === undefined) {
    return { ok: false, reason: "invalidSession", service };
  }

  return {
    ok: true,
    service,
    session,
    view: toClientVisibleRoomState(service.room, session.playerId, now),
    lastEventId: service.lastEventId,
    events: service.room.eventLog.slice(previousLastEventId),
  };
}

function advanceEventId(service: RoomServiceState, nextRoom: RoomState): number {
  return service.lastEventId + Math.max(0, nextRoom.eventLog.length - service.room.eventLog.length);
}

function updateSessionPresence(
  service: RoomServiceState,
  sessionToken: string,
  connected: boolean,
  reason: "connectionClosed" | "sessionResumed",
): RoomPresenceUpdateResult {
  const session = findSession(service, sessionToken);

  if (session === undefined) {
    return { ok: false, reason: "invalidSession", service };
  }

  const result = setPlayerPresence(service.room, session.playerId, connected, reason);

  if (!result.changed) {
    return { ok: true, service, session, changed: false, events: [] };
  }

  const nextLastEventId = advanceEventId(service, result.room);
  const nextService: RoomServiceState = {
    ...service,
    room: result.room,
    lastEventId: nextLastEventId,
  };

  return {
    ok: true,
    service: nextService,
    session,
    changed: true,
    events: result.room.eventLog.slice(service.lastEventId),
  };
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

export function createSecureSessionToken(): string {
  return `session-${globalThis.crypto.randomUUID()}`;
}

function issueSessionToken(factory: SessionTokenFactory, sessions: RoomSession[]): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = factory();

    if (!sessions.some((session) => session.sessionToken === token)) {
      return token;
    }
  }

  throw new Error("Session token factory produced too many duplicate tokens.");
}
