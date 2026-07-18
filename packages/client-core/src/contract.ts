export type ProtocolVersion = 1;

export type SeatId = 0 | 1 | 2 | 3;
export type PlayerId = SeatId;
export type Suit = "characters" | "dots" | "bamboos";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Tile = {
  suit: Suit;
  rank: Rank;
};

export type ClientOwnedTile = Tile & {
  tileId: string;
};

export type BaGangPaymentEligibility = "normal" | "zeroDelayedNatural";

export type ClientBaGangCandidate = {
  candidateId: string;
  targetTile: Tile;
  addedTile: ClientOwnedTile;
  usesLaizi: boolean;
  paymentEligibility: BaGangPaymentEligibility;
  payerSeatIds: SeatId[];
  pointsPerPayer: 0 | 1 | 2;
};

export type ClientYaoJiExchangeCandidate = {
  candidateId: string;
  gangType: "mingGang" | "anGang" | "baGang";
  targetTile: Tile;
  naturalTile: ClientOwnedTile;
  returnedYaoJi: Tile;
};

export type ScorePattern =
  | "pingHu"
  | "daDui"
  | "danDiao"
  | "qingYiSe"
  | "xiaoQiDui"
  | "longQiDui"
  | "shuangLongQiDui"
  | "sanLongQiDui"
  | "wuJi";

export type RoundEndReason = "onePlayerLeft" | "wallEmpty";
export type GameStatus = "waiting" | "playingRound" | "betweenRounds" | "finished";
export type NextDealerReason =
  | "qiangGangDeclarer"
  | "multipleHuDiscarder"
  | "firstWinner"
  | "wallEmptyDealerKeeps";

export type MobileRoundEndState = {
  reason: RoundEndReason;
  remainingPlayerIds: SeatId[];
};

export type MobileNextDealerDecision = {
  roundId: string;
  completedRoundNumber: number;
  nextDealerSeatId: SeatId;
  reason: NextDealerReason;
  firstWinnerSeatId: SeatId | null;
  multipleHuDiscarderSeatId: SeatId | null;
};

export type MobileRoundScoreDelta = {
  seatId: SeatId;
  playerId: string | null;
  beforePoints: number;
  delta: number;
  afterPoints: number;
};

export type MobileRoundHistoryEntry = {
  roundId: string;
  roundNumber: number;
  dealerSeatId: SeatId;
  roundEnd: MobileRoundEndState;
  nextDealerDecision: MobileNextDealerDecision;
  scoreDeltas: MobileRoundScoreDelta[];
};

export type MobileGameEndState = {
  finishedBySeatId: SeatId;
  finishedByPlayerId: string;
  completedRoundCount: number;
  finalScores: Array<{ seatId: SeatId; playerId: string | null; points: number }>;
};

type MobileSettlementSummaryBase = {
  winnerSeatId: SeatId;
  winnerPlayerId: string;
  loserSeatId: SeatId;
  loserPlayerId: string;
  basePoints: number;
  rawPoints: number;
  finalPoints: number;
};

export type MobileSettlementSummary =
  | (MobileSettlementSummaryBase & {
      reason: "selfDrawHu" | "discardHu" | "qiangGangHu";
    })
  | (MobileSettlementSummaryBase & {
      reason: "sanJi" | "siJi" | "qiangGangSanJiLiability";
      chickenSuit: "bamboos" | "dots";
      chickenCount: 3 | 4;
    })
  | (MobileSettlementSummaryBase & {
      reason: "mingGang" | "anGang" | "baGang";
      targetTile: Tile | null;
      usesLaizi: boolean;
    })
  | (MobileSettlementSummaryBase & {
      reason: "chaJiao";
      patterns: ScorePattern[];
      genCount: number;
    });

