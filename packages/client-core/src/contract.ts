export type ProtocolVersion = 1;

export type SeatId = 0 | 1 | 2 | 3;
export type PlayerId = SeatId;
export type Suit = "characters" | "dots" | "bamboos";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Tile = {
  suit: Suit;
  rank: Rank;
};

export type RoomStatus = "waiting" | "dingque" | "playing" | "ended";
export type RoundPhase = "dingque" | "draw" | "discard" | "claim" | "gangDraw" | "qiangGang" | "ended";
export type ClientResponseChoice = "pass" | "hu" | "peng" | "mingGang";

export type ClientLegalAction =
  | "takeSeat"
  | "toggleReady"
  | "startRound"
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

type BasicActionDescriptor = {
  action: Exclude<ClientLegalAction, "takeSeat" | "chooseMissingSuit" | "discardTile" | "claimAnGang" | "claimBaGang">;
  actionId: string;
};

export type ClientActionDescriptor =
  | BasicActionDescriptor
  | { action: "takeSeat"; actionId: string; seatIds: SeatId[] }
  | { action: "chooseMissingSuit"; actionId: string; suits: Suit[] }
  | { action: "discardTile" | "claimAnGang" | "claimBaGang"; actionId: string; tiles: Tile[] };

export type ClientVisibleMeld =
  | {
      type: "peng" | "mingGang" | "anGang" | "baGang";
      tile: Tile;
      tiles: Tile[];
      fromPlayer: SeatId | null;
    }
  | {
      type: "anGang";
      tile: null;
      tiles: [];
      fromPlayer: null;
    };

export type ClientVisiblePlayerState = {
  id: SeatId;
  hand: Tile[] | null;
  handCount: number;
  discards: Tile[];
  melds: ClientVisibleMeld[];
  hasWon: boolean;
  missingSuit: Suit | null;
};

export type ClientVisibleSeatState = {
  seatId: SeatId;
  playerId: string | null;
  displayName: string | null;
  connected: boolean;
  ready: boolean;
};

export type ClientVisibleResponseWindow = {
  windowId: string;
  kind: "discardClaim" | "qiangGang";
  deadlineAt: number;
  remainingMs: number;
  status: "open" | "expired";
  pendingResponderCount: number;
  hasRespondedByMe: boolean;
  responseByMe: ClientResponseChoice | null;
};

export type ClientVisibleRoomState = {
  id: string;
  status: RoomStatus;
  phase: RoundPhase | null;
  legalActions: ClientLegalAction[];
  actionDescriptors: ClientActionDescriptor[];
  localSeatId: SeatId | null;
  seats: ClientVisibleSeatState[];
  round: null | {
    dealer: SeatId;
    currentPlayer: SeatId;
    wallCount: number;
    players: ClientVisiblePlayerState[];
  };
  responseWindow: ClientVisibleResponseWindow | null;
  scores: Array<{ seatId: SeatId; playerId: string | null; points: number }>;
};

export type RoomSocketErrorCode =
  | "roomNotFound"
  | "roomAlreadyExists"
  | "invalidSession"
  | "sessionDisconnected"
  | "roomAlreadyStarted"
  | "playerAlreadyJoined"
  | "playerNotInRoom"
  | "seatOccupied"
  | "playerAlreadySeated"
  | "playerNotSeated"
  | "notEnoughPlayers"
  | "notAllPlayersReady"
  | "roundNotStarted"
  | "missingSuitAlreadyChosen"
  | "missingSuitNotSet"
  | "roundFinished"
  | "claimWindowOpen"
  | "gangDrawPending"
  | "noGangDraw"
  | "notCurrentPlayer"
  | "notDrawPhase"
  | "notDiscardPhase"
  | "wallEmpty"
  | "playerAlreadyWon"
  | "tileNotInHand"
  | "mustDiscardMissingSuitFirst"
  | "cannotDiscardYaoJi"
  | "noClaimWindow"
  | "noQiangGangWindow"
  | "claimNotAllowed"
  | "claimAlreadyResponded"
  | "cannotHu"
  | "cannotPeng"
  | "cannotMingGang"
  | "cannotAnGang"
  | "cannotBaGang"
  | "staleAction";

export type ProtocolErrorCode = "invalidJson" | "invalidMessage" | "unknownConnection" | "sessionNotBound";

type EmptyPayload = Record<string, never>;
type GuardedEmptyPayload = { expectedActionId?: string };
type GuardedEmptySessionAction<TAction extends string> = TAction extends string
  ? { protocolVersion: 1; clientMessageId: string; roomId: string; sessionToken: string; type: TAction; payload: GuardedEmptyPayload }
  : never;