export type MobilePublicEvent =
  | { eventId: number; type: "playerJoined"; playerId: string; displayName: string }
  | { eventId: number; type: "seatTaken"; seatId: SeatId; playerId: string }
  | { eventId: number; type: "readyChanged"; seatId: SeatId; playerId: string; ready: boolean }
  | {
      eventId: number;
      type: "missingSuitChosen";
      seatId: SeatId;
      playerId: string;
      suit: Suit;
      automatic: boolean;
    }
  | { eventId: number; type: "tileDiscarded"; seatId: SeatId; playerId: string; tile: Tile }
  | { eventId: number; type: "pengClaimed" | "mingGangClaimed" | "baGangClaimed"; seatId: SeatId; playerId: string; tile: Tile }
  | { eventId: number; type: "anGangClaimed"; seatId: SeatId; playerId: string; usesLaizi: boolean }
  | {
      eventId: number;
      type: "gangYaoJiExchanged";
      seatId: SeatId;
      playerId: string;
      gangType: "mingGang" | "anGang" | "baGang";
      targetTile: Tile | null;
    }
  | {
      eventId: number;
      type: "huClaimed";
      seatId: SeatId;
      playerId: string;
      tile: Tile;
      patterns: ScorePattern[];
      genCount: number;
      points: number;
    }
  | {
      eventId: number;
      type: "selfDrawHuClaimed";
      seatId: SeatId;
      playerId: string;
      patterns: ScorePattern[];
      genCount: number;
      points: number;
    }
  | {
      eventId: number;
      type: "qiangGangHuClaimed";
      seatId: SeatId;
      playerId: string;
      responsibleSeatId: SeatId;
      responsiblePlayerId: string;
      tile: Tile;
      patterns: ScorePattern[];
      genCount: number;
      points: number;
    }
  | {
      eventId: number;
      type: "presenceChanged";
      playerId: string;
      seatId: SeatId | null;
      connected: boolean;
      reason: "connectionClosed" | "sessionResumed";
    }
  | { eventId: number; type: "roundEnded"; reason: RoundEndReason; remainingPlayerIds: SeatId[] }
  | {
      eventId: number;
      type: "nextDealerDecided";
      completedRoundNumber: number;
      nextDealerSeatId: SeatId;
      reason: NextDealerReason;
    }
  | {
      eventId: number;
      type: "gameFinished";
      finishedBySeatId: SeatId;
      finishedByPlayerId: string;
      completedRoundCount: number;
    };

export type RoomStatus = "waiting" | "dingque" | "playing" | "ended";
export type RoundPhase = "dingque" | "draw" | "discard" | "claim" | "gangDraw" | "qiangGang" | "ended";
export type ClientResponseChoice = "pass" | "hu" | "peng" | "mingGang";

export type ClientLegalAction =
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

type BasicActionDescriptor = {
  action: Exclude<ClientLegalAction, "takeSeat" | "chooseMissingSuit" | "discardTile" | "claimAnGang" | "claimBaGang" | "exchangeGangYaoJi">;
  actionId: string;
};

export type ClientActionDescriptor =
  | BasicActionDescriptor
  | { action: "takeSeat"; actionId: string; seatIds: SeatId[] }
  | { action: "chooseMissingSuit"; actionId: string; suits: Suit[] }
  | { action: "discardTile"; actionId: string; tiles: ClientOwnedTile[] }
  | { action: "claimAnGang"; actionId: string; tiles: Tile[] }
  | { action: "claimBaGang"; actionId: string; candidates: ClientBaGangCandidate[] }
  | { action: "exchangeGangYaoJi"; actionId: string; candidates: ClientYaoJiExchangeCandidate[] };

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
  hand: ClientOwnedTile[] | null;
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

export type ClientVisibleTurnDeadline = {
  windowId: string;
  kind: "dingque" | "discard";
  seatId: SeatId | null;
  deadlineAt: number;
  remainingMs: number;
};

export type ClientVisibleRoomState = {
  id: string;
  gameStatus: GameStatus;
  status: RoomStatus;
  phase: RoundPhase | null;
  roundNumber: number;
  currentDealer: SeatId;
  dealerHistory: SeatId[];
  nextDealerDecision: MobileNextDealerDecision | null;
  roundHistory: MobileRoundHistoryEntry[];
  gameEnd: MobileGameEndState | null;
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
  turnDeadline: ClientVisibleTurnDeadline | null;
  scores: Array<{ seatId: SeatId; playerId: string | null; points: number }>;
  roundEnd: MobileRoundEndState | null;
  settlementLedger: MobileSettlementSummary[];
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
  | "cannotExchangeGangYaoJi"
  | "roundNotFinished"
  | "gameFinished"
  | "nextDealerUnavailable"
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
  | GuardedEmptySessionAction<"readyNextRound" | "startNextRound" | "finishGame">
  | { protocolVersion: 1; clientMessageId: string; roomId: string; sessionToken: string; type: "chooseMissingSuit"; payload: { suit: Suit } }
  | GuardedEmptySessionAction<"drawTile" | "drawGangTile" | "passClaim" | "claimHu" | "claimSelfDrawHu" | "claimPeng" | "claimMingGang" | "passQiangGang" | "claimQiangGangHu">
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "discardTile";
      payload: { tile: Tile; tileId?: string; expectedActionId?: string };
    }
  | GuardedTileSessionAction<"claimAnGang">
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "claimBaGang";
      payload: { candidateId?: string; tile?: Tile; expectedActionId?: string };
    }
  | {
      protocolVersion: 1;
      clientMessageId: string;
      roomId: string;
      sessionToken: string;
      type: "exchangeGangYaoJi";
      payload: { candidateId: string; expectedActionId?: string };
    }
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
        events: MobilePublicEvent[];
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
  "takeSeat", "toggleReady", "startRound", "readyNextRound", "startNextRound", "finishGame",
  "chooseMissingSuit", "drawTile", "drawGangTile",
  "discardTile", "passClaim", "claimHu", "claimSelfDrawHu", "claimPeng", "claimMingGang",
  "claimAnGang", "claimBaGang", "exchangeGangYaoJi", "passQiangGang", "claimQiangGangHu",
]);
const errorCodes = new Set<RoomSocketErrorCode>([
  "roomNotFound", "roomAlreadyExists", "invalidSession", "sessionDisconnected", "roomAlreadyStarted",
  "playerAlreadyJoined", "playerNotInRoom", "seatOccupied", "playerAlreadySeated", "playerNotSeated",
  "notEnoughPlayers", "notAllPlayersReady", "roundNotStarted", "missingSuitAlreadyChosen",
  "missingSuitNotSet", "roundFinished", "claimWindowOpen", "gangDrawPending", "noGangDraw",
  "notCurrentPlayer", "notDrawPhase", "notDiscardPhase", "wallEmpty", "playerAlreadyWon",
  "tileNotInHand", "mustDiscardMissingSuitFirst", "cannotDiscardYaoJi", "noClaimWindow",
  "noQiangGangWindow", "claimNotAllowed", "claimAlreadyResponded", "cannotHu", "cannotPeng",
  "cannotMingGang", "cannotAnGang", "cannotBaGang", "cannotExchangeGangYaoJi",
  "roundNotFinished", "gameFinished", "nextDealerUnavailable",
  "staleAction",
]);
const protocolErrorCodes = new Set<ProtocolErrorCode>([
  "invalidJson", "invalidMessage", "unknownConnection", "sessionNotBound",
]);
const forbiddenSnapshotKeys = new Set([
  "seed", "wall", "pendingPlayerIds", "passedPlayerIds", "huClaims", "meldClaims",
  "pengMeldIndex", "physicalTiles", "gangId", "claimedWinningTile", "decomposition",
  "resolvedSettlementIds", "resolvedWindowIds", "connectionId", "lastSeenAt", "supersededSessionTokens",
  "instanceId", "lastDrawnTileId", "ruleOptions",
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

  const events = parseMobilePublicEvents(value.payload.events, value.payload.lastEventId);
  if (!events.ok) {
    return events;
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
        events: events.value,
      },
    },
  };
}

function parseClientVisibleRoomState(value: unknown): { ok: true; value: ClientVisibleRoomState } | { ok: false; reason: string } {
  const allowedViewKeys = [
    "id", "gameStatus", "status", "phase", "roundNumber", "currentDealer", "dealerHistory",
    "nextDealerDecision", "roundHistory", "gameEnd", "legalActions", "actionDescriptors", "localSeatId", "members", "seats",
    "round", "claimWindow", "baGangClaimWindow", "gangDraw", "roundEnd", "chaJiao", "scores",
    "settlementLedger", "gangSettlements", "responseWindow", "turnDeadline", "eventLog",
  ];
  if (!isRecord(value) || !hasOnlyKeys(value, allowedViewKeys) || !isNonEmptyString(value.id) ||
      !isGameStatus(value.gameStatus) || !isSafeInteger(value.roundNumber) || !isSeatId(value.currentDealer) ||
      !Array.isArray(value.dealerHistory) || !value.dealerHistory.every(isSeatId) || !Array.isArray(value.roundHistory) ||
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
  const turnDeadline = value.turnDeadline === null ? null : parseTurnDeadline(value.turnDeadline);
  if (turnDeadline === undefined) {
    return invalid("回合倒计时公开视图结构不合法");
  }

  const roundEnd = value.roundEnd === null ? null : parseRoundEnd(value.roundEnd);
  const settlementLedger = parseSettlementLedger(value.settlementLedger);
  const nextDealerDecision = value.nextDealerDecision === null ? null : parseNextDealerDecision(value.nextDealerDecision);
  const roundHistory = value.roundHistory.map(parseRoundHistoryEntry);
  const gameEnd = value.gameEnd === null ? null : parseGameEnd(value.gameEnd);
  if (
    roundEnd === undefined || settlementLedger === null || nextDealerDecision === undefined ||
    roundHistory.some((entry) => entry === null) || gameEnd === undefined
  ) {
    return invalid("终局或结算公开视图结构不合法");
  }

  return {
    ok: true,
    value: {
      id: value.id,
      gameStatus: value.gameStatus,
      status: value.status,
      phase: value.phase,
      roundNumber: value.roundNumber,
      currentDealer: value.currentDealer,
      dealerHistory: [...value.dealerHistory],
      nextDealerDecision,
      roundHistory: roundHistory as MobileRoundHistoryEntry[],
      gameEnd,
      legalActions: [...value.legalActions] as ClientLegalAction[],
      actionDescriptors: descriptors as ClientActionDescriptor[],
      localSeatId: value.localSeatId,
      seats: seats as ClientVisibleSeatState[],
      round,
      responseWindow,
      turnDeadline,
      scores: scores as Array<{ seatId: SeatId; playerId: string | null; points: number }>,
      roundEnd,
      settlementLedger,
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
  if (action === "discardTile") {
    return hasOnlyKeys(value, ["action", "actionId", "tiles"]) && Array.isArray(value.tiles) && value.tiles.every(isClientOwnedTile)
      ? { action, actionId: value.actionId, tiles: value.tiles.map(cloneOwnedTile) }
      : null;
  }
  if (action === "claimAnGang") {
    return hasOnlyKeys(value, ["action", "actionId", "tiles"]) && Array.isArray(value.tiles) && value.tiles.every(isTile)
      ? { action, actionId: value.actionId, tiles: value.tiles.map(cloneTile) }
      : null;
  }
  if (action === "claimBaGang") {
    const candidates = Array.isArray(value.candidates) ? value.candidates.map(parseBaGangCandidate) : [];
    return hasOnlyKeys(value, ["action", "actionId", "candidates"]) &&
      Array.isArray(value.candidates) && !candidates.some((candidate) => candidate === null)
      ? { action, actionId: value.actionId, candidates: candidates as ClientBaGangCandidate[] }
      : null;
  }
  if (action === "exchangeGangYaoJi") {
    const candidates = Array.isArray(value.candidates) ? value.candidates.map(parseYaoJiExchangeCandidate) : [];
    return hasOnlyKeys(value, ["action", "actionId", "candidates"]) &&
      Array.isArray(value.candidates) && !candidates.some((candidate) => candidate === null)
      ? { action, actionId: value.actionId, candidates: candidates as ClientYaoJiExchangeCandidate[] }
      : null;
  }
  return hasOnlyKeys(value, ["action", "actionId"]) ? { action: action as BasicActionDescriptor["action"], actionId: value.actionId } : null;
}

function parseBaGangCandidate(value: unknown): ClientBaGangCandidate | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "candidateId", "targetTile", "addedTile", "usesLaizi", "paymentEligibility",
      "payerSeatIds", "pointsPerPayer",
    ]) ||
    !isNonEmptyString(value.candidateId) ||
    !isTile(value.targetTile) ||
    !isClientOwnedTile(value.addedTile) ||
    typeof value.usesLaizi !== "boolean" ||
    !(value.paymentEligibility === "normal" || value.paymentEligibility === "zeroDelayedNatural") ||
    !Array.isArray(value.payerSeatIds) ||
    !value.payerSeatIds.every(isSeatId) ||
    !(value.pointsPerPayer === 0 || value.pointsPerPayer === 1 || value.pointsPerPayer === 2)
  ) {
    return null;
  }

  return {
    candidateId: value.candidateId,
    targetTile: cloneTile(value.targetTile),
    addedTile: cloneOwnedTile(value.addedTile),
    usesLaizi: value.usesLaizi,
    paymentEligibility: value.paymentEligibility,
    payerSeatIds: [...value.payerSeatIds],
    pointsPerPayer: value.pointsPerPayer,
  };
}