type GuardedTileSessionAction<TAction extends string> = TAction extends string
  ? { protocolVersion: 1; clientMessageId: string; roomId: string; sessionToken: string; type: TAction; payload: { tile: Tile; expectedActionId?: string } }
  : never;

export type RoomSocketClientMessage =
  | { protocolVersion: 1; clientMessageId: string; type: "createRoom"; payload: { roomId: string; displayName: string } }
  | { protocolVersion: 1; clientMessageId: string; roomId: string; type: "joinRoom"; payload: { displayName: string } }
  | { protocolVersion: 1; clientMessageId: string; roomId: string; sessionToken: string; type: "takeSeat"; payload: { seatId: SeatId } }
  | { protocolVersion: 1; clientMessageId: string; roomId: string; sessionToken: string; type: "toggleReady"; payload: EmptyPayload }
  | { protocolVersion: 1; clientMessageId: string; roomId: string; sessionToken: string; type: "startRound"; payload: { dealer?: SeatId } }
  | { protocolVersion: 1; clientMessageId: string; roomId: string; sessionToken: string; type: "chooseMissingSuit"; payload: { suit: Suit } }
  | GuardedEmptySessionAction<"drawTile" | "drawGangTile" | "passClaim" | "claimHu" | "claimSelfDrawHu" | "claimPeng" | "claimMingGang" | "passQiangGang" | "claimQiangGangHu">
  | GuardedTileSessionAction<"discardTile" | "claimAnGang" | "claimBaGang">
  | { protocolVersion: 1; clientMessageId: string; roomId: string; sessionToken: string; type: "resumeSession"; payload: { lastSeenEventId?: number } };

export type MobileRoomServerMessage =
  | {
      protocolVersion: 1;
      serverEventId: number;
      roomId: string;
      type: "roomSnapshot";
      payload: {
        view: ClientVisibleRoomState;
        playerId: string;
        lastEventId: number;
        serverNow: number;
      };
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
    }
  | {
      protocolVersion: 1;
      type: "protocolError";
      payload: { code: ProtocolErrorCode; message: string };
    };

export type MobileServerMessageParseResult =
  | { ok: true; message: MobileRoomServerMessage }
  | { ok: false; reason: string };

const legalActions = new Set<ClientLegalAction>([
  "takeSeat", "toggleReady", "startRound", "chooseMissingSuit", "drawTile", "drawGangTile",
  "discardTile", "passClaim", "claimHu", "claimSelfDrawHu", "claimPeng", "claimMingGang",
  "claimAnGang", "claimBaGang", "passQiangGang", "claimQiangGangHu",
]);
const errorCodes = new Set<RoomSocketErrorCode>([
  "roomNotFound", "roomAlreadyExists", "invalidSession", "sessionDisconnected", "roomAlreadyStarted",
  "playerAlreadyJoined", "playerNotInRoom", "seatOccupied", "playerAlreadySeated", "playerNotSeated",
  "notEnoughPlayers", "notAllPlayersReady", "roundNotStarted", "missingSuitAlreadyChosen",
  "missingSuitNotSet", "roundFinished", "claimWindowOpen", "gangDrawPending", "noGangDraw",
  "notCurrentPlayer", "notDrawPhase", "notDiscardPhase", "wallEmpty", "playerAlreadyWon",
  "tileNotInHand", "mustDiscardMissingSuitFirst", "cannotDiscardYaoJi", "noClaimWindow",
  "noQiangGangWindow", "claimNotAllowed", "claimAlreadyResponded", "cannotHu", "cannotPeng",
  "cannotMingGang", "cannotAnGang", "cannotBaGang",
  "staleAction",
]);
const protocolErrorCodes = new Set<ProtocolErrorCode>([
  "invalidJson", "invalidMessage", "unknownConnection", "sessionNotBound",
]);
const forbiddenSnapshotKeys = new Set([
  "seed", "wall", "pendingPlayerIds", "passedPlayerIds", "huClaims", "meldClaims",
  "pengMeldIndex", "physicalTiles", "gangId", "claimedWinningTile", "decomposition",
  "resolvedSettlementIds", "resolvedWindowIds", "connectionId", "lastSeenAt", "supersededSessionTokens",
]);

export function parseMobileRoomServerMessage(input: unknown): MobileServerMessageParseResult {
  const decoded = decodeJson(input);
  if (!decoded.ok) {
    return decoded;
  }

  const value = decoded.value;
  if (!isRecord(value) || value.protocolVersion !== 1) {
    return invalid("服务端消息头不合法");
  }

  if (value.type === "protocolError") {
    if (!hasOnlyKeys(value, ["protocolVersion", "type", "payload"]) || !isRecord(value.payload) ||
        !hasOnlyKeys(value.payload, ["code", "message"]) || typeof value.payload.code !== "string" ||
        !protocolErrorCodes.has(value.payload.code as ProtocolErrorCode) || typeof value.payload.message !== "string") {
      return invalid("protocolError 结构不合法");
    }
    return { ok: true, message: value as MobileRoomServerMessage };
  }

  if (!isSafeInteger(value.serverEventId) || !isNonEmptyString(value.roomId)) {
    return invalid("服务端消息头不合法");
  }

  if (value.type === "actionAccepted") {
    if (!hasOnlyKeys(value, ["protocolVersion", "serverEventId", "roomId", "recipientSessionToken", "type", "payload"]) ||
        !isNonEmptyString(value.recipientSessionToken) || !isRecord(value.payload) ||
        !hasOnlyKeys(value.payload, ["clientMessageId", "playerId"]) ||
        !isNonEmptyString(value.payload.clientMessageId) || !isNonEmptyString(value.payload.playerId)) {
      return invalid("actionAccepted 结构不合法");
    }
    return { ok: true, message: value as MobileRoomServerMessage };
  }

  if (value.type === "actionRejected") {
    if (!hasOnlyKeys(value, ["protocolVersion", "serverEventId", "roomId", "recipientSessionToken", "type", "payload"]) ||
        !(value.recipientSessionToken === null || isNonEmptyString(value.recipientSessionToken)) ||
        !isRecord(value.payload) || !hasOnlyKeys(value.payload, ["clientMessageId", "code", "message"]) ||
        !isNonEmptyString(value.payload.clientMessageId) || typeof value.payload.code !== "string" ||
        !errorCodes.has(value.payload.code as RoomSocketErrorCode) || typeof value.payload.message !== "string") {
      return invalid("actionRejected 结构不合法");
    }
    return { ok: true, message: value as MobileRoomServerMessage };
  }

  if (value.type !== "roomSnapshot" ||
      !hasOnlyKeys(value, ["protocolVersion", "serverEventId", "roomId", "type", "payload"]) ||
      !isRecord(value.payload) ||
      !hasOnlyKeys(value.payload, ["view", "playerId", "lastEventId", "serverNow", "events"]) ||
      !isNonEmptyString(value.payload.playerId) || !isSafeInteger(value.payload.lastEventId) ||
      !isFiniteNumber(value.payload.serverNow) || !Array.isArray(value.payload.events)) {
    return invalid("roomSnapshot 结构不合法");
  }

  if (containsForbiddenSnapshotKey(value.payload.view) || containsForbiddenSnapshotKey(value.payload.events)) {
    return invalid("roomSnapshot 包含客户端禁止字段");
  }

  const view = parseClientVisibleRoomState(value.payload.view);
  if (!view.ok) {
    return view;
  }

  return {
    ok: true,
    message: {
      protocolVersion: 1,
      serverEventId: value.serverEventId,
      roomId: value.roomId,
      type: "roomSnapshot",
      payload: {
        view: view.value,
        playerId: value.payload.playerId,
        lastEventId: value.payload.lastEventId,
        serverNow: value.payload.serverNow,
      },
    },
  };
}