function parseYaoJiExchangeCandidate(value: unknown): ClientYaoJiExchangeCandidate | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["candidateId", "gangType", "targetTile", "naturalTile", "returnedYaoJi"]) ||
    !isNonEmptyString(value.candidateId) ||
    !(value.gangType === "mingGang" || value.gangType === "anGang" || value.gangType === "baGang") ||
    !isTile(value.targetTile) ||
    !isClientOwnedTile(value.naturalTile) ||
    !isTile(value.returnedYaoJi)
  ) {
    return null;
  }

  return {
    candidateId: value.candidateId,
    gangType: value.gangType,
    targetTile: cloneTile(value.targetTile),
    naturalTile: cloneOwnedTile(value.naturalTile),
    returnedYaoJi: cloneTile(value.returnedYaoJi),
  };
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
    if (!Array.isArray(value.hand) || !value.hand.every(isClientOwnedTile)) {
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
    hand: value.hand === null ? null : value.hand.map(cloneOwnedTile),
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

function parseTurnDeadline(value: unknown): ClientVisibleTurnDeadline | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["windowId", "kind", "seatId", "deadlineAt", "remainingMs"]) ||
      !isNonEmptyString(value.windowId) || !(value.kind === "dingque" || value.kind === "discard") ||
      !isSeatIdOrNull(value.seatId) || !isFiniteNumber(value.deadlineAt) || !isFiniteNumber(value.remainingMs)) {
    return undefined;
  }
  return {
    windowId: value.windowId,
    kind: value.kind,
    seatId: value.seatId,
    deadlineAt: value.deadlineAt,
    remainingMs: value.remainingMs,
  };
}

function parseRoundEnd(value: unknown): MobileRoundEndState | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["reason", "remainingPlayerIds"]) ||
      !isRoundEndReason(value.reason) || !Array.isArray(value.remainingPlayerIds) ||
      !value.remainingPlayerIds.every(isSeatId)) {
    return undefined;
  }

  return {
    reason: value.reason,
    remainingPlayerIds: [...value.remainingPlayerIds],
  };
}

function parseNextDealerDecision(value: unknown): MobileNextDealerDecision | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "roundId", "completedRoundNumber", "nextDealerSeatId", "reason",
      "firstWinnerSeatId", "multipleHuDiscarderSeatId",
    ]) ||
    !isNonEmptyString(value.roundId) ||
    !isSafeInteger(value.completedRoundNumber) ||
    !isSeatId(value.nextDealerSeatId) ||
    !isNextDealerReason(value.reason) ||
    !isSeatIdOrNull(value.firstWinnerSeatId) ||
    !isSeatIdOrNull(value.multipleHuDiscarderSeatId)
  ) {
    return undefined;
  }

  return {
    roundId: value.roundId,
    completedRoundNumber: value.completedRoundNumber,
    nextDealerSeatId: value.nextDealerSeatId,
    reason: value.reason,
    firstWinnerSeatId: value.firstWinnerSeatId,
    multipleHuDiscarderSeatId: value.multipleHuDiscarderSeatId,
  };
}

function parseRoundHistoryEntry(value: unknown): MobileRoundHistoryEntry | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["roundId", "roundNumber", "dealerSeatId", "roundEnd", "nextDealerDecision", "scoreDeltas"]) ||
    !isNonEmptyString(value.roundId) ||
    !isSafeInteger(value.roundNumber) ||
    !isSeatId(value.dealerSeatId) ||
    !Array.isArray(value.scoreDeltas)
  ) {
    return null;
  }

  const roundEnd = parseRoundEnd(value.roundEnd);
  const nextDealerDecision = parseNextDealerDecision(value.nextDealerDecision);
  const scoreDeltas = value.scoreDeltas.map(parseRoundScoreDelta);

  if (roundEnd === undefined || nextDealerDecision === undefined || scoreDeltas.some((entry) => entry === null)) {
    return null;
  }

  return {
    roundId: value.roundId,
    roundNumber: value.roundNumber,
    dealerSeatId: value.dealerSeatId,
    roundEnd,
    nextDealerDecision,
    scoreDeltas: scoreDeltas as MobileRoundScoreDelta[],
  };
}

function parseRoundScoreDelta(value: unknown): MobileRoundScoreDelta | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["seatId", "playerId", "beforePoints", "delta", "afterPoints"]) ||
    !isSeatId(value.seatId) ||
    !(value.playerId === null || isNonEmptyString(value.playerId)) ||
    !isFiniteNumber(value.beforePoints) ||
    !isFiniteNumber(value.delta) ||
    !isFiniteNumber(value.afterPoints)
  ) {
    return null;
  }

  return {
    seatId: value.seatId,
    playerId: value.playerId,
    beforePoints: value.beforePoints,
    delta: value.delta,
    afterPoints: value.afterPoints,
  };
}

function parseGameEnd(value: unknown): MobileGameEndState | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["finishedBySeatId", "finishedByPlayerId", "completedRoundCount", "finalScores"]) ||
    !isSeatId(value.finishedBySeatId) ||
    !isNonEmptyString(value.finishedByPlayerId) ||
    !isSafeInteger(value.completedRoundCount) ||
    !Array.isArray(value.finalScores)
  ) {
    return undefined;
  }

  const finalScores = value.finalScores.map(parseScore);
  if (finalScores.some((entry) => entry === null)) {
    return undefined;
  }

  return {
    finishedBySeatId: value.finishedBySeatId,
    finishedByPlayerId: value.finishedByPlayerId,
    completedRoundCount: value.completedRoundCount,
    finalScores: finalScores as Array<{ seatId: SeatId; playerId: string | null; points: number }>,
  };
}

function parseSettlementLedger(value: unknown): MobileSettlementSummary[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries = value.map(parseSettlementEntry);
  return entries.some((entry) => entry === null)
    ? null
    : entries as MobileSettlementSummary[];
}