function parseClientVisibleRoomState(value: unknown): { ok: true; value: ClientVisibleRoomState } | { ok: false; reason: string } {
  const allowedViewKeys = [
    "id", "status", "phase", "legalActions", "actionDescriptors", "localSeatId", "members", "seats",
    "round", "claimWindow", "baGangClaimWindow", "gangDraw", "roundEnd", "chaJiao", "scores",
    "settlementLedger", "gangSettlements", "responseWindow", "eventLog",
  ];
  if (!isRecord(value) || !hasOnlyKeys(value, allowedViewKeys) || !isNonEmptyString(value.id) ||
      !isRoomStatus(value.status) || !isRoundPhaseOrNull(value.phase) || !Array.isArray(value.legalActions) ||
      !value.legalActions.every((action) => typeof action === "string" && legalActions.has(action as ClientLegalAction)) ||
      !Array.isArray(value.actionDescriptors) || !isSeatIdOrNull(value.localSeatId) || !Array.isArray(value.seats) ||
      !Array.isArray(value.scores)) {
    return invalid("客户端房间视图结构不合法");
  }

  const descriptors = value.actionDescriptors.map(parseActionDescriptor);
  if (descriptors.some((entry) => entry === null)) {
    return invalid("动作参数描述不合法");
  }

  const seats = value.seats.map(parseSeat);
  const scores = value.scores.map(parseScore);
  if (seats.some((entry) => entry === null) || scores.some((entry) => entry === null)) {
    return invalid("座位或积分结构不合法");
  }

  const round = value.round === null ? null : parseRound(value.round, value.localSeatId);
  if (round === undefined) {
    return invalid("牌局公开视图结构不合法");
  }

  const responseWindow = value.responseWindow === null ? null : parseResponseWindow(value.responseWindow);
  if (responseWindow === undefined) {
    return invalid("响应窗口公开视图结构不合法");
  }

  return {
    ok: true,
    value: {
      id: value.id,
      status: value.status,
      phase: value.phase,
      legalActions: [...value.legalActions] as ClientLegalAction[],
      actionDescriptors: descriptors as ClientActionDescriptor[],
      localSeatId: value.localSeatId,
      seats: seats as ClientVisibleSeatState[],
      round,
      responseWindow,
      scores: scores as Array<{ seatId: SeatId; playerId: string | null; points: number }>,
    },
  };
}

function parseActionDescriptor(value: unknown): ClientActionDescriptor | null {
  if (!isRecord(value) || typeof value.action !== "string" || !legalActions.has(value.action as ClientLegalAction) || !isNonEmptyString(value.actionId)) {
    return null;
  }
  const action = value.action as ClientLegalAction;
  if (action === "takeSeat") {
    return hasOnlyKeys(value, ["action", "actionId", "seatIds"]) && Array.isArray(value.seatIds) && value.seatIds.every(isSeatId)
      ? { action, actionId: value.actionId, seatIds: [...value.seatIds] }
      : null;
  }
  if (action === "chooseMissingSuit") {
    return hasOnlyKeys(value, ["action", "actionId", "suits"]) && Array.isArray(value.suits) && value.suits.every(isSuit)
      ? { action, actionId: value.actionId, suits: [...value.suits] }
      : null;
  }
  if (action === "discardTile" || action === "claimAnGang" || action === "claimBaGang") {
    return hasOnlyKeys(value, ["action", "actionId", "tiles"]) && Array.isArray(value.tiles) && value.tiles.every(isTile)
      ? { action, actionId: value.actionId, tiles: value.tiles.map(cloneTile) }
      : null;
  }
  return hasOnlyKeys(value, ["action", "actionId"]) ? { action: action as BasicActionDescriptor["action"], actionId: value.actionId } : null;
}

function parseSeat(value: unknown): ClientVisibleSeatState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["seatId", "playerId", "displayName", "connected", "ready"]) ||
      !isSeatId(value.seatId) || !(value.playerId === null || isNonEmptyString(value.playerId)) ||
      !(value.displayName === null || typeof value.displayName === "string") ||
      typeof value.connected !== "boolean" || typeof value.ready !== "boolean") {
    return null;
  }
  return { seatId: value.seatId, playerId: value.playerId, displayName: value.displayName, connected: value.connected, ready: value.ready };
}

function parseScore(value: unknown): { seatId: SeatId; playerId: string | null; points: number } | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["seatId", "playerId", "points"]) || !isSeatId(value.seatId) ||
      !(value.playerId === null || isNonEmptyString(value.playerId)) || !isFiniteNumber(value.points)) {
    return null;
  }
  return { seatId: value.seatId, playerId: value.playerId, points: value.points };
}

function parseRound(value: unknown, localSeatId: SeatId | null): ClientVisibleRoomState["round"] | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["dealer", "currentPlayer", "wallCount", "players"]) ||
      !isSeatId(value.dealer) || !isSeatId(value.currentPlayer) || !isSafeInteger(value.wallCount) ||
      !Array.isArray(value.players)) {
    return undefined;
  }
  const players = value.players.map((player) => parsePlayer(player, localSeatId));
  if (players.some((player) => player === null)) {
    return undefined;
  }
  return { dealer: value.dealer, currentPlayer: value.currentPlayer, wallCount: value.wallCount, players: players as ClientVisiblePlayerState[] };
}