function parseSettlementEntry(value: unknown): MobileSettlementSummary | null {
  if (!isRecord(value) || !isSettlementBase(value) || typeof value.reason !== "string") {
    return null;
  }

  const base = {
    winnerSeatId: value.winnerSeatId,
    winnerPlayerId: value.winnerPlayerId,
    loserSeatId: value.loserSeatId,
    loserPlayerId: value.loserPlayerId,
    basePoints: value.basePoints,
    rawPoints: value.rawPoints,
    finalPoints: value.finalPoints,
  };

  if (value.reason === "selfDrawHu" || value.reason === "discardHu" || value.reason === "qiangGangHu") {
    return hasOnlyKeys(value, [
      "id", "batchId", "winnerSeatId", "winnerPlayerId", "loserSeatId", "loserPlayerId",
      "reason", "sourceWindowId", "basePoints", "rawPoints", "finalPoints", "relatedEvent",
    ]) ? { ...base, reason: value.reason } : null;
  }

  if (value.reason === "sanJi" || value.reason === "siJi" || value.reason === "qiangGangSanJiLiability") {
    if (!hasOnlyKeys(value, [
      "id", "batchId", "winnerSeatId", "winnerPlayerId", "loserSeatId", "loserPlayerId",
      "reason", "chickenSuit", "chickenCount", "sourceWindowId", "sourceSettlementId",
      "basePoints", "rawPoints", "finalPoints", "relatedEvent",
    ]) || !(value.chickenSuit === "bamboos" || value.chickenSuit === "dots") ||
        !(value.chickenCount === 3 || value.chickenCount === 4)) {
      return null;
    }

    return {
      ...base,
      reason: value.reason,
      chickenSuit: value.chickenSuit,
      chickenCount: value.chickenCount,
    };
  }

  if (value.reason === "mingGang" || value.reason === "anGang" || value.reason === "baGang") {
    if (!hasOnlyKeys(value, [
      "id", "batchId", "winnerSeatId", "winnerPlayerId", "loserSeatId", "loserPlayerId",
      "reason", "targetTile", "usesLaizi", "sourceWindowId", "sourceSettlementId",
      "basePoints", "rawPoints", "finalPoints", "relatedEvent",
    ]) || typeof value.usesLaizi !== "boolean" ||
        !(value.targetTile === null || isTile(value.targetTile)) ||
        (value.reason !== "anGang" && value.targetTile === null)) {
      return null;
    }

    return {
      ...base,
      reason: value.reason,
      targetTile: value.targetTile === null ? null : cloneTile(value.targetTile),
      usesLaizi: value.usesLaizi,
    };
  }

  if (value.reason === "chaJiao") {
    if (!hasOnlyKeys(value, [
      "id", "batchId", "winnerSeatId", "winnerPlayerId", "loserSeatId", "loserPlayerId",
      "reason", "patterns", "genCount", "sourceWindowId", "sourceSettlementId",
      "basePoints", "rawPoints", "finalPoints", "relatedEvent",
    ]) || !Array.isArray(value.patterns) || !value.patterns.every(isScorePattern) ||
        !isSafeInteger(value.genCount)) {
      return null;
    }

    return {
      ...base,
      reason: "chaJiao",
      patterns: [...value.patterns],
      genCount: value.genCount,
    };
  }

  return null;
}

function isSettlementBase(value: Record<string, unknown>): value is Record<string, unknown> & {
  winnerSeatId: SeatId;
  winnerPlayerId: string;
  loserSeatId: SeatId;
  loserPlayerId: string;
  basePoints: number;
  rawPoints: number;
  finalPoints: number;
} {
  return isSeatId(value.winnerSeatId) && isNonEmptyString(value.winnerPlayerId) &&
    isSeatId(value.loserSeatId) && isNonEmptyString(value.loserPlayerId) &&
    isFiniteNumber(value.basePoints) && isFiniteNumber(value.rawPoints) &&
    isFiniteNumber(value.finalPoints);
}

function parseMobilePublicEvents(
  value: unknown,
  lastEventId: number,
): { ok: true; value: MobilePublicEvent[] } | { ok: false; reason: string } {
  if (!Array.isArray(value)) {
    return invalid("公开事件结构不合法");
  }

  const firstEventId = lastEventId - value.length + 1;
  if (firstEventId < 1 && value.length > 0) {
    return invalid("公开事件游标不合法");
  }

  const events: MobilePublicEvent[] = [];
  for (const [index, entry] of value.entries()) {
    const parsed = parseMobilePublicEvent(entry, firstEventId + index);
    if (parsed === undefined) {
      return invalid("公开事件结构不合法");
    }
    if (parsed !== null) {
      events.push(parsed);
    }
  }

  return { ok: true, value: events };
}

function parseMobilePublicEvent(value: unknown, eventId: number): MobilePublicEvent | null | undefined {
  if (!isRecord(value) || typeof value.type !== "string") {
    return undefined;
  }

  if (value.type === "playerJoined") {
    return hasOnlyKeys(value, ["type", "playerId", "displayName"]) &&
      isNonEmptyString(value.playerId) && typeof value.displayName === "string"
      ? { eventId, type: value.type, playerId: value.playerId, displayName: value.displayName }
      : undefined;
  }

  if (value.type === "seatTaken") {
    return hasOnlyKeys(value, ["type", "seatId", "playerId"]) && isSeatId(value.seatId) && isNonEmptyString(value.playerId)
      ? { eventId, type: value.type, seatId: value.seatId, playerId: value.playerId }
      : undefined;
  }

  if (value.type === "readyChanged") {
    return hasOnlyKeys(value, ["type", "seatId", "playerId", "ready"]) && isSeatId(value.seatId) &&
      isNonEmptyString(value.playerId) && typeof value.ready === "boolean"
      ? { eventId, type: value.type, seatId: value.seatId, playerId: value.playerId, ready: value.ready }
      : undefined;
  }

  if (value.type === "missingSuitChosen") {
    const allowed = hasAllowedKeys(value, ["type", "seatId", "playerId", "suit", "source"]);
    return allowed && isSeatId(value.seatId) && isNonEmptyString(value.playerId) && isSuit(value.suit) &&
      (value.source === undefined || value.source === "heavenly" || value.source === "timeout")
      ? {
          eventId,
          type: value.type,
          seatId: value.seatId,
          playerId: value.playerId,
          suit: value.suit,
          automatic: value.source === "heavenly" || value.source === "timeout",
        }
      : undefined;
  }

  if (value.type === "tileDiscarded") {
    return hasOnlyKeys(value, ["type", "seatId", "playerId", "tile"]) && isSeatId(value.seatId) &&
      isNonEmptyString(value.playerId) && isTile(value.tile)
      ? { eventId, type: value.type, seatId: value.seatId, playerId: value.playerId, tile: cloneTile(value.tile) }
      : undefined;
  }

  if (value.type === "pengClaimed" || value.type === "mingGangClaimed" || value.type === "baGangClaimed") {
    return hasOnlyKeys(value, ["type", "seatId", "playerId", "tile", "usedTiles"]) && isSeatId(value.seatId) &&
      isNonEmptyString(value.playerId) && isTile(value.tile) && Array.isArray(value.usedTiles) && value.usedTiles.every(isTile)
      ? { eventId, type: value.type, seatId: value.seatId, playerId: value.playerId, tile: cloneTile(value.tile) }
      : undefined;
  }

  if (value.type === "anGangClaimed") {
    return hasOnlyKeys(value, ["type", "seatId", "playerId", "usesLaizi"]) && isSeatId(value.seatId) &&
      isNonEmptyString(value.playerId) && typeof value.usesLaizi === "boolean"
      ? { eventId, type: value.type, seatId: value.seatId, playerId: value.playerId, usesLaizi: value.usesLaizi }
      : undefined;
  }

  if (value.type === "gangYaoJiExchanged") {
    const gangTypeValid = value.gangType === "mingGang" || value.gangType === "anGang" || value.gangType === "baGang";
    const targetValid = value.targetTile === null || isTile(value.targetTile);
    return hasOnlyKeys(value, ["type", "seatId", "playerId", "gangType", "targetTile"]) &&
      isSeatId(value.seatId) && isNonEmptyString(value.playerId) && gangTypeValid && targetValid &&
      (value.gangType === "anGang" || value.targetTile !== null)
      ? {
          eventId,
          type: value.type,
          seatId: value.seatId,
          playerId: value.playerId,
          gangType: value.gangType as "mingGang" | "anGang" | "baGang",
          targetTile: value.targetTile === null ? null : cloneTile(value.targetTile as Tile),
        }
      : undefined;
  }

  if (value.type === "huClaimed") {
    return parseHuPublicEvent(value, eventId);
  }

  if (value.type === "selfDrawHuClaimed") {
    return parseSelfDrawPublicEvent(value, eventId);
  }

  if (value.type === "qiangGangHuClaimed") {
    return parseQiangGangHuPublicEvent(value, eventId);
  }

  if (value.type === "presenceChanged") {
    return hasOnlyKeys(value, ["type", "playerId", "seatId", "connected", "reason"]) &&
      isNonEmptyString(value.playerId) && isSeatIdOrNull(value.seatId) && typeof value.connected === "boolean" &&
      (value.reason === "connectionClosed" || value.reason === "sessionResumed")
      ? {
          eventId,
          type: value.type,
          playerId: value.playerId,
          seatId: value.seatId,
          connected: value.connected,
          reason: value.reason,
        }
      : undefined;
  }

  if (value.type === "roundEnded") {
    return hasOnlyKeys(value, ["type", "reason", "remainingPlayerIds"]) && isRoundEndReason(value.reason) &&
      Array.isArray(value.remainingPlayerIds) && value.remainingPlayerIds.every(isSeatId)
      ? { eventId, type: value.type, reason: value.reason, remainingPlayerIds: [...value.remainingPlayerIds] }
      : undefined;
  }

  if (value.type === "nextDealerDecided") {
    return hasOnlyKeys(value, ["type", "completedRoundNumber", "nextDealerSeatId", "reason"]) &&
      isSafeInteger(value.completedRoundNumber) && isSeatId(value.nextDealerSeatId) && isNextDealerReason(value.reason)
      ? {
          eventId,
          type: value.type,
          completedRoundNumber: value.completedRoundNumber,
          nextDealerSeatId: value.nextDealerSeatId,
          reason: value.reason,
        }
      : undefined;
  }

  if (value.type === "gameFinished") {
    return hasOnlyKeys(value, ["type", "finishedBySeatId", "finishedByPlayerId", "completedRoundCount"]) &&
      isSeatId(value.finishedBySeatId) && isNonEmptyString(value.finishedByPlayerId) &&
      isSafeInteger(value.completedRoundCount)
      ? {
          eventId,
          type: value.type,
          finishedBySeatId: value.finishedBySeatId,
          finishedByPlayerId: value.finishedByPlayerId,
          completedRoundCount: value.completedRoundCount,
        }
      : undefined;
  }

  // Draws, response choices and window internals are intentionally not part of the mobile event contract.
  return null;
}