function parsePlayer(value: unknown, localSeatId: SeatId | null): ClientVisiblePlayerState | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "hand", "handCount", "discards", "melds", "hasWon", "missingSuit"]) ||
      !isSeatId(value.id) || !isSafeInteger(value.handCount) || !Array.isArray(value.discards) || !value.discards.every(isTile) ||
      !Array.isArray(value.melds) || typeof value.hasWon !== "boolean" || !(value.missingSuit === null || isSuit(value.missingSuit))) {
    return null;
  }
  if (value.id === localSeatId) {
    if (!Array.isArray(value.hand) || !value.hand.every(isTile)) {
      return null;
    }
  } else if (value.hand !== null) {
    return null;
  }
  const melds = value.melds.map(parseMeld);
  if (melds.some((meld) => meld === null)) {
    return null;
  }
  return {
    id: value.id,
    hand: value.hand === null ? null : value.hand.map(cloneTile),
    handCount: value.handCount,
    discards: value.discards.map(cloneTile),
    melds: melds as ClientVisibleMeld[],
    hasWon: value.hasWon,
    missingSuit: value.missingSuit,
  };
}

function parseMeld(value: unknown): ClientVisibleMeld | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["type", "tile", "tiles", "fromPlayer"]) || !Array.isArray(value.tiles)) {
    return null;
  }
  if (value.type === "anGang" && value.tile === null) {
    return value.tiles.length === 0 && value.fromPlayer === null
      ? { type: "anGang", tile: null, tiles: [], fromPlayer: null }
      : null;
  }
  if (!(value.type === "peng" || value.type === "mingGang" || value.type === "anGang" || value.type === "baGang") ||
      !isTile(value.tile) || !value.tiles.every(isTile) || !(value.fromPlayer === null || isSeatId(value.fromPlayer))) {
    return null;
  }
  if (value.type === "anGang" && value.fromPlayer !== null) {
    return null;
  }
  return { type: value.type, tile: cloneTile(value.tile), tiles: value.tiles.map(cloneTile), fromPlayer: value.fromPlayer };
}

function parseResponseWindow(value: unknown): ClientVisibleResponseWindow | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["windowId", "kind", "deadlineAt", "remainingMs", "status", "pendingResponderCount", "hasRespondedByMe", "responseByMe"]) ||
      !isNonEmptyString(value.windowId) || !(value.kind === "discardClaim" || value.kind === "qiangGang") ||
      !isFiniteNumber(value.deadlineAt) || !isFiniteNumber(value.remainingMs) || !(value.status === "open" || value.status === "expired") ||
      !isSafeInteger(value.pendingResponderCount) || typeof value.hasRespondedByMe !== "boolean" ||
      !(value.responseByMe === null || value.responseByMe === "pass" || value.responseByMe === "hu" || value.responseByMe === "peng" || value.responseByMe === "mingGang")) {
    return undefined;
  }
  return {
    windowId: value.windowId,
    kind: value.kind,
    deadlineAt: value.deadlineAt,
    remainingMs: value.remainingMs,
    status: value.status,
    pendingResponderCount: value.pendingResponderCount,
    hasRespondedByMe: value.hasRespondedByMe,
    responseByMe: value.responseByMe,
  };
}

function decodeJson(input: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (typeof input !== "string") {
    return { ok: true, value: input };
  }
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch {
    return invalid("服务端消息不是合法 JSON");
  }
}

function containsForbiddenSnapshotKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenSnapshotKey);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, child]) => forbiddenSnapshotKeys.has(key) || containsForbiddenSnapshotKey(child));
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value || key === "events");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function isSeatId(value: unknown): value is SeatId {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
function isSeatIdOrNull(value: unknown): value is SeatId | null {
  return value === null || isSeatId(value);
}
function isSuit(value: unknown): value is Suit {
  return value === "characters" || value === "dots" || value === "bamboos";
}
function isRank(value: unknown): value is Rank {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9;
}
function isTile(value: unknown): value is Tile {
  return isRecord(value) && hasOnlyKeys(value, ["suit", "rank"]) && isSuit(value.suit) && isRank(value.rank);
}
function cloneTile(value: Tile): Tile {
  return { suit: value.suit, rank: value.rank };
}
function isRoomStatus(value: unknown): value is RoomStatus {
  return value === "waiting" || value === "dingque" || value === "playing" || value === "ended";
}
function isRoundPhaseOrNull(value: unknown): value is RoundPhase | null {
  return value === null || value === "dingque" || value === "draw" || value === "discard" || value === "claim" || value === "gangDraw" || value === "qiangGang" || value === "ended";
}
function invalid(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}