function parseHuPublicEvent(
  value: Record<string, unknown>,
  eventId: number,
): Extract<MobilePublicEvent, { type: "huClaimed" }> | undefined {
  return hasOnlyKeys(value, ["type", "seatId", "playerId", "tile", "patterns", "genCount", "points"]) &&
    isSeatId(value.seatId) && isNonEmptyString(value.playerId) && isTile(value.tile) &&
    Array.isArray(value.patterns) && value.patterns.every(isScorePattern) && isSafeInteger(value.genCount) &&
    isFiniteNumber(value.points)
    ? {
        eventId,
        type: "huClaimed",
        seatId: value.seatId,
        playerId: value.playerId,
        tile: cloneTile(value.tile),
        patterns: [...value.patterns],
        genCount: value.genCount,
        points: value.points,
      }
    : undefined;
}

function parseSelfDrawPublicEvent(
  value: Record<string, unknown>,
  eventId: number,
): Extract<MobilePublicEvent, { type: "selfDrawHuClaimed" }> | undefined {
  return hasOnlyKeys(value, ["type", "seatId", "playerId", "patterns", "genCount", "points"]) &&
    isSeatId(value.seatId) && isNonEmptyString(value.playerId) && Array.isArray(value.patterns) &&
    value.patterns.every(isScorePattern) && isSafeInteger(value.genCount) && isFiniteNumber(value.points)
    ? {
        eventId,
        type: "selfDrawHuClaimed",
        seatId: value.seatId,
        playerId: value.playerId,
        patterns: [...value.patterns],
        genCount: value.genCount,
        points: value.points,
      }
    : undefined;
}

function parseQiangGangHuPublicEvent(
  value: Record<string, unknown>,
  eventId: number,
): Extract<MobilePublicEvent, { type: "qiangGangHuClaimed" }> | undefined {
  return hasOnlyKeys(value, [
    "type", "seatId", "playerId", "responsibleSeatId", "responsiblePlayerId", "tile", "patterns", "genCount", "points",
  ]) && isSeatId(value.seatId) && isNonEmptyString(value.playerId) && isSeatId(value.responsibleSeatId) &&
    isNonEmptyString(value.responsiblePlayerId) && isTile(value.tile) && Array.isArray(value.patterns) &&
    value.patterns.every(isScorePattern) && isSafeInteger(value.genCount) && isFiniteNumber(value.points)
    ? {
        eventId,
        type: "qiangGangHuClaimed",
        seatId: value.seatId,
        playerId: value.playerId,
        responsibleSeatId: value.responsibleSeatId,
        responsiblePlayerId: value.responsiblePlayerId,
        tile: cloneTile(value.tile),
        patterns: [...value.patterns],
        genCount: value.genCount,
        points: value.points,
      }
    : undefined;
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

function hasAllowedKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
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
function isRoundEndReason(value: unknown): value is RoundEndReason {
  return value === "onePlayerLeft" || value === "wallEmpty";
}
function isGameStatus(value: unknown): value is GameStatus {
  return value === "waiting" || value === "playingRound" || value === "betweenRounds" || value === "finished";
}
function isNextDealerReason(value: unknown): value is NextDealerReason {
  return value === "qiangGangDeclarer" || value === "multipleHuDiscarder" ||
    value === "firstWinner" || value === "wallEmptyDealerKeeps";
}
function isScorePattern(value: unknown): value is ScorePattern {
  return value === "pingHu" || value === "daDui" || value === "danDiao" || value === "qingYiSe" ||
    value === "xiaoQiDui" || value === "longQiDui" || value === "shuangLongQiDui" ||
    value === "sanLongQiDui" || value === "wuJi";
}
function isRank(value: unknown): value is Rank {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9;
}
function isTile(value: unknown): value is Tile {
  return isRecord(value) && hasOnlyKeys(value, ["suit", "rank"]) && isSuit(value.suit) && isRank(value.rank);
}
function isClientOwnedTile(value: unknown): value is ClientOwnedTile {
  return isRecord(value) && hasOnlyKeys(value, ["suit", "rank", "tileId"]) &&
    isSuit(value.suit) && isRank(value.rank) && isNonEmptyString(value.tileId);
}
function cloneTile(value: Tile): Tile {
  return { suit: value.suit, rank: value.rank };
}
function cloneOwnedTile(value: ClientOwnedTile): ClientOwnedTile {
  return { suit: value.suit, rank: value.rank, tileId: value.tileId };
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
