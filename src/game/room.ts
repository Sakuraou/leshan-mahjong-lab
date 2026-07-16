import type {
  BaGangPaymentEligibility,
  ClientActionDescriptor,
  ClientBaGangCandidate,
  ClientLegalAction,
  ClientOwnedTile,
  ClientYaoJiExchangeCandidate,
} from "@leshan-mahjong/client-core";
import {
  discardTile as discardRoundTile,
  drawTile as drawRoundTile,
  startRound,
  type DiscardTileResult,
  type DrawTileResult,
} from "./round.ts";
import { huDecompositionSignature, type HuDecomposition } from "./hu.ts";
import { isYaoJi, samePhysicalTile, sameTile, SUITS, tile, tileFace, tileKey } from "./tiles.ts";
import { checkCurrentPlayerHu, checkDiscardHu, type WinCheckResult } from "./win.ts";
import {
  applyChaJiaoSettlementBatch,
  applyChickenSettlementBatch,
  applyGangSettlementBatch,
  applyHuSettlementBatch,
  calculateChickenSettlement,
  calculateGangPoints,
  createInitialScoreBalances,
  type ChaJiaoSettlementEntry,
  type ChaJiaoSettlementTransfer,
  type ChickenSettlementTransfer,
  type ChickenSuit,
  type GangSettlementEntry,
  type GangSettlementTransfer,
  type HuSettlementEventType,
  type HuSettlementReason,
  type HuSettlementTransfer,
  type PlayerScoreBalance,
  type RoundEndReason,
  type SettlementLedgerEntry,
} from "./rules.ts";
import type {
  GangType,
  Meld,
  PhysicalTile,
  PlayerId,
  Rank,
  RoundState,
  ScorePattern,
  Suit,
  Tile,
} from "./types.ts";

const seatIds: PlayerId[] = [0, 1, 2, 3];
export const DEFAULT_RESPONSE_WINDOW_TIMEOUT_MS = 15_000;

export type ResponseWindowKind = "discardClaim" | "qiangGang";
export type ResponseWindowStatus = "open" | "expired";
export type ResponseWindowTiming = { now?: number; timeoutMs?: number };
export type DiscardRoomTileOptions = ResponseWindowTiming & { tileId?: string };

type ResponseWindowMetadata = {
  windowId: string;
  deadlineAt: number;
  status: ResponseWindowStatus;
};

export type RoomStatus = "waiting" | "dingque" | "playing" | "ended";

export type GameStatus = "waiting" | "playingRound" | "betweenRounds" | "finished";

export type NextDealerReason =
  | "qiangGangDeclarer"
  | "multipleHuDiscarder"
  | "firstWinner"
  | "wallEmptyDealerKeeps";

export type NextDealerDecision = {
  readonly roundId: string;
  readonly completedRoundNumber: number;
  readonly nextDealerSeatId: PlayerId;
  readonly reason: NextDealerReason;
  readonly firstWinnerSeatId: PlayerId | null;
  readonly multipleHuDiscarderSeatId: PlayerId | null;
};

export type HuOutcomeFact = {
  readonly roundId: string;
  readonly outcomeId: string;
  readonly method: "selfDraw" | "discard" | "qiangGang";
  readonly winnerSeatIds: readonly PlayerId[];
  readonly responsibleSeatId: PlayerId | null;
};

export type RoundScoreDelta = {
  readonly seatId: PlayerId;
  readonly playerId: string | null;
  readonly beforePoints: number;
  readonly delta: number;
  readonly afterPoints: number;
};

export type RoundHistoryEntry = {
  readonly roundId: string;
  readonly roundNumber: number;
  readonly dealerSeatId: PlayerId;
  readonly roundEnd: RoundEndState;
  readonly nextDealerDecision: NextDealerDecision;
  readonly scoreDeltas: readonly RoundScoreDelta[];
  readonly settlementLedger: readonly SettlementLedgerEntry[];
};

export type ClientVisibleRoundHistoryEntry = {
  roundId: string;
  roundNumber: number;
  dealerSeatId: PlayerId;
  roundEnd: RoundEndState;
  nextDealerDecision: NextDealerDecision;
  scoreDeltas: RoundScoreDelta[];
};

export type ClientVisibleGameEndState = Omit<GameEndState, "finalScores"> & {
  finalScores: PlayerScoreBalance[];
};

export type GameEndState = {
  readonly finishedBySeatId: PlayerId;
  readonly finishedByPlayerId: string;
  readonly completedRoundCount: number;
  readonly finalScores: readonly PlayerScoreBalance[];
};

export type RoundPhase = "dingque" | "draw" | "discard" | "claim" | "gangDraw" | "qiangGang" | "ended";

export type { ClientActionDescriptor, ClientLegalAction } from "@leshan-mahjong/client-core";

export type ClaimWindow = ResponseWindowMetadata & {
  discardedBySeatId: PlayerId;
  discardedByPlayerId: string;
  tile: Tile;
  nextPlayer: PlayerId;
  pendingPlayerIds: PlayerId[];
  passedPlayerIds: PlayerId[];
  huClaims: HuClaim[];
  meldClaims: MeldClaim[];
};

export type HuClaim = {
  seatId: PlayerId;
  playerId: string;
  patterns: ScorePattern[];
  genCount: number;
  rawPoints: number;
  points: number;
};

export type MeldClaim = {
  seatId: PlayerId;
  playerId: string;
  type: "peng" | "mingGang";
  usedTiles: Tile[];
};

export type BaGangClaimWindow = ResponseWindowMetadata & {
  upgradedBySeatId: PlayerId;
  upgradedByPlayerId: string;
  targetTile: Tile;
  tile: PhysicalTile;
  pengMeldIndex: number;
  candidateId: string;
  paymentEligibility: BaGangPaymentEligibility;
  pointsPerPayer: 0 | 1 | 2;
  pendingPlayerIds: PlayerId[];
  passedPlayerIds: PlayerId[];
  huClaims: HuClaim[];
};

type BaGangCandidate = {
  candidateId: string;
  pengMeldIndex: number;
  targetTile: Tile;
  addedTile: PhysicalTile;
  usesLaizi: boolean;
  paymentEligibility: BaGangPaymentEligibility;
  payerSeatIds: PlayerId[];
  pointsPerPayer: 0 | 1 | 2;
};

type YaoJiExchangeCandidate = {
  candidateId: string;
  meldIndex: number;
  gangType: "mingGang" | "anGang" | "baGang";
  targetTile: Tile;
  naturalTile: PhysicalTile;
  returnedYaoJi: PhysicalTile;
};

export type ClientResponseChoice = "pass" | "hu" | "peng" | "mingGang";

type ClientVisibleResponseState = {
  pendingResponderCount: number;
  hasRespondedByMe: boolean;
  responseByMe: ClientResponseChoice | null;
};

export type ClientVisibleClaimWindow = ResponseWindowMetadata &
  ClientVisibleResponseState & {
    discardedBySeatId: PlayerId;
    discardedByPlayerId: string;
    tile: Tile;
  };

export type ClientVisibleBaGangClaimWindow = ResponseWindowMetadata &
  ClientVisibleResponseState & {
    upgradedBySeatId: PlayerId;
    upgradedByPlayerId: string;
    targetTile: Tile;
    tile: Tile;
  };

export type ClientVisibleResponseWindow = {
  windowId: string;
  kind: ResponseWindowKind;
  deadlineAt: number;
  remainingMs: number;
  status: ResponseWindowStatus;
} & ClientVisibleResponseState;

export type GangDrawState = {
  seatId: PlayerId;
  playerId: string;
  gangType: "mingGang" | "anGang" | "baGang";
  tile: Tile;
};

export type GangSettlementPayer = {
  readonly seatId: PlayerId;
  readonly playerId: string;
};

export type GangSettlementFact = {
  readonly gangId: string;
  readonly gangType: GangType;
  readonly gangSeatId: PlayerId;
  readonly gangPlayerId: string;
  readonly targetTile: Tile;
  readonly physicalTiles: readonly PhysicalTile[];
  readonly usesLaizi: boolean;
  readonly payers: readonly GangSettlementPayer[];
  readonly pointsPerPayer: 0 | 1 | 2 | 4;
  readonly paymentEligibility: BaGangPaymentEligibility | "normal";
  readonly sourceWindowId: string | null;
  readonly relatedEventType: "mingGangClaimed" | "anGangClaimed" | "baGangClaimed";
};

export type ClientVisibleGangSettlementFact = {
  gangType: GangType;
  gangSeatId: PlayerId;
  gangPlayerId: string;
  targetTile: Tile | null;
  usesLaizi: boolean;
  payerSeatIds: PlayerId[];
  pointsPerPayer: 0 | 1 | 2 | 4;
  paymentEligibility: BaGangPaymentEligibility | "normal";
};

export type RoundEndState = {
  reason: RoundEndReason;
  remainingPlayerIds: PlayerId[];
};

export type ChaJiaoPlayerResult = {
  seatId: PlayerId;
  playerId: string | null;
  isListening: boolean;
  bestWinningTile: Tile | null;
  patterns: ScorePattern[];
  genCount: number;
  rawHuPoints: number | null;
  maxHuPoints: number | null;
};

export type ChaJiaoResult = {
  reason: "wallEmpty";
  players: ChaJiaoPlayerResult[];
};

export type ChaJiaoSettlementPayer = {
  readonly seatId: PlayerId;
  readonly playerId: string;
};

export type ChaJiaoSettlementFact = {
  readonly factId: string;
  readonly winnerSeatId: PlayerId;
  readonly winnerPlayerId: string;
  readonly payers: readonly ChaJiaoSettlementPayer[];
  readonly winningTile: Tile;
  readonly decomposition: HuDecomposition;
  readonly patterns: readonly ScorePattern[];
  readonly genCount: number;
  readonly rawPoints: number;
  readonly points: number;
};

export type RoomMember = {
  playerId: string;
  displayName: string;
  connected: boolean;
};

export type SeatState = {
  seatId: PlayerId;
  playerId: string | null;
  displayName: string | null;
  connected: boolean;
  ready: boolean;
};

export type PresenceChangeReason = "connectionClosed" | "sessionResumed";

export type RoomEvent =
  | { type: "roomCreated"; roomId: string }
  | { type: "playerJoined"; playerId: string; displayName: string }
  | { type: "seatTaken"; seatId: PlayerId; playerId: string }
  | { type: "readyChanged"; seatId: PlayerId; playerId: string; ready: boolean }
  | {
      type: "presenceChanged";
      playerId: string;
      seatId: PlayerId | null;
      connected: boolean;
      reason: PresenceChangeReason;
    }
  | { type: "roundStarted"; dealer: PlayerId }
  | {
      type: "missingSuitChosen";
      seatId: PlayerId;
      playerId: string;
      suit: Suit;
      source?: "heavenly";
    }
  | { type: "tileDrawn"; seatId: PlayerId; playerId: string }
  | { type: "tileDiscarded"; seatId: PlayerId; playerId: string; tile: Tile }
  | { type: "claimWindowOpened"; discardedBySeatId: PlayerId; tile: Tile; pendingResponderCount: number }
  | { type: "claimPassed"; seatId: PlayerId; playerId: string }
  | {
      type: "huClaimed";
      seatId: PlayerId;
      playerId: string;
      tile: Tile;
      patterns: ScorePattern[];
      genCount: number;
      points: number;
    }
  | {
      type: "selfDrawHuClaimed";
      seatId: PlayerId;
      playerId: string;
      patterns: ScorePattern[];
      genCount: number;
      points: number;
    }
  | { type: "pengClaimed"; seatId: PlayerId; playerId: string; tile: Tile; usedTiles: Tile[] }
  | { type: "mingGangClaimed"; seatId: PlayerId; playerId: string; tile: Tile; usedTiles: Tile[] }
  | { type: "anGangClaimed"; seatId: PlayerId; playerId: string; tile: Tile; usedTiles: Tile[] }
  | { type: "baGangDeclared"; seatId: PlayerId; playerId: string; tile: Tile; addedTile: Tile }
  | { type: "baGangClaimed"; seatId: PlayerId; playerId: string; tile: Tile; usedTiles: Tile[] }
  | {
      type: "gangYaoJiExchanged";
      seatId: PlayerId;
      playerId: string;
      gangType: "mingGang" | "anGang" | "baGang";
      targetTile: Tile;
      addedTile: PhysicalTile;
      returnedYaoJi: PhysicalTile;
      gangId: string | null;
    }
  | { type: "qiangGangPassed"; seatId: PlayerId; playerId: string }
  | {
      type: "qiangGangHuClaimed";
      seatId: PlayerId;
      playerId: string;
      responsibleSeatId: PlayerId;
      responsiblePlayerId: string;
      tile: Tile;
      patterns: ScorePattern[];
      genCount: number;
      points: number;
    }
  | {
      type: "qiangGangWindowClosed";
      reason: "allPassed" | "robbed" | "timeoutAllPassed" | "timeoutRobbed";
    }
  | {
      type: "responseWindowExpired";
      windowId: string;
      kind: ResponseWindowKind;
      timedOutPlayerIds: PlayerId[];
      outcome: "allPassed" | "claimed" | "robbed";
    }
  | { type: "gangTileDrawn"; seatId: PlayerId; playerId: string; gangType: GangDrawState["gangType"] }
  | { type: "roundEnded"; reason: RoundEndState["reason"]; remainingPlayerIds: PlayerId[] }
  | {
      type: "nextDealerDecided";
      completedRoundNumber: number;
      nextDealerSeatId: PlayerId;
      reason: NextDealerReason;
    }
  | {
      type: "gameFinished";
      finishedBySeatId: PlayerId;
      finishedByPlayerId: string;
      completedRoundCount: number;
    }
  | { type: "claimWindowClosed"; reason: "allPassed" | "timeout" | "claimed"; nextPlayer: PlayerId };

export type ClientRoomEvent =
  | Exclude<RoomEvent, { type: "anGangClaimed" } | { type: "gangYaoJiExchanged" }>
  | { type: "anGangClaimed"; seatId: PlayerId; playerId: string; usesLaizi: boolean }
  | {
      type: "gangYaoJiExchanged";
      seatId: PlayerId;
      playerId: string;
      gangType: "mingGang" | "anGang" | "baGang";
      targetTile: Tile | null;
    };

export type ClientVisibleGangDrawState = Omit<GangDrawState, "tile"> & {
  tile: Tile | null;
};

export type ClientVisibleMeld =
  | Meld
  | { type: "anGang"; tile: null; tiles: []; fromPlayer: null };

export type RoomState = {
  id: string;
  seed: string;
  roundNumber: number;
  gameStatus: GameStatus;
  status: RoomStatus;
  phase: RoundPhase | null;
  currentDealer: PlayerId;
  dealerHistory: PlayerId[];
  firstWinnerSeatId: PlayerId | null;
  multipleHuDiscarderSeatId: PlayerId | null;
  huOutcomeFacts: HuOutcomeFact[];
  nextDealerDecision: NextDealerDecision | null;
  roundStartScores: PlayerScoreBalance[];
  roundHistory: RoundHistoryEntry[];
  gameEnd: GameEndState | null;
  selfDrawEligible: boolean;
  lastDrawnTileId: string | null;
  ruleOptions: RoomRuleOptions;
  members: RoomMember[];
  seats: SeatState[];
  round: RoundState | null;
  claimWindow: ClaimWindow | null;
  baGangClaimWindow: BaGangClaimWindow | null;
  gangDraw: GangDrawState | null;
  roundEnd: RoundEndState | null;
  chaJiao: ChaJiaoResult | null;
  scores: PlayerScoreBalance[];
  settlementLedger: SettlementLedgerEntry[];
  gangSettlementFacts: GangSettlementFact[];
  chaJiaoSettlementFacts: ChaJiaoSettlementFact[];
  resolvedSettlementIds: string[];
  resolvedWindowIds: string[];
  eventLog: RoomEvent[];
};

export type ClientVisibleGangSettlementEntry = Omit<
  GangSettlementEntry,
  "gangId" | "physicalTiles" | "targetTile"
> & {
  targetTile: Tile | null;
};

export type ClientVisibleChaJiaoSettlementEntry = Omit<
  ChaJiaoSettlementEntry,
  "chaJiaoId" | "winningTile"
>;

export type ClientVisibleChaJiaoPlayerResult = Omit<
  ChaJiaoPlayerResult,
  "bestWinningTile" | "rawHuPoints"
>;

export type ClientVisibleChaJiaoResult = {
  reason: "wallEmpty";
  players: ClientVisibleChaJiaoPlayerResult[];
};

export type ClientVisibleSettlementLedgerEntry =
  | Exclude<SettlementLedgerEntry, GangSettlementEntry | ChaJiaoSettlementEntry>
  | ClientVisibleGangSettlementEntry
  | ClientVisibleChaJiaoSettlementEntry;

export type VisiblePlayerState = {
  id: PlayerId;
  hand: ClientOwnedTile[] | null;
  handCount: number;
  discards: Tile[];
  melds: ClientVisibleMeld[];
  hasWon: boolean;
  missingSuit: RoundState["players"][number]["missingSuit"];
};

export type ClientVisibleRoomState = {
  id: string;
  gameStatus: GameStatus;
  status: RoomStatus;
  phase: RoundPhase | null;
  roundNumber: number;
  currentDealer: PlayerId;
  dealerHistory: PlayerId[];
  nextDealerDecision: NextDealerDecision | null;
  roundHistory: ClientVisibleRoundHistoryEntry[];
  gameEnd: ClientVisibleGameEndState | null;
  legalActions: ClientLegalAction[];
  actionDescriptors: ClientActionDescriptor[];
  localSeatId: PlayerId | null;
  members: Array<RoomMember & { seatId: PlayerId | null }>;
  seats: SeatState[];
  round:
    | null
    | {
        dealer: PlayerId;
        currentPlayer: PlayerId;
        wallCount: number;
        players: VisiblePlayerState[];
      };
  claimWindow: ClientVisibleClaimWindow | null;
  baGangClaimWindow: ClientVisibleBaGangClaimWindow | null;
  gangDraw: ClientVisibleGangDrawState | null;
  roundEnd: RoundEndState | null;
  chaJiao: ClientVisibleChaJiaoResult | null;
  scores: PlayerScoreBalance[];
  settlementLedger: ClientVisibleSettlementLedgerEntry[];
  gangSettlements: ClientVisibleGangSettlementFact[];
  responseWindow: ClientVisibleResponseWindow | null;
  eventLog: ClientRoomEvent[];
};

export type CreateRoomInput = {
  id: string;
  seed: string;
};

export type RoomRuleOptions = {
  yaoJiExchangeQiangGang: "disabled";
};

export type JoinRoomInput = {
  playerId: string;
  displayName: string;
};

export type TakeSeatResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "roomAlreadyStarted" | "playerNotInRoom" | "seatOccupied" | "playerAlreadySeated" };

export type JoinRoomResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "roomAlreadyStarted" | "playerAlreadyJoined" };

export type ToggleReadyResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "roomAlreadyStarted" | "playerNotSeated" };

export type StartRoomRoundResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "roomAlreadyStarted" | "notEnoughPlayers" | "notAllPlayersReady" };

export type ReadyNextRoundResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "playerNotSeated" | "roundNotFinished" | "gameFinished" };

export type StartNextRoundResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason: "roomAlreadyStarted" | "notEnoughPlayers" | "notAllPlayersReady" | "nextDealerUnavailable" | "gameFinished";
    };

export type FinishGameResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "playerNotInRoom" | "roundNotFinished" };

export type ChooseMissingSuitResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "roundNotStarted" | "playerNotSeated" | "missingSuitAlreadyChosen" };

export type DrawRoomTileResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "missingSuitNotSet"
        | "roundFinished"
        | "claimWindowOpen"
        | "gangDrawPending"
        | "notCurrentPlayer"
        | "notDrawPhase"
        | ResultFailureReason<DrawTileResult>;
    };

export type DrawGangTileResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "missingSuitNotSet"
        | "roundFinished"
        | "claimWindowOpen"
        | "noGangDraw"
        | "notCurrentPlayer"
        | ResultFailureReason<DrawTileResult>;
    };

export type DiscardRoomTileResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "missingSuitNotSet"
        | "roundFinished"
        | "claimWindowOpen"
        | "gangDrawPending"
        | "notCurrentPlayer"
        | "notDiscardPhase"
        | ResultFailureReason<DiscardTileResult>;
    };

type ResultFailureReason<TResult> = TResult extends { ok: false; reason: infer TReason } ? TReason : never;

export type PassClaimResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason: "roundNotStarted" | "playerNotSeated" | "noClaimWindow" | "claimNotAllowed" | "claimAlreadyResponded";
    };

export type ClaimHuResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "roundFinished"
        | "noClaimWindow"
        | "claimNotAllowed"
        | "claimAlreadyResponded"
        | "cannotHu";
    };

export type ClaimSelfDrawHuResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "roundFinished"
        | "missingSuitNotSet"
        | "claimWindowOpen"
        | "gangDrawPending"
        | "notCurrentPlayer"
        | "notDiscardPhase"
        | "cannotHu";
    };

export type ClaimPengResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "roundFinished"
        | "noClaimWindow"
        | "claimNotAllowed"
        | "claimAlreadyResponded"
        | "cannotPeng";
    };

export type ClaimMingGangResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "roundFinished"
        | "noClaimWindow"
        | "claimNotAllowed"
        | "claimAlreadyResponded"
        | "cannotMingGang";
    };

export type ClaimAnGangResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "roundFinished"
        | "missingSuitNotSet"
        | "claimWindowOpen"
        | "gangDrawPending"
        | "notCurrentPlayer"
        | "notDiscardPhase"
        | "cannotAnGang";
    };

export type ClaimBaGangResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "roundFinished"
        | "missingSuitNotSet"
        | "claimWindowOpen"
        | "gangDrawPending"
        | "notCurrentPlayer"
        | "notDiscardPhase"
        | "cannotBaGang";
    };

export type ExchangeGangYaoJiResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "roundFinished"
        | "missingSuitNotSet"
        | "claimWindowOpen"
        | "gangDrawPending"
        | "notCurrentPlayer"
        | "notDiscardPhase"
        | "cannotExchangeGangYaoJi";
    };

export type PassQiangGangResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason: "roundNotStarted" | "playerNotSeated" | "noQiangGangWindow" | "claimNotAllowed" | "claimAlreadyResponded";
    };

export type ClaimQiangGangHuResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "roundFinished"
        | "noQiangGangWindow"
        | "claimNotAllowed"
        | "claimAlreadyResponded"
        | "cannotHu";
    };

export type ExpireClaimWindowResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "noClaimWindow" | "windowMismatch" | "deadlineNotReached" };

export type ExpireQiangGangWindowResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "noQiangGangWindow" | "windowMismatch" | "deadlineNotReached" };

export type TickRoomDeadlinesResult = {
  room: RoomState;
  changed: boolean;
  expiredWindowId: string | null;
};

export function createRoom(input: CreateRoomInput): RoomState {
  const scores = createInitialScoreBalances();

  return {
    id: input.id,
    seed: input.seed,
    roundNumber: 0,
    gameStatus: "waiting",
    status: "waiting",
    phase: null,
    currentDealer: 0,
    dealerHistory: [],
    firstWinnerSeatId: null,
    multipleHuDiscarderSeatId: null,
    huOutcomeFacts: [],
    nextDealerDecision: null,
    roundStartScores: cloneScores(scores),
    roundHistory: [],
    gameEnd: null,
    selfDrawEligible: false,
    lastDrawnTileId: null,
    ruleOptions: { yaoJiExchangeQiangGang: "disabled" },
    members: [],
    seats: seatIds.map((seatId) => ({
      seatId,
      playerId: null,
      displayName: null,
      connected: false,
      ready: false,
    })),
    round: null,
    claimWindow: null,
    baGangClaimWindow: null,
    gangDraw: null,
    roundEnd: null,
    chaJiao: null,
    scores,
    settlementLedger: [],
    gangSettlementFacts: [],
    chaJiaoSettlementFacts: [],
    resolvedSettlementIds: [],
    resolvedWindowIds: [],
    eventLog: [{ type: "roomCreated", roomId: input.id }],
  };
}

export function joinRoom(room: RoomState, input: JoinRoomInput): JoinRoomResult {
  if (room.status !== "waiting") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  if (room.members.some((member) => member.playerId === input.playerId)) {
    return { ok: false, reason: "playerAlreadyJoined" };
  }

  return {
    ok: true,
    room: {
      ...room,
      members: [...room.members, { ...input, connected: true }],
      eventLog: [...room.eventLog, { type: "playerJoined", ...input }],
    },
  };
}

export type SetPlayerPresenceResult = {
  room: RoomState;
  changed: boolean;
};

export function setPlayerPresence(
  room: RoomState,
  playerId: string,
  connected: boolean,
  reason: PresenceChangeReason,
): SetPlayerPresenceResult {
  const member = room.members.find((value) => value.playerId === playerId);

  if (member === undefined) {
    return { room, changed: false };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (member.connected === connected && (seat === undefined || seat.connected === connected)) {
    return { room, changed: false };
  }

  return {
    changed: true,
    room: {
      ...room,
      members: room.members.map((value) =>
        value.playerId === playerId ? { ...value, connected } : value,
      ),
      seats:
        seat === undefined
          ? room.seats
          : replaceSeat(room.seats, seat.seatId, { ...seat, connected }),
      eventLog: [
        ...room.eventLog,
        {
          type: "presenceChanged",
          playerId,
          seatId: seat?.seatId ?? null,
          connected,
          reason,
        },
      ],
    },
  };
}

export function takeSeat(room: RoomState, playerId: string, seatId: PlayerId): TakeSeatResult {
  if (room.status !== "waiting") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  const member = room.members.find((value) => value.playerId === playerId);

  if (member === undefined) {
    return { ok: false, reason: "playerNotInRoom" };
  }

  if (room.seats.some((seat) => seat.playerId === playerId)) {
    return { ok: false, reason: "playerAlreadySeated" };
  }

  const seat = room.seats[seatId];

  if (seat.playerId !== null) {
    return { ok: false, reason: "seatOccupied" };
  }

  return {
    ok: true,
    room: {
      ...room,
      seats: replaceSeat(room.seats, seatId, {
        ...seat,
        playerId,
        displayName: member.displayName,
        connected: member.connected,
        ready: false,
      }),
      scores: room.scores.map((score) =>
        score.seatId === seatId ? { ...score, playerId } : score,
      ),
      eventLog: [...room.eventLog, { type: "seatTaken", seatId, playerId }],
    },
  };
}

export function toggleReady(room: RoomState, playerId: string): ToggleReadyResult {
  if (room.status !== "waiting") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  const nextSeat = { ...seat, ready: !seat.ready };

  return {
    ok: true,
    room: {
      ...room,
      seats: replaceSeat(room.seats, seat.seatId, nextSeat),
      eventLog: [
        ...room.eventLog,
        { type: "readyChanged", seatId: seat.seatId, playerId, ready: nextSeat.ready },
      ],
    },
  };
}

export function startRoomRound(room: RoomState, dealer: PlayerId = 0): StartRoomRoundResult {
  if (room.gameStatus !== "waiting" || room.status !== "waiting") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  if (room.seats.some((seat) => seat.playerId === null)) {
    return { ok: false, reason: "notEnoughPlayers" };
  }

  if (room.seats.some((seat) => !seat.ready)) {
    return { ok: false, reason: "notAllPlayersReady" };
  }

  return { ok: true, room: startRoundWithDealer(room, dealer) };
}

export function readyNextRound(room: RoomState, playerId: string): ReadyNextRoundResult {
  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.gameStatus === "finished") {
    return { ok: false, reason: "gameFinished" };
  }

  if (room.gameStatus !== "betweenRounds") {
    return { ok: false, reason: "roundNotFinished" };
  }

  if (seat.ready) {
    return { ok: true, room };
  }

  return {
    ok: true,
    room: {
      ...room,
      seats: replaceSeat(room.seats, seat.seatId, { ...seat, ready: true }),
      eventLog: [...room.eventLog, { type: "readyChanged", seatId: seat.seatId, playerId, ready: true }],
    },
  };
}

export function startNextRound(room: RoomState): StartNextRoundResult {
  if (room.gameStatus === "finished") {
    return { ok: false, reason: "gameFinished" };
  }

  if (room.gameStatus !== "betweenRounds") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  if (room.seats.some((seat) => seat.playerId === null)) {
    return { ok: false, reason: "notEnoughPlayers" };
  }

  if (room.seats.some((seat) => !seat.ready)) {
    return { ok: false, reason: "notAllPlayersReady" };
  }

  if (room.nextDealerDecision === null) {
    return { ok: false, reason: "nextDealerUnavailable" };
  }

  return {
    ok: true,
    room: startRoundWithDealer(room, room.nextDealerDecision.nextDealerSeatId),
  };
}

export function finishGame(room: RoomState, playerId: string): FinishGameResult {
  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotInRoom" };
  }

  if (room.gameStatus === "finished") {
    return { ok: true, room };
  }

  if (room.gameStatus !== "betweenRounds") {
    return { ok: false, reason: "roundNotFinished" };
  }

  return {
    ok: true,
    room: {
      ...room,
      gameStatus: "finished",
      gameEnd: {
        finishedBySeatId: seat.seatId,
        finishedByPlayerId: playerId,
        completedRoundCount: room.roundHistory.length,
        finalScores: cloneScores(room.scores),
      },
      eventLog: [
        ...room.eventLog,
        {
          type: "gameFinished",
          finishedBySeatId: seat.seatId,
          finishedByPlayerId: playerId,
          completedRoundCount: room.roundHistory.length,
        },
      ],
    },
  };
}

function startRoundWithDealer(room: RoomState, dealer: PlayerId): RoomState {
  const nextRoundNumber = room.roundNumber + 1;
  const roundSeed = nextRoundNumber === 1 ? room.seed : `${room.seed}:round:${nextRoundNumber}`;

  const startedRound = startRound({ seed: roundSeed, dealer });
  const players = startedRound.players.map((player) => ({
    ...player,
    missingSuit: detectHeavenlyMissingSuit(player.hand),
  }));
  const allMissingSuitsChosen = players.every((player) => player.missingSuit !== null);
  const heavenlyMissingSuitEvents: RoomEvent[] = players.flatMap((player) => {
    if (player.missingSuit === null) {
      return [];
    }

    const seat = room.seats[player.id];
    return [{
      type: "missingSuitChosen" as const,
      seatId: player.id,
      playerId: seat.playerId!,
      suit: player.missingSuit,
      source: "heavenly" as const,
    }];
  });

  return {
    ...room,
    roundNumber: nextRoundNumber,
    gameStatus: "playingRound",
    status: allMissingSuitsChosen ? "playing" : "dingque",
    phase: allMissingSuitsChosen ? "discard" : "dingque",
    currentDealer: dealer,
    dealerHistory: [...room.dealerHistory, dealer],
    firstWinnerSeatId: null,
    multipleHuDiscarderSeatId: null,
    huOutcomeFacts: [],
    nextDealerDecision: null,
    roundStartScores: cloneScores(room.scores),
    gameEnd: null,
    selfDrawEligible: true,
    lastDrawnTileId: startedRound.players[dealer].hand.at(-1)?.instanceId ?? null,
    round: { ...startedRound, players },
    claimWindow: null,
    baGangClaimWindow: null,
    gangDraw: null,
    roundEnd: null,
    chaJiao: null,
    settlementLedger: [],
    gangSettlementFacts: [],
    chaJiaoSettlementFacts: [],
    resolvedSettlementIds: [],
    resolvedWindowIds: [],
    eventLog: [
      ...room.eventLog,
      { type: "roundStarted", dealer },
      ...heavenlyMissingSuitEvents,
    ],
  };
}

export function detectHeavenlyMissingSuit(hand: readonly Tile[]): Suit | null {
  const ordinarySuitCounts = new Map<Suit, number>(SUITS.map((suit) => [suit, 0]));

  for (const value of hand) {
    if (!isYaoJi(value)) {
      ordinarySuitCounts.set(value.suit, ordinarySuitCounts.get(value.suit)! + 1);
    }
  }

  const missingSuits = SUITS.filter((suit) => ordinarySuitCounts.get(suit) === 0);
  return missingSuits.length === 1 ? missingSuits[0] : null;
}

export function chooseMissingSuit(room: RoomState, playerId: string, suit: Suit): ChooseMissingSuitResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  const player = room.round.players[seat.seatId];

  if (player.missingSuit !== null) {
    return { ok: false, reason: "missingSuitAlreadyChosen" };
  }

  const nextRound: RoundState = {
    ...room.round,
    players: room.round.players.map((value) =>
      value.id === seat.seatId ? { ...value, missingSuit: suit } : value,
    ),
  };
  const allMissingSuitsChosen = nextRound.players.every((value) => value.missingSuit !== null);

  return {
    ok: true,
    room: {
      ...room,
      status: allMissingSuitsChosen ? "playing" : "dingque",
      phase: allMissingSuitsChosen ? "discard" : "dingque",
      round: nextRound,
      eventLog: [...room.eventLog, { type: "missingSuitChosen", seatId: seat.seatId, playerId, suit }],
    },
  };
}

export function drawRoomTile(room: RoomState, playerId: string): DrawRoomTileResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.round.players.some((player) => player.missingSuit === null)) {
    return { ok: false, reason: "missingSuitNotSet" };
  }

  if (room.roundEnd !== null) {
    return { ok: false, reason: "roundFinished" };
  }

  if (room.claimWindow !== null) {
    return { ok: false, reason: "claimWindowOpen" };
  }

  if (room.gangDraw !== null) {
    return { ok: false, reason: "gangDrawPending" };
  }

  if (room.round.currentPlayer !== seat.seatId) {
    return { ok: false, reason: "notCurrentPlayer" };
  }

  if (room.phase !== "draw") {
    return { ok: false, reason: "notDrawPhase" };
  }

  const result = drawRoundTile(room.round);

  if (!result.ok) {
    if (result.reason === "wallEmpty") {
      return { ok: true, room: finishRoundIfNeeded(room) };
    }

    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    room: finishRoundIfNeeded({
      ...room,
      phase: "discard",
      selfDrawEligible: true,
      lastDrawnTileId: result.tile.instanceId ?? null,
      round: result.round,
      baGangClaimWindow: null,
      eventLog: [...room.eventLog, { type: "tileDrawn", seatId: seat.seatId, playerId }],
    }),
  };
}

export function drawGangTile(room: RoomState, playerId: string): DrawGangTileResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.round.players.some((player) => player.missingSuit === null)) {
    return { ok: false, reason: "missingSuitNotSet" };
  }

  if (room.roundEnd !== null) {
    return { ok: false, reason: "roundFinished" };
  }

  if (room.claimWindow !== null) {
    return { ok: false, reason: "claimWindowOpen" };
  }

  if (room.gangDraw === null || room.phase !== "gangDraw") {
    return { ok: false, reason: "noGangDraw" };
  }

  if (room.round.currentPlayer !== seat.seatId || room.gangDraw.seatId !== seat.seatId) {
    return { ok: false, reason: "notCurrentPlayer" };
  }

  const result = drawRoundTile(room.round);

  if (!result.ok) {
    if (result.reason === "wallEmpty") {
      return { ok: true, room: finishRoundIfNeeded(room) };
    }

    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    room: finishRoundIfNeeded({
      ...room,
      phase: "discard",
      selfDrawEligible: true,
      lastDrawnTileId: result.tile.instanceId ?? null,
      round: result.round,
      baGangClaimWindow: null,
      gangDraw: null,
      eventLog: [
        ...room.eventLog,
        { type: "gangTileDrawn", seatId: seat.seatId, playerId, gangType: room.gangDraw.gangType },
      ],
    }),
  };
}

export function discardRoomTile(
  room: RoomState,
  playerId: string,
  tile: Tile,
  timing: DiscardRoomTileOptions = {},
): DiscardRoomTileResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.round.players.some((player) => player.missingSuit === null)) {
    return { ok: false, reason: "missingSuitNotSet" };
  }

  if (room.roundEnd !== null) {
    return { ok: false, reason: "roundFinished" };
  }

  if (room.claimWindow !== null) {
    return { ok: false, reason: "claimWindowOpen" };
  }

  if (room.gangDraw !== null) {
    return { ok: false, reason: "gangDrawPending" };
  }

  if (room.round.currentPlayer !== seat.seatId) {
    return { ok: false, reason: "notCurrentPlayer" };
  }

  if (room.phase !== "discard") {
    return { ok: false, reason: "notDiscardPhase" };
  }

  const player = room.round.players[seat.seatId];
  const physicalTile = resolveOwnedHandTile(player.hand, seat.seatId, tile, timing.tileId);

  if (physicalTile === null) {
    return { ok: false, reason: "tileNotInHand" };
  }

  const result = discardRoundTile(room.round, seat.seatId, physicalTile);

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    room: {
      ...room,
      phase: "claim",
      selfDrawEligible: false,
      lastDrawnTileId: null,
      round: result.round,
      claimWindow: createClaimWindow(
        result.round,
        seat.seatId,
        playerId,
        physicalTile,
        result.nextPlayer,
        responseWindowMetadata(room, "discardClaim", timing),
      ),
      eventLog: [
        ...room.eventLog,
        { type: "tileDiscarded", seatId: seat.seatId, playerId, tile: physicalTile },
        {
          type: "claimWindowOpened",
          discardedBySeatId: seat.seatId,
          tile: physicalTile,
          pendingResponderCount: claimPendingPlayerIds(result.round, seat.seatId).length,
        },
      ],
    },
  };
}

export function passClaim(room: RoomState, playerId: string): PassClaimResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.claimWindow === null || room.phase !== "claim") {
    return { ok: false, reason: "noClaimWindow" };
  }

  if (!room.claimWindow.pendingPlayerIds.includes(seat.seatId)) {
    return { ok: false, reason: "claimNotAllowed" };
  }

  if (hasClaimResponse(room.claimWindow, seat.seatId)) {
    return { ok: false, reason: "claimAlreadyResponded" };
  }

  const passedPlayerIds = [...room.claimWindow.passedPlayerIds, seat.seatId];
  const nextClaimWindow = { ...room.claimWindow, passedPlayerIds };
  const allResponded = didAllClaimPlayersRespond(nextClaimWindow);
  const shouldResolve = allResponded || (
    nextClaimWindow.meldClaims.length > 0 &&
    !hasUnresolvedHuOpportunity(room.round, nextClaimWindow)
  );
  const nextRoom = {
    ...room,
    claimWindow: nextClaimWindow,
  };

  return {
    ok: true,
    room: shouldResolve
      ? resolveDiscardClaimWindow(
          nextRoom,
          nextClaimWindow,
          nextClaimWindow.huClaims.length > 0 || nextClaimWindow.meldClaims.length > 0 ? "claimed" : "allPassed",
        )
      : nextRoom,
  };
}

export function claimHu(room: RoomState, playerId: string): ClaimHuResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.roundEnd !== null) {
    return { ok: false, reason: "roundFinished" };
  }

  if (room.claimWindow === null || room.phase !== "claim") {
    return { ok: false, reason: "noClaimWindow" };
  }

  if (!room.claimWindow.pendingPlayerIds.includes(seat.seatId)) {
    return { ok: false, reason: "claimNotAllowed" };
  }

  if (hasClaimResponse(room.claimWindow, seat.seatId)) {
    return { ok: false, reason: "claimAlreadyResponded" };
  }

  const huCheck = checkDiscardHu(room.round, seat.seatId, room.claimWindow.tile);

  if (!huCheck.canHu) {
    return { ok: false, reason: "cannotHu" };
  }

  const huClaim: HuClaim = {
    seatId: seat.seatId,
    playerId,
    patterns: huCheck.patterns,
    genCount: huCheck.score.genCount,
    rawPoints: huCheck.score.rawPoints,
    points: huCheck.score.cappedPoints,
  };
  const nextClaimWindow = { ...room.claimWindow, huClaims: [...room.claimWindow.huClaims, huClaim] };
  const allResponded = didAllClaimPlayersRespond(nextClaimWindow);
  const shouldResolve = allResponded || (
    nextClaimWindow.meldClaims.length > 0 &&
    !hasUnresolvedHuOpportunity(room.round, nextClaimWindow)
  );
  const nextRoom = {
    ...room,
    claimWindow: nextClaimWindow,
  };

  return {
    ok: true,
    room: shouldResolve
      ? resolveDiscardClaimWindow(nextRoom, nextClaimWindow, "claimed")
      : nextRoom,
  };
}

export function claimSelfDrawHu(room: RoomState, playerId: string): ClaimSelfDrawHuResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.roundEnd !== null) {
    return { ok: false, reason: "roundFinished" };
  }

  if (room.round.players.some((player) => player.missingSuit === null)) {
    return { ok: false, reason: "missingSuitNotSet" };
  }

  if (room.claimWindow !== null) {
    return { ok: false, reason: "claimWindowOpen" };
  }

  if (room.gangDraw !== null) {
    return { ok: false, reason: "gangDrawPending" };
  }

  if (room.round.currentPlayer !== seat.seatId) {
    return { ok: false, reason: "notCurrentPlayer" };
  }

  if (room.phase !== "discard" || !room.selfDrawEligible) {
    return { ok: false, reason: "notDiscardPhase" };
  }

  const huCheck = checkCurrentPlayerHu(room.round);

  if (!huCheck.canHu) {
    return { ok: false, reason: "cannotHu" };
  }

  const nextRound: RoundState = {
    ...room.round,
    currentPlayer: findNextActivePlayer(room.round, seat.seatId),
    players: room.round.players.map((value) =>
      value.id === seat.seatId ? { ...value, hasWon: true } : value,
    ),
  };
  const selfDrawPayers = room.round.players.filter(
    (player) => player.id !== seat.seatId && !player.hasWon,
  );
  const roomWithOutcome = recordHuOutcome(room, {
    outcomeId: `${roundId(room)}:hu:selfDraw:event:${room.eventLog.length + 1}`,
    method: "selfDraw",
    winnerSeatIds: [seat.seatId],
    responsibleSeatId: null,
  });
  const settledRoom = applyRoomHuSettlement(
    roomWithOutcome,
    selfDrawPayers.map((payer) => ({
      winnerSeatId: seat.seatId,
      winnerPlayerId: playerId,
      loserSeatId: payer.id,
      loserPlayerId: room.seats[payer.id].playerId!,
      reason: "selfDrawHu",
      sourceWindowId: null,
      rawPoints: huCheck.score.rawPoints,
      finalPoints: huCheck.score.cappedPoints,
      relatedEvent: { type: "selfDrawHuClaimed", seatId: seat.seatId },
    })),
  );

  return {
    ok: true,
    room: finishRoundIfNeeded({
      ...settledRoom,
      phase: "draw",
      selfDrawEligible: false,
      lastDrawnTileId: null,
      round: nextRound,
      eventLog: [
        ...settledRoom.eventLog,
        {
          type: "selfDrawHuClaimed",
          seatId: seat.seatId,
          playerId,
          patterns: huCheck.patterns,
          genCount: huCheck.score.genCount,
          points: huCheck.score.cappedPoints,
        },
      ],
    }),
  };
}

export function claimPeng(room: RoomState, playerId: string): ClaimPengResult {
  return claimMeldFromDiscard(room, playerId, {
    meldType: "peng",
    tilesNeededFromHand: 2,
    eventType: "pengClaimed",
    cannotReason: "cannotPeng",
  });
}

export function claimMingGang(room: RoomState, playerId: string): ClaimMingGangResult {
  return claimMeldFromDiscard(room, playerId, {
    meldType: "mingGang",
    tilesNeededFromHand: 3,
    eventType: "mingGangClaimed",
    cannotReason: "cannotMingGang",
  });
}

export function claimAnGang(room: RoomState, playerId: string, tile: Tile): ClaimAnGangResult {
  const ready = prepareActiveGang(room, playerId);

  if (!ready.ok) {
    return ready;
  }

  const usedTiles = chooseActiveGangTiles(ready.player.hand, tile, 4);

  if (usedTiles === null) {
    return { ok: false, reason: "cannotAnGang" };
  }

  const gangSettlementFact = createGangSettlementFact(room, {
    gangType: "anGang",
    gangSeatId: ready.seat.seatId,
    gangPlayerId: playerId,
    targetTile: tile,
    physicalTiles: usedTiles,
    payerSeatIds: activeGangPayerSeatIds(ready.round, ready.seat.seatId),
    sourceWindowId: null,
    relatedEventType: "anGangClaimed",
  });
  const nextPlayer = {
    ...ready.player,
    hand: removeTiles(ready.player.hand, usedTiles),
    melds: [
      ...ready.player.melds,
      {
        type: "anGang" as const,
        tile,
          tiles: usedTiles,
          fromPlayer: null,
          gangId: gangSettlementFact.gangId,
      },
    ],
  };
  const nextRound: RoundState = {
    ...ready.round,
    players: ready.round.players.map((player) => (player.id === ready.seat.seatId ? nextPlayer : player)),
  };
  return {
    ok: true,
    room: {
      ...room,
      phase: "gangDraw",
      selfDrawEligible: false,
      lastDrawnTileId: null,
      round: nextRound,
      gangSettlementFacts: appendGangSettlementFact(room.gangSettlementFacts, gangSettlementFact),
      eventLog: [
        ...room.eventLog,
        { type: "anGangClaimed", seatId: ready.seat.seatId, playerId, tile, usedTiles },
      ],
      gangDraw: { seatId: ready.seat.seatId, playerId, gangType: "anGang", tile },
    },
  };
}

export function claimBaGang(
  room: RoomState,
  playerId: string,
  selection: string | Tile,
  timing: ResponseWindowTiming = {},
): ClaimBaGangResult {
  const ready = prepareActiveGang(room, playerId, false);

  if (!ready.ok) {
    return ready;
  }

  const candidates = createBaGangCandidates(room, ready.seat.seatId, ready.player);
  const candidate = typeof selection === "string"
    ? candidates.find((value) => value.candidateId === selection)
    : candidates.find((value) => sameTile(value.targetTile, selection));

  if (candidate === undefined) {
    return { ok: false, reason: "cannotBaGang" };
  }

  const baGangClaimWindow = createBaGangClaimWindow(
    ready.round,
    ready.seat.seatId,
    playerId,
    candidate,
    responseWindowMetadata(room, "qiangGang", timing),
  );

  const declaredRoom: RoomState = {
    ...room,
    phase: "qiangGang",
    selfDrawEligible: false,
    lastDrawnTileId: null,
    baGangClaimWindow,
    gangDraw: null,
    eventLog: [
      ...room.eventLog,
      {
        type: "baGangDeclared",
        seatId: ready.seat.seatId,
        playerId,
        tile: candidate.targetTile,
        addedTile: candidate.addedTile,
      },
    ],
  };

  return {
    ok: true,
    room: didAllBaGangPlayersRespond(baGangClaimWindow)
      ? settleBaGangClaimWindow(declaredRoom, baGangClaimWindow)
      : declaredRoom,
  };
}

export function exchangeGangYaoJi(
  room: RoomState,
  playerId: string,
  candidateId: string,
): ExchangeGangYaoJiResult {
  const ready = prepareActiveGang(room, playerId, false);

  if (!ready.ok) {
    return ready;
  }

  const candidate = createYaoJiExchangeCandidates(room, ready.seat.seatId, ready.player)
    .find((value) => value.candidateId === candidateId);

  if (candidate === undefined) {
    return { ok: false, reason: "cannotExchangeGangYaoJi" };
  }

  const meld = ready.player.melds[candidate.meldIndex];
  if (meld === undefined || meld.type === "peng") {
    return { ok: false, reason: "cannotExchangeGangYaoJi" };
  }

  const beforeCanHu = checkCurrentPlayerHu(ready.round).canHu;
  const nextMeld: Meld = {
    ...meld,
    tiles: replacePhysicalTile(meld.tiles, candidate.returnedYaoJi, candidate.naturalTile),
  };
  const nextPlayer = {
    ...ready.player,
    hand: [
      ...removeFirstTile(ready.player.hand, candidate.naturalTile),
      candidate.returnedYaoJi,
    ],
    melds: ready.player.melds.map((value, index) => index === candidate.meldIndex ? nextMeld : value),
  };
  const nextRound: RoundState = {
    ...ready.round,
    players: ready.round.players.map((value) => value.id === ready.seat.seatId ? nextPlayer : value),
  };
  const afterCanHu = checkCurrentPlayerHu(nextRound).canHu;

  return {
    ok: true,
    room: {
      ...room,
      phase: "discard",
      selfDrawEligible: room.selfDrawEligible || (!beforeCanHu && afterCanHu),
      lastDrawnTileId:
        candidate.naturalTile.instanceId !== undefined && candidate.naturalTile.instanceId === room.lastDrawnTileId
          ? null
          : room.lastDrawnTileId,
      round: nextRound,
      eventLog: [
        ...room.eventLog,
        {
          type: "gangYaoJiExchanged",
          seatId: ready.seat.seatId,
          playerId,
          gangType: candidate.gangType,
          targetTile: candidate.targetTile,
          addedTile: candidate.naturalTile,
          returnedYaoJi: candidate.returnedYaoJi,
          gangId: meld.gangId ?? null,
        },
      ],
    },
  };
}

export function passQiangGang(room: RoomState, playerId: string): PassQiangGangResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.baGangClaimWindow === null || room.phase !== "qiangGang") {
    return { ok: false, reason: "noQiangGangWindow" };
  }

  if (!room.baGangClaimWindow.pendingPlayerIds.includes(seat.seatId)) {
    return { ok: false, reason: "claimNotAllowed" };
  }

  if (hasBaGangClaimResponse(room.baGangClaimWindow, seat.seatId)) {
    return { ok: false, reason: "claimAlreadyResponded" };
  }

  const nextWindow: BaGangClaimWindow = {
    ...room.baGangClaimWindow,
    passedPlayerIds: [...room.baGangClaimWindow.passedPlayerIds, seat.seatId],
  };
  const nextRoom: RoomState = {
    ...room,
    baGangClaimWindow: nextWindow,
  };

  return {
    ok: true,
    room: didAllBaGangPlayersRespond(nextWindow)
      ? settleBaGangClaimWindow(nextRoom, nextWindow)
      : nextRoom,
  };
}

export function claimQiangGangHu(room: RoomState, playerId: string): ClaimQiangGangHuResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.roundEnd !== null) {
    return { ok: false, reason: "roundFinished" };
  }

  if (room.baGangClaimWindow === null || room.phase !== "qiangGang") {
    return { ok: false, reason: "noQiangGangWindow" };
  }

  if (!room.baGangClaimWindow.pendingPlayerIds.includes(seat.seatId)) {
    return { ok: false, reason: "claimNotAllowed" };
  }

  if (hasBaGangClaimResponse(room.baGangClaimWindow, seat.seatId)) {
    return { ok: false, reason: "claimAlreadyResponded" };
  }

  const huCheck = checkDiscardHu(room.round, seat.seatId, room.baGangClaimWindow.tile);

  if (!huCheck.canHu) {
    return { ok: false, reason: "cannotHu" };
  }

  const huClaim: HuClaim = {
    seatId: seat.seatId,
    playerId,
    patterns: huCheck.patterns,
    genCount: huCheck.score.genCount,
    rawPoints: huCheck.score.rawPoints,
    points: huCheck.score.cappedPoints,
  };
  const nextWindow: BaGangClaimWindow = {
    ...room.baGangClaimWindow,
    huClaims: [...room.baGangClaimWindow.huClaims, huClaim],
  };
  const nextRoom: RoomState = {
    ...room,
    baGangClaimWindow: nextWindow,
  };

  return {
    ok: true,
    room: didAllBaGangPlayersRespond(nextWindow)
      ? settleBaGangClaimWindow(nextRoom, nextWindow)
      : nextRoom,
  };
}

type PengClaimOptions = {
  meldType: "peng";
  tilesNeededFromHand: 2;
  eventType: "pengClaimed";
  cannotReason: "cannotPeng";
};

type MingGangClaimOptions = {
  meldType: "mingGang";
  tilesNeededFromHand: 3;
  eventType: "mingGangClaimed";
  cannotReason: "cannotMingGang";
};

function claimMeldFromDiscard(room: RoomState, playerId: string, options: PengClaimOptions): ClaimPengResult;
function claimMeldFromDiscard(room: RoomState, playerId: string, options: MingGangClaimOptions): ClaimMingGangResult;
function claimMeldFromDiscard(
  room: RoomState,
  playerId: string,
  options: PengClaimOptions | MingGangClaimOptions,
): ClaimPengResult | ClaimMingGangResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.roundEnd !== null) {
    return { ok: false, reason: "roundFinished" };
  }

  if (room.claimWindow === null || room.phase !== "claim") {
    return { ok: false, reason: "noClaimWindow" };
  }

  if (!room.claimWindow.pendingPlayerIds.includes(seat.seatId)) {
    return { ok: false, reason: "claimNotAllowed" };
  }

  if (hasClaimResponse(room.claimWindow, seat.seatId)) {
    return { ok: false, reason: "claimAlreadyResponded" };
  }

  const player = room.round.players[seat.seatId];
  const usedTiles = chooseClaimMeldTiles(player.hand, room.claimWindow.tile, options.tilesNeededFromHand);

  if (usedTiles === null) {
    return { ok: false, reason: options.cannotReason };
  }

  const nextClaimWindow: ClaimWindow = {
    ...room.claimWindow,
    meldClaims: [
      ...room.claimWindow.meldClaims,
      { seatId: seat.seatId, playerId, type: options.meldType, usedTiles },
    ],
  };
  const nextRoom: RoomState = { ...room, claimWindow: nextClaimWindow };
  const shouldResolve = didAllClaimPlayersRespond(nextClaimWindow) ||
    !hasUnresolvedHuOpportunity(room.round, nextClaimWindow);

  return {
    ok: true,
    room: shouldResolve
      ? resolveDiscardClaimWindow(nextRoom, nextClaimWindow, "claimed")
      : nextRoom,
  };
}

export function expireClaimWindow(
  room: RoomState,
  expectedWindowId?: string,
  now = Date.now(),
): ExpireClaimWindowResult {
  if (room.claimWindow === null || room.phase !== "claim") {
    return { ok: false, reason: "noClaimWindow" };
  }

  if (expectedWindowId !== undefined && room.claimWindow.windowId !== expectedWindowId) {
    return { ok: false, reason: "windowMismatch" };
  }

  if (now < room.claimWindow.deadlineAt) {
    return { ok: false, reason: "deadlineNotReached" };
  }

  const timedOutPlayerIds = room.claimWindow.pendingPlayerIds.filter(
    (seatId) => !hasClaimResponse(room.claimWindow!, seatId),
  );
  const expiredWindow: ClaimWindow = {
    ...room.claimWindow,
    status: "expired",
    passedPlayerIds: [...room.claimWindow.passedPlayerIds, ...timedOutPlayerIds],
  };
  const outcome = expiredWindow.huClaims.length > 0 || expiredWindow.meldClaims.length > 0
    ? "claimed"
    : "allPassed";
  const expiredRoom: RoomState = {
    ...room,
    claimWindow: expiredWindow,
    eventLog: [
      ...room.eventLog,
      {
        type: "responseWindowExpired",
        windowId: expiredWindow.windowId,
        kind: "discardClaim",
        timedOutPlayerIds,
        outcome,
      },
    ],
  };
  const settledRoom = resolveDiscardClaimWindow(
    expiredRoom,
    expiredWindow,
    "timeout",
    timedOutPlayerIds,
  );

  return { ok: true, room: settledRoom };
}

export function expireQiangGangWindow(
  room: RoomState,
  expectedWindowId?: string,
  now = Date.now(),
): ExpireQiangGangWindowResult {
  if (room.baGangClaimWindow === null || room.phase !== "qiangGang") {
    return { ok: false, reason: "noQiangGangWindow" };
  }

  if (expectedWindowId !== undefined && room.baGangClaimWindow.windowId !== expectedWindowId) {
    return { ok: false, reason: "windowMismatch" };
  }

  if (now < room.baGangClaimWindow.deadlineAt) {
    return { ok: false, reason: "deadlineNotReached" };
  }

  const timedOutPlayerIds = room.baGangClaimWindow.pendingPlayerIds.filter(
    (seatId) => !hasBaGangClaimResponse(room.baGangClaimWindow!, seatId),
  );
  const expiredWindow: BaGangClaimWindow = {
    ...room.baGangClaimWindow,
    status: "expired",
    passedPlayerIds: [...room.baGangClaimWindow.passedPlayerIds, ...timedOutPlayerIds],
  };
  const outcome = expiredWindow.huClaims.length > 0 ? "robbed" : "allPassed";
  const expiredRoom: RoomState = {
    ...room,
    baGangClaimWindow: expiredWindow,
    eventLog: [
      ...room.eventLog,
      {
        type: "responseWindowExpired",
        windowId: expiredWindow.windowId,
        kind: "qiangGang",
        timedOutPlayerIds,
        outcome,
      },
    ],
  };
  const settledRoom = settleBaGangClaimWindow(
    expiredRoom,
    expiredWindow,
    "timeout",
    timedOutPlayerIds,
  );

  return { ok: true, room: settledRoom };
}

export function tickRoomStateDeadlines(room: RoomState, now = Date.now()): TickRoomDeadlinesResult {
  if (room.claimWindow !== null && now >= room.claimWindow.deadlineAt) {
    const result = expireClaimWindow(room, room.claimWindow.windowId, now);
    return result.ok
      ? { room: result.room, changed: true, expiredWindowId: room.claimWindow.windowId }
      : { room, changed: false, expiredWindowId: null };
  }

  if (room.baGangClaimWindow !== null && now >= room.baGangClaimWindow.deadlineAt) {
    const result = expireQiangGangWindow(room, room.baGangClaimWindow.windowId, now);
    return result.ok
      ? { room: result.room, changed: true, expiredWindowId: room.baGangClaimWindow.windowId }
      : { room, changed: false, expiredWindowId: null };
  }

  return { room, changed: false, expiredWindowId: null };
}

export function toClientVisibleRoomState(
  room: RoomState,
  playerId: string,
  now = Date.now(),
): ClientVisibleRoomState {
  const localSeatId = room.seats.find((seat) => seat.playerId === playerId)?.seatId ?? null;
  const legalActions = clientLegalActions(room, localSeatId);

  return {
    id: room.id,
    gameStatus: room.gameStatus,
    status: room.status,
    phase: room.phase,
    roundNumber: room.roundNumber,
    currentDealer: room.currentDealer,
    dealerHistory: [...room.dealerHistory],
    nextDealerDecision: room.nextDealerDecision === null ? null : { ...room.nextDealerDecision },
    roundHistory: room.roundHistory.map(({ settlementLedger: _settlementLedger, ...entry }) => ({
      ...entry,
      roundEnd: { ...entry.roundEnd, remainingPlayerIds: [...entry.roundEnd.remainingPlayerIds] },
      nextDealerDecision: { ...entry.nextDealerDecision },
      scoreDeltas: entry.scoreDeltas.map((score) => ({ ...score })),
    })),
    gameEnd: room.gameEnd === null
      ? null
      : { ...room.gameEnd, finalScores: cloneScores(room.gameEnd.finalScores) },
    legalActions,
    actionDescriptors: clientActionDescriptors(room, localSeatId, legalActions),
    localSeatId,
    members: room.members.map((member) => ({
      ...member,
      seatId: room.seats.find((seat) => seat.playerId === member.playerId)?.seatId ?? null,
    })),
    seats: room.seats,
    round:
      room.round === null
        ? null
        : {
            dealer: room.round.dealer,
            currentPlayer: room.round.currentPlayer,
            wallCount: room.round.wall.length,
            players: room.round.players.map((player) => ({
              id: player.id,
              hand: player.id === localSeatId
                ? player.hand.map((value, index) => toClientOwnedTile(value, `hand-${player.id}-${index}`))
                : null,
              handCount: player.hand.length,
              discards: player.discards.map(tileFace),
              melds: player.melds.map((meld) => toClientVisibleMeld(meld, player.id === localSeatId)),
              hasWon: player.hasWon,
              missingSuit: player.missingSuit,
            })),
          },
    claimWindow:
      room.claimWindow === null
        ? null
        : {
            windowId: room.claimWindow.windowId,
            deadlineAt: room.claimWindow.deadlineAt,
            status: room.claimWindow.status,
            discardedBySeatId: room.claimWindow.discardedBySeatId,
            discardedByPlayerId: room.claimWindow.discardedByPlayerId,
            tile: tileFace(room.claimWindow.tile),
            ...clientVisibleResponseState(room.claimWindow, localSeatId),
          },
    baGangClaimWindow:
      room.baGangClaimWindow === null
        ? null
        : {
            windowId: room.baGangClaimWindow.windowId,
            deadlineAt: room.baGangClaimWindow.deadlineAt,
            status: room.baGangClaimWindow.status,
            upgradedBySeatId: room.baGangClaimWindow.upgradedBySeatId,
            upgradedByPlayerId: room.baGangClaimWindow.upgradedByPlayerId,
            targetTile: tileFace(room.baGangClaimWindow.targetTile),
            tile: tileFace(room.baGangClaimWindow.tile),
            ...clientVisibleResponseState(room.baGangClaimWindow, localSeatId),
          },
    gangDraw:
      room.gangDraw === null
        ? null
        : {
            ...room.gangDraw,
            tile:
              room.gangDraw.gangType === "anGang" && room.gangDraw.seatId !== localSeatId
                ? null
                : tileFace(room.gangDraw.tile),
          },
    roundEnd: room.roundEnd,
    chaJiao: room.status === "ended" ? toClientVisibleChaJiaoResult(room.chaJiao) : null,
    scores: room.scores,
    settlementLedger: room.settlementLedger.map(toClientVisibleSettlementEntry),
    gangSettlements: room.gangSettlementFacts.map(toClientVisibleGangSettlementFact),
    responseWindow: clientVisibleResponseWindow(room, localSeatId, now),
    eventLog: room.eventLog.map((event) => toClientVisibleRoomEvent(event, localSeatId)),
  };
}

function toClientVisibleMeld(meld: Meld, isOwner: boolean): ClientVisibleMeld {
  if (meld.type === "anGang" && !isOwner) {
    return { type: "anGang", tile: null, tiles: [], fromPlayer: null };
  }

  return {
    type: meld.type,
    tile: tileFace(meld.tile),
    tiles: meld.tiles.map(tileFace),
    fromPlayer: meld.fromPlayer,
  };
}

function toClientVisibleGangSettlementFact(
  fact: GangSettlementFact,
): ClientVisibleGangSettlementFact {
  return {
    gangType: fact.gangType,
    gangSeatId: fact.gangSeatId,
    gangPlayerId: fact.gangPlayerId,
    targetTile: fact.gangType === "anGang" ? null : tileFace(fact.targetTile),
    usesLaizi: fact.usesLaizi,
    payerSeatIds: fact.payers.map((payer) => payer.seatId),
    pointsPerPayer: fact.pointsPerPayer,
    paymentEligibility: fact.paymentEligibility,
  };
}

function toClientVisibleSettlementEntry(
  entry: SettlementLedgerEntry,
): ClientVisibleSettlementLedgerEntry {
  if ("chaJiaoId" in entry) {
    return {
      id: entry.id,
      batchId: entry.batchId,
      winnerSeatId: entry.winnerSeatId,
      winnerPlayerId: entry.winnerPlayerId,
      loserSeatId: entry.loserSeatId,
      loserPlayerId: entry.loserPlayerId,
      reason: entry.reason,
      patterns: entry.patterns,
      genCount: entry.genCount,
      sourceWindowId: entry.sourceWindowId,
      sourceSettlementId: entry.sourceSettlementId,
      basePoints: entry.basePoints,
      rawPoints: entry.rawPoints,
      finalPoints: entry.finalPoints,
      relatedEvent: entry.relatedEvent,
    };
  }

  if (!("gangId" in entry)) {
    return entry;
  }

  return {
    id: entry.id,
    batchId: entry.batchId,
    winnerSeatId: entry.winnerSeatId,
    winnerPlayerId: entry.winnerPlayerId,
    loserSeatId: entry.loserSeatId,
    loserPlayerId: entry.loserPlayerId,
    reason: entry.reason,
    targetTile: entry.reason === "anGang" ? null : tileFace(entry.targetTile),
    usesLaizi: entry.usesLaizi,
    sourceWindowId: entry.sourceWindowId,
    sourceSettlementId: entry.sourceSettlementId,
    basePoints: entry.basePoints,
    rawPoints: entry.rawPoints,
    finalPoints: entry.finalPoints,
    relatedEvent: entry.relatedEvent,
  };
}

function toClientVisibleChaJiaoResult(
  result: ChaJiaoResult | null,
): ClientVisibleChaJiaoResult | null {
  if (result === null) {
    return null;
  }

  return {
    reason: result.reason,
    players: result.players.map((player) => ({
      seatId: player.seatId,
      playerId: player.playerId,
      isListening: player.isListening,
      patterns: player.patterns,
      genCount: player.genCount,
      maxHuPoints: player.maxHuPoints,
    })),
  };
}

function clientVisibleResponseWindow(
  room: RoomState,
  localSeatId: PlayerId | null,
  now: number,
): ClientVisibleResponseWindow | null {
  const window = room.claimWindow ?? room.baGangClaimWindow;

  if (window === null) {
    return null;
  }

  return {
    windowId: window.windowId,
    kind: room.claimWindow === window ? "discardClaim" : "qiangGang",
    deadlineAt: window.deadlineAt,
    remainingMs: Math.max(0, window.deadlineAt - now),
    status: window.status,
    ...clientVisibleResponseState(window, localSeatId),
  };
}

function clientVisibleResponseState(
  window: ClaimWindow | BaGangClaimWindow,
  localSeatId: PlayerId | null,
): ClientVisibleResponseState {
  const responseByMe = localSeatId === null
    ? null
    : window.huClaims.some((claim) => claim.seatId === localSeatId)
      ? "hu"
      : "meldClaims" in window && window.meldClaims.some((claim) => claim.seatId === localSeatId)
        ? window.meldClaims.find((claim) => claim.seatId === localSeatId)!.type
      : window.passedPlayerIds.includes(localSeatId)
        ? "pass"
        : null;

  return {
    pendingResponderCount: window.pendingPlayerIds.filter((seatId) => !hasResponse(window, seatId)).length,
    hasRespondedByMe: responseByMe !== null,
    responseByMe,
  };
}

function hasResponse(window: ClaimWindow | BaGangClaimWindow, seatId: PlayerId): boolean {
  return (
    window.passedPlayerIds.includes(seatId) ||
    window.huClaims.some((claim) => claim.seatId === seatId) ||
    ("meldClaims" in window && window.meldClaims.some((claim) => claim.seatId === seatId))
  );
}

export function toClientVisibleRoomEvent(
  event: RoomEvent,
  _localSeatId: PlayerId | null,
): ClientRoomEvent {
  if (event.type === "anGangClaimed") {
    return {
      type: "anGangClaimed",
      seatId: event.seatId,
      playerId: event.playerId,
      usesLaizi: event.usedTiles.some(isYaoJi),
    };
  }

  if (event.type === "gangYaoJiExchanged") {
    return {
      type: "gangYaoJiExchanged",
      seatId: event.seatId,
      playerId: event.playerId,
      gangType: event.gangType,
      targetTile: event.gangType === "anGang" ? null : tileFace(event.targetTile),
    };
  }

  if (event.type === "tileDiscarded" || event.type === "claimWindowOpened") {
    return { ...event, tile: tileFace(event.tile) };
  }

  if (event.type === "huClaimed" || event.type === "qiangGangHuClaimed") {
    return { ...event, tile: tileFace(event.tile) };
  }

  if (event.type === "pengClaimed" || event.type === "mingGangClaimed" || event.type === "baGangClaimed") {
    return { ...event, tile: tileFace(event.tile), usedTiles: event.usedTiles.map(tileFace) };
  }

  if (event.type === "baGangDeclared") {
    return { ...event, tile: tileFace(event.tile), addedTile: tileFace(event.addedTile) };
  }

  return event;
}

function clientLegalActions(room: RoomState, localSeatId: PlayerId | null): ClientLegalAction[] {
  if (room.gameStatus === "waiting") {
    if (localSeatId === null) {
      return ["takeSeat"];
    }

    const actions: ClientLegalAction[] = ["toggleReady"];

    if (room.seats.every((seat) => seat.playerId !== null && seat.ready)) {
      actions.push("startRound");
    }

    return actions;
  }

  if (room.gameStatus === "finished") {
    return [];
  }

  if (room.gameStatus === "betweenRounds") {
    if (localSeatId === null) {
      return [];
    }

    const actions: ClientLegalAction[] = ["finishGame"];

    if (!room.seats[localSeatId].ready) {
      actions.unshift("readyNextRound");
    }

    if (room.seats.every((seat) => seat.playerId !== null && seat.ready)) {
      actions.unshift("startNextRound");
    }

    return actions;
  }

  if (localSeatId === null || room.round === null || room.phase === null || room.phase === "ended") {
    return [];
  }

  const player = room.round.players[localSeatId];

  if (player.hasWon) {
    return [];
  }

  if (room.phase === "dingque") {
    return player.missingSuit === null ? ["chooseMissingSuit"] : [];
  }

  if (room.phase === "draw") {
    return room.round.currentPlayer === localSeatId ? ["drawTile"] : [];
  }

  if (room.phase === "gangDraw") {
    return room.gangDraw?.seatId === localSeatId ? ["drawGangTile"] : [];
  }

  if (room.phase === "qiangGang" && room.baGangClaimWindow !== null) {
    if (
      !room.baGangClaimWindow.pendingPlayerIds.includes(localSeatId) ||
      hasBaGangClaimResponse(room.baGangClaimWindow, localSeatId)
    ) {
      return [];
    }

    const actions: ClientLegalAction[] = ["passQiangGang"];

    if (checkDiscardHu(room.round, localSeatId, room.baGangClaimWindow.tile).canHu) {
      actions.push("claimQiangGangHu");
    }

    return actions;
  }

  if (room.phase === "discard") {
    if (room.round.currentPlayer !== localSeatId) {
      return [];
    }

    const actions: ClientLegalAction[] = ["discardTile"];

    if (room.selfDrawEligible && checkCurrentPlayerHu(room.round).canHu) {
      actions.push("claimSelfDrawHu");
    }

    const uniqueHandTiles = player.hand.filter(
      (candidate, index) => player.hand.findIndex((value) => sameTile(value, candidate)) === index,
    );

    if (
      room.selfDrawEligible &&
      uniqueHandTiles.some((candidate) => chooseActiveGangTiles(player.hand, candidate, 4) !== null)
    ) {
      actions.push("claimAnGang");
    }

    if (createBaGangCandidates(room, localSeatId, player).length > 0) {
      actions.push("claimBaGang");
    }

    if (createYaoJiExchangeCandidates(room, localSeatId, player).length > 0) {
      actions.push("exchangeGangYaoJi");
    }

    return actions;
  }

  if (room.phase !== "claim" || room.claimWindow === null) {
    return [];
  }

  if (
    !room.claimWindow.pendingPlayerIds.includes(localSeatId) ||
    hasClaimResponse(room.claimWindow, localSeatId)
  ) {
    return [];
  }

  const actions: ClientLegalAction[] = ["passClaim"];

  if (checkDiscardHu(room.round, localSeatId, room.claimWindow.tile).canHu) {
    actions.push("claimHu");
  }

  if (chooseClaimMeldTiles(player.hand, room.claimWindow.tile, 2) !== null) {
    actions.push("claimPeng");
  }

  if (chooseClaimMeldTiles(player.hand, room.claimWindow.tile, 3) !== null) {
    actions.push("claimMingGang");
  }

  return actions;
}

function clientActionDescriptors(
  room: RoomState,
  localSeatId: PlayerId | null,
  actions: ClientLegalAction[],
): ClientActionDescriptor[] {
  return actions.map((action) => {
    const actionId = clientActionId(room, localSeatId, action);

    if (action === "takeSeat") {
      return {
        action,
        actionId,
        seatIds: room.seats.filter((seat) => seat.playerId === null).map((seat) => seat.seatId),
      };
    }

    if (action === "chooseMissingSuit") {
      return { action, actionId, suits: ["bamboos", "dots", "characters"] };
    }

    if (action === "discardTile") {
      const round = room.round;
      const player = localSeatId === null || round === null ? null : round.players[localSeatId];
      const tiles = player === null || round === null || localSeatId === null
        ? []
        : player.hand.flatMap((candidate, index): ClientOwnedTile[] =>
            discardRoundTile(round, localSeatId, candidate).ok
              ? [toClientOwnedTile(candidate, `hand-${localSeatId}-${index}`)]
              : []
          );
      return { action, actionId, tiles };
    }

    if (action === "claimAnGang") {
      const player = localSeatId === null || room.round === null ? null : room.round.players[localSeatId];
      const tiles = player === null
        ? []
        : uniqueTiles(player.hand)
            .filter((candidate) => chooseActiveGangTiles(player.hand, candidate, 4) !== null)
            .map(tileFace);
      return { action, actionId, tiles };
    }

    if (action === "claimBaGang") {
      const player = localSeatId === null || room.round === null ? null : room.round.players[localSeatId];
      const candidates: ClientBaGangCandidate[] = player === null || localSeatId === null
        ? []
        : createBaGangCandidates(room, localSeatId, player).map((candidate) => {
            const handIndex = player.hand.findIndex((value) => samePhysicalTile(value, candidate.addedTile));
            return {
              candidateId: candidate.candidateId,
              targetTile: tileFace(candidate.targetTile),
              addedTile: toClientOwnedTile(candidate.addedTile, `hand-${localSeatId}-${handIndex}`),
              usesLaizi: candidate.usesLaizi,
              paymentEligibility: candidate.paymentEligibility,
              payerSeatIds: [...candidate.payerSeatIds],
              pointsPerPayer: candidate.pointsPerPayer,
            };
          });
      return { action, actionId, candidates };
    }

    if (action === "exchangeGangYaoJi") {
      const player = localSeatId === null || room.round === null ? null : room.round.players[localSeatId];
      const candidates: ClientYaoJiExchangeCandidate[] = player === null || localSeatId === null
        ? []
        : createYaoJiExchangeCandidates(room, localSeatId, player).map((candidate) => {
            const handIndex = player.hand.findIndex((value) => samePhysicalTile(value, candidate.naturalTile));
            return {
              candidateId: candidate.candidateId,
              gangType: candidate.gangType,
              targetTile: tileFace(candidate.targetTile),
              naturalTile: toClientOwnedTile(candidate.naturalTile, `hand-${localSeatId}-${handIndex}`),
              returnedYaoJi: tileFace(candidate.returnedYaoJi),
            };
          });
      return { action, actionId, candidates };
    }

    return { action, actionId };
  });
}

function clientActionId(room: RoomState, localSeatId: PlayerId | null, action: ClientLegalAction): string {
  if (action === "drawTile" && room.round !== null) {
    return `${room.id}:${room.roundNumber}:draw:${room.round.currentPlayer}:${room.round.wall.length}`;
  }

  if ((action === "passClaim" || action === "claimHu" || action === "claimPeng" || action === "claimMingGang") && room.claimWindow !== null) {
    return `${room.claimWindow.windowId}:${action}`;
  }

  if ((action === "passQiangGang" || action === "claimQiangGangHu") && room.baGangClaimWindow !== null) {
    return `${room.baGangClaimWindow.windowId}:${action}`;
  }

  const phaseVersion = room.round === null
    ? `${room.status}:${room.seats.map((seat) => `${seat.playerId ?? "-"}:${seat.ready ? 1 : 0}`).join(",")}`
    : `${room.roundNumber}:${room.phase}:${room.round.currentPlayer}:${room.round.wall.length}:${room.eventLog.length}`;
  return `${room.id}:${phaseVersion}:${localSeatId ?? "observer"}:${action}`;
}

function uniqueTiles(tiles: Tile[]): Tile[] {
  return tiles.filter((candidate, index) => tiles.findIndex((value) => sameTile(value, candidate)) === index);
}

function createClaimWindow(
  round: RoundState,
  discardedBySeatId: PlayerId,
  discardedByPlayerId: string,
  tile: Tile,
  nextPlayer: PlayerId,
  metadata: ResponseWindowMetadata,
): ClaimWindow {
  return {
    ...metadata,
    discardedBySeatId,
    discardedByPlayerId,
    tile,
    nextPlayer,
    pendingPlayerIds: claimPendingPlayerIds(round, discardedBySeatId),
    passedPlayerIds: [],
    huClaims: [],
    meldClaims: [],
  };
}

function claimPendingPlayerIds(round: RoundState, discardedBySeatId: PlayerId): PlayerId[] {
  return round.players
    .filter((player) => player.id !== discardedBySeatId && !player.hasWon)
    .map((player) => player.id);
}

function createBaGangClaimWindow(
  round: RoundState,
  upgradedBySeatId: PlayerId,
  upgradedByPlayerId: string,
  candidate: BaGangCandidate,
  metadata: ResponseWindowMetadata,
): BaGangClaimWindow {
  return {
    ...metadata,
    upgradedBySeatId,
    upgradedByPlayerId,
    targetTile: candidate.targetTile,
    tile: candidate.addedTile,
    pengMeldIndex: candidate.pengMeldIndex,
    candidateId: candidate.candidateId,
    paymentEligibility: candidate.paymentEligibility,
    pointsPerPayer: candidate.pointsPerPayer,
    pendingPlayerIds: claimPendingPlayerIds(round, upgradedBySeatId),
    passedPlayerIds: [],
    huClaims: [],
  };
}

function responseWindowMetadata(
  room: RoomState,
  kind: ResponseWindowKind,
  timing: ResponseWindowTiming,
): ResponseWindowMetadata {
  const now = timing.now ?? Date.now();
  const timeoutMs = timing.timeoutMs ?? DEFAULT_RESPONSE_WINDOW_TIMEOUT_MS;

  return {
    windowId: `${room.id}:${kind}:${room.eventLog.length + 1}`,
    deadlineAt: now + timeoutMs,
    status: "open",
  };
}

function prepareActiveGang(
  room: RoomState,
  playerId: string,
  requireSelfDrawEligible = true,
):
  | {
      ok: true;
      round: RoundState;
      seat: SeatState;
      player: RoundState["players"][number];
    }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "roundFinished"
        | "missingSuitNotSet"
        | "claimWindowOpen"
        | "gangDrawPending"
        | "notCurrentPlayer"
        | "notDiscardPhase";
    } {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.roundEnd !== null) {
    return { ok: false, reason: "roundFinished" };
  }

  if (room.round.players.some((player) => player.missingSuit === null)) {
    return { ok: false, reason: "missingSuitNotSet" };
  }

  if (room.claimWindow !== null || room.baGangClaimWindow !== null) {
    return { ok: false, reason: "claimWindowOpen" };
  }

  if (room.gangDraw !== null) {
    return { ok: false, reason: "gangDrawPending" };
  }

  if (room.round.currentPlayer !== seat.seatId) {
    return { ok: false, reason: "notCurrentPlayer" };
  }

  if (room.phase !== "discard" || (requireSelfDrawEligible && !room.selfDrawEligible)) {
    return { ok: false, reason: "notDiscardPhase" };
  }

  const player = room.round.players[seat.seatId];

  return { ok: true, round: room.round, seat, player };
}

function createBaGangCandidates(
  room: RoomState,
  seatId: PlayerId,
  player: RoundState["players"][number],
): BaGangCandidate[] {
  if (room.round === null) {
    return [];
  }

  const actionId = clientActionId(room, seatId, "claimBaGang");
  const payerSeatIds = activeGangPayerSeatIds(room.round, seatId);

  const candidates = player.melds.flatMap((meld, pengMeldIndex): BaGangCandidate[] => {
    if (meld.type !== "peng") {
      return [];
    }

    const eligibleTiles = [
      ...player.hand.filter((value) => sameTile(value, meld.tile) && !isYaoJi(value)),
      ...player.hand.filter((value) => isYaoJi(value)),
    ];

    return eligibleTiles.map((addedTile) => {
      const handIndex = player.hand.findIndex((value) => samePhysicalTile(value, addedTile));
      const usesLaizi = [...meld.tiles, addedTile].some(isYaoJi);
      const naturalWasDrawnThisTurn = addedTile.instanceId === undefined
        ? room.selfDrawEligible
        : addedTile.instanceId === room.lastDrawnTileId;
      const paymentEligibility: BaGangPaymentEligibility =
        isYaoJi(addedTile) || naturalWasDrawnThisTurn ? "normal" : "zeroDelayedNatural";
      const pointsPerPayer = paymentEligibility === "normal"
        ? calculateGangPoints("baGang", usesLaizi) as 1 | 2
        : 0;
      return {
        candidateId: "",
        pengMeldIndex,
        targetTile: meld.tile,
        addedTile,
        usesLaizi,
        paymentEligibility,
        payerSeatIds: [...payerSeatIds],
        pointsPerPayer,
      };
    });
  });

  return candidates.map((candidate, index) => ({
    ...candidate,
    candidateId: `${actionId}:candidate-${index}`,
  }));
}

function createYaoJiExchangeCandidates(
  room: RoomState,
  seatId: PlayerId,
  player: RoundState["players"][number],
): YaoJiExchangeCandidate[] {
  const actionId = clientActionId(room, seatId, "exchangeGangYaoJi");

  const candidates = player.melds.flatMap((meld, meldIndex): YaoJiExchangeCandidate[] => {
    if (
      meld.type === "peng" ||
      meld.tiles.length !== 4 ||
      meld.gangId === undefined ||
      !room.gangSettlementFacts.some((fact) => fact.gangId === meld.gangId)
    ) {
      return [];
    }

    const gangType: "mingGang" | "anGang" | "baGang" = meld.type;

    const naturalTiles = player.hand.filter((value) => !isYaoJi(value) && sameTile(value, meld.tile));
    const yaoJiTiles = meld.tiles.filter(isYaoJi);

    return naturalTiles.flatMap((naturalTile) => {
      return yaoJiTiles.map((returnedYaoJi) => {
        return {
          candidateId: "",
          meldIndex,
          gangType,
          targetTile: meld.tile,
          naturalTile,
          returnedYaoJi,
        };
      });
    });
  });

  return candidates.map((candidate, index) => ({
    ...candidate,
    candidateId: `${actionId}:candidate-${index}`,
  }));
}

function toClientOwnedTile(value: PhysicalTile, fallbackId: string): ClientOwnedTile {
  return {
    ...tileFace(value),
    tileId: clientPhysicalTileId(value, fallbackId),
  };
}

function clientPhysicalTileId(value: PhysicalTile, fallbackId: string): string {
  return value.instanceId ?? `legacy-${fallbackId}-${tileKey(value)}`;
}

function resolveOwnedHandTile(
  hand: PhysicalTile[],
  seatId: PlayerId,
  face: Tile,
  tileId?: string,
): PhysicalTile | null {
  if (tileId === undefined) {
    return hand.find((value) => sameTile(value, face)) ?? null;
  }

  return hand.find((value, index) =>
    sameTile(value, face) && clientPhysicalTileId(value, `hand-${seatId}-${index}`) === tileId
  ) ?? null;
}

function replacePhysicalTile(
  tiles: PhysicalTile[],
  removed: PhysicalTile,
  added: PhysicalTile,
): PhysicalTile[] {
  const index = tiles.findIndex((value) => samePhysicalTile(value, removed));
  if (index === -1) {
    return tiles;
  }

  return tiles.map((value, valueIndex) => valueIndex === index ? added : value);
}

function chooseActiveGangTiles(hand: PhysicalTile[], tile: Tile, tilesNeededFromHand: 1 | 4): PhysicalTile[] | null {
  const sameTiles = hand.filter((value) => sameTile(value, tile));
  const laiziTiles = hand.filter((value) => isYaoJi(value) && !sameTile(value, tile));
  const usedTiles = [...sameTiles, ...laiziTiles].slice(0, tilesNeededFromHand);

  return usedTiles.length === tilesNeededFromHand ? usedTiles : null;
}

function hasClaimResponse(claimWindow: ClaimWindow, seatId: PlayerId): boolean {
  return (
    claimWindow.passedPlayerIds.includes(seatId) ||
    claimWindow.huClaims.some((claim) => claim.seatId === seatId) ||
    claimWindow.meldClaims.some((claim) => claim.seatId === seatId)
  );
}

function didAllClaimPlayersRespond(claimWindow: ClaimWindow): boolean {
  return claimWindow.pendingPlayerIds.every((seatId) => hasClaimResponse(claimWindow, seatId));
}

function hasBaGangClaimResponse(claimWindow: BaGangClaimWindow, seatId: PlayerId): boolean {
  return (
    claimWindow.passedPlayerIds.includes(seatId) ||
    claimWindow.huClaims.some((claim) => claim.seatId === seatId)
  );
}

function didAllBaGangPlayersRespond(claimWindow: BaGangClaimWindow): boolean {
  return claimWindow.pendingPlayerIds.every((seatId) => hasBaGangClaimResponse(claimWindow, seatId));
}

function hasUnresolvedHuOpportunity(round: RoundState, claimWindow: ClaimWindow): boolean {
  return claimWindow.pendingPlayerIds.some((seatId) => {
    if (hasClaimResponse(claimWindow, seatId)) {
      return false;
    }

    return checkDiscardHu(round, seatId, claimWindow.tile).canHu;
  });
}

function chooseClaimMeldTiles(hand: PhysicalTile[], claimedTile: Tile, tilesNeededFromHand: 2 | 3): PhysicalTile[] | null {
  const sameTiles = hand.filter((tile) => sameTile(tile, claimedTile));
  const laiziTiles = hand.filter((tile) => isYaoJi(tile) && !sameTile(tile, claimedTile));
  const usedTiles = [...sameTiles, ...laiziTiles].slice(0, tilesNeededFromHand);

  return usedTiles.length === tilesNeededFromHand ? usedTiles : null;
}

function removeTiles(hand: PhysicalTile[], tilesToRemove: PhysicalTile[]): PhysicalTile[] {
  return tilesToRemove.reduce((nextHand, tile) => removeFirstTile(nextHand, tile), hand);
}

function removeFirstTile(hand: PhysicalTile[], tile: PhysicalTile): PhysicalTile[] {
  const index = hand.findIndex((value) => samePhysicalTile(value, tile));

  if (index === -1) {
    return hand;
  }

  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function removeLastTile(tiles: PhysicalTile[], tile: PhysicalTile): PhysicalTile[] {
  const index = tiles.findLastIndex((value) => samePhysicalTile(value, tile));

  if (index === -1) {
    return tiles;
  }

  return [...tiles.slice(0, index), ...tiles.slice(index + 1)];
}

function settleDiscardClaimWindow(
  room: RoomState,
  claimWindow: ClaimWindow,
  timedOutPlayerIds: PlayerId[] = [],
): RoomState {
  const selectedMeldClaim = claimWindow.huClaims.length === 0 ? claimWindow.meldClaims[0] : undefined;

  if (selectedMeldClaim !== undefined) {
    const roomWithMeld = applyMeldClaimOutcome(room, claimWindow, selectedMeldClaim);
    return {
      ...roomWithMeld,
      eventLog: [
        ...roomWithMeld.eventLog,
        ...discardClaimResponseEvents(room, claimWindow, timedOutPlayerIds),
      ],
    };
  }

  const orderedWinnerSeatIds = claimWindow.pendingPlayerIds.filter((seatId) =>
    claimWindow.huClaims.some((claim) => claim.seatId === seatId),
  );
  const roomWithOutcome = recordHuOutcome(room, {
    outcomeId: `${roundId(room)}:hu:discard:${claimWindow.windowId}`,
    method: "discard",
    winnerSeatIds: orderedWinnerSeatIds,
    responsibleSeatId: claimWindow.discardedBySeatId,
  });
  const roomWithWinners = markDiscardHuWinners(roomWithOutcome, claimWindow);
  const settledRoom = settleHuClaims(
    roomWithWinners,
    claimWindow.discardedBySeatId,
    claimWindow.discardedByPlayerId,
    claimWindow.huClaims,
    "discardHu",
    "huClaimed",
    claimWindow.windowId,
  );

  return {
    ...settledRoom,
    eventLog: [
      ...settledRoom.eventLog,
      ...discardClaimResponseEvents(room, claimWindow, timedOutPlayerIds),
    ],
  };
}

function applyMeldClaimOutcome(
  room: RoomState,
  claimWindow: ClaimWindow,
  meldClaim: MeldClaim,
): RoomState {
  if (room.round === null) {
    return room;
  }

  const player = room.round.players[meldClaim.seatId];
  const gangSettlementFact = meldClaim.type === "mingGang"
    ? createGangSettlementFact(room, {
        gangType: "mingGang",
        gangSeatId: meldClaim.seatId,
        gangPlayerId: meldClaim.playerId,
        targetTile: claimWindow.tile,
        physicalTiles: [...meldClaim.usedTiles, claimWindow.tile],
        payerSeatIds: [claimWindow.discardedBySeatId],
        sourceWindowId: claimWindow.windowId,
        relatedEventType: "mingGangClaimed",
      })
    : null;
  const nextPlayer = {
    ...player,
    hand: removeTiles(player.hand, meldClaim.usedTiles),
    melds: [
      ...player.melds,
      {
        type: meldClaim.type,
        tile: claimWindow.tile,
        tiles: [...meldClaim.usedTiles, claimWindow.tile],
        fromPlayer: claimWindow.discardedBySeatId,
        ...(meldClaim.type === "mingGang" ? { gangId: gangSettlementFact?.gangId } : {}),
      },
    ],
  };
  const nextRound: RoundState = {
    ...room.round,
    currentPlayer: meldClaim.seatId,
    players: room.round.players.map((value) => {
      if (value.id === meldClaim.seatId) {
        return nextPlayer;
      }

      if (value.id === claimWindow.discardedBySeatId) {
        return { ...value, discards: removeLastTile(value.discards, claimWindow.tile) };
      }

      return value;
    }),
  };
  const gangSettlementFacts = gangSettlementFact === null
    ? room.gangSettlementFacts
    : appendGangSettlementFact(room.gangSettlementFacts, gangSettlementFact);
  const event: RoomEvent = meldClaim.type === "mingGang"
    ? {
        type: "mingGangClaimed",
        seatId: meldClaim.seatId,
        playerId: meldClaim.playerId,
        tile: claimWindow.tile,
        usedTiles: meldClaim.usedTiles,
      }
    : {
        type: "pengClaimed",
        seatId: meldClaim.seatId,
        playerId: meldClaim.playerId,
        tile: claimWindow.tile,
        usedTiles: meldClaim.usedTiles,
      };

  return {
    ...room,
    round: nextRound,
    gangSettlementFacts,
    gangDraw:
      meldClaim.type === "mingGang"
        ? { seatId: meldClaim.seatId, playerId: meldClaim.playerId, gangType: "mingGang", tile: claimWindow.tile }
        : room.gangDraw,
    eventLog: [...room.eventLog, event],
  };
}

function markDiscardHuWinners(room: RoomState, claimWindow: ClaimWindow): RoomState {
  if (room.round === null || claimWindow.huClaims.length === 0) {
    return room;
  }

  const winnerSeatIds = new Set(claimWindow.huClaims.map((claim) => claim.seatId));

  return {
    ...room,
    round: {
      ...room.round,
      players: room.round.players.map((player) =>
        winnerSeatIds.has(player.id)
          ? {
              ...player,
              hasWon: true,
              claimedWinningTile: {
                tile: claimWindow.tile,
                source: "discard" as const,
                sourceWindowId: claimWindow.windowId,
                responsibleSeatId: claimWindow.discardedBySeatId,
                responsiblePlayerId: claimWindow.discardedByPlayerId,
              },
            }
          : player,
      ),
    },
  };
}

function discardClaimResponseEvents(
  room: RoomState,
  claimWindow: ClaimWindow,
  timedOutPlayerIds: PlayerId[] = [],
): RoomEvent[] {
  const timedOut = new Set(timedOutPlayerIds);
  const events: RoomEvent[] = [];

  for (const seatId of claimWindow.pendingPlayerIds) {
    const huClaim = claimWindow.huClaims.find((claim) => claim.seatId === seatId);

    if (huClaim !== undefined) {
      events.push({
        type: "huClaimed",
        seatId,
        playerId: huClaim.playerId,
        tile: claimWindow.tile,
        patterns: huClaim.patterns,
        genCount: huClaim.genCount,
        points: huClaim.points,
      });
      continue;
    }

    if (claimWindow.passedPlayerIds.includes(seatId) && !timedOut.has(seatId)) {
      const playerId = room.seats.find((seat) => seat.seatId === seatId)?.playerId;

      if (playerId !== null && playerId !== undefined) {
        events.push({ type: "claimPassed", seatId, playerId });
      }
    }
  }

  return events;
}

function settleHuClaims(
  room: RoomState,
  loserSeatId: PlayerId,
  loserPlayerId: string,
  huClaims: HuClaim[],
  reason: HuSettlementReason,
  relatedEventType: HuSettlementEventType,
  sourceWindowId: string,
): RoomState {
  return applyRoomHuSettlement(
    room,
    huClaims.map((claim) => ({
      winnerSeatId: claim.seatId,
      winnerPlayerId: claim.playerId,
      loserSeatId,
      loserPlayerId,
      reason,
      sourceWindowId,
      rawPoints: claim.rawPoints,
      finalPoints: claim.points,
      relatedEvent: { type: relatedEventType, seatId: claim.seatId },
    })),
  );
}

function applyRoomHuSettlement(room: RoomState, transfers: HuSettlementTransfer[]): RoomState {
  const result = applyHuSettlementBatch(room.scores, room.settlementLedger, transfers);

  return {
    ...room,
    scores: result.scores,
    settlementLedger: result.ledger,
  };
}

function settleBaGangClaimWindow(
  room: RoomState,
  claimWindow: BaGangClaimWindow,
  trigger: "allResponded" | "timeout" = "allResponded",
  timedOutPlayerIds: PlayerId[] = [],
): RoomState {
  if (room.round === null) {
    return room;
  }

  const orderedWinnerSeatIds = claimWindow.pendingPlayerIds.filter((seatId) =>
    claimWindow.huClaims.some((claim) => claim.seatId === seatId),
  );
  const roomWithOutcome = recordHuOutcome(room, {
    outcomeId: `${roundId(room)}:hu:qiangGang:${claimWindow.windowId}`,
    method: "qiangGang",
    winnerSeatIds: orderedWinnerSeatIds,
    responsibleSeatId: claimWindow.upgradedBySeatId,
  });
  const roomWithWinners = markQiangGangHuWinners(roomWithOutcome, claimWindow);
  const round = roomWithWinners.round!;
  const upgrader = round.players[claimWindow.upgradedBySeatId];
  const nextHand = removeFirstTile(upgrader.hand, claimWindow.tile);
  const responseEvents = qiangGangResponseEvents(room, claimWindow, timedOutPlayerIds);

  if (claimWindow.huClaims.length > 0) {
    const settledRoom = settleHuClaims(
      roomWithWinners,
      claimWindow.upgradedBySeatId,
      claimWindow.upgradedByPlayerId,
      claimWindow.huClaims,
      "qiangGangHu",
      "qiangGangHuClaimed",
      claimWindow.windowId,
    );
    const nextRound: RoundState = {
      ...round,
      currentPlayer: findNextActivePlayer(round, claimWindow.upgradedBySeatId),
      players: round.players.map((player) =>
        player.id === claimWindow.upgradedBySeatId ? { ...player, hand: nextHand } : player,
      ),
    };

    return finishRoundIfNeeded({
      ...settledRoom,
      phase: "draw",
      selfDrawEligible: false,
      lastDrawnTileId: null,
      round: nextRound,
      baGangClaimWindow: null,
      gangDraw: null,
      resolvedWindowIds: appendResolvedWindowId(settledRoom.resolvedWindowIds, claimWindow.windowId),
      eventLog: [
        ...settledRoom.eventLog,
        ...responseEvents,
        {
          type: "qiangGangWindowClosed",
          reason: trigger === "timeout" ? "timeoutRobbed" : "robbed",
        },
      ],
    });
  }

  const peng = upgrader.melds[claimWindow.pengMeldIndex];

  if (peng === undefined || peng.type !== "peng" || !sameTile(peng.tile, claimWindow.targetTile)) {
    return room;
  }

  const gangSettlementFact = createGangSettlementFact(roomWithWinners, {
    gangType: "baGang",
    gangSeatId: claimWindow.upgradedBySeatId,
    gangPlayerId: claimWindow.upgradedByPlayerId,
    targetTile: claimWindow.targetTile,
    physicalTiles: [...peng.tiles, claimWindow.tile],
    payerSeatIds: activeGangPayerSeatIds(round, claimWindow.upgradedBySeatId),
    pointsPerPayer: claimWindow.pointsPerPayer,
    paymentEligibility: claimWindow.paymentEligibility,
    sourceWindowId: claimWindow.windowId,
    relatedEventType: "baGangClaimed",
  });
  const nextPlayer = {
    ...upgrader,
    hand: nextHand,
    melds: upgrader.melds.map((meld, index) =>
      index === claimWindow.pengMeldIndex
        ? {
            ...peng,
            type: "baGang" as const,
            tiles: [...peng.tiles, claimWindow.tile],
            gangId: gangSettlementFact.gangId,
          }
        : meld,
    ),
  };
  const nextRound: RoundState = {
    ...round,
    players: round.players.map((player) =>
      player.id === claimWindow.upgradedBySeatId ? nextPlayer : player,
    ),
  };

  return finishRoundIfNeeded({
    ...roomWithWinners,
    phase: "gangDraw",
    selfDrawEligible: false,
    lastDrawnTileId: null,
    round: nextRound,
    gangSettlementFacts: appendGangSettlementFact(roomWithWinners.gangSettlementFacts, gangSettlementFact),
    baGangClaimWindow: null,
    resolvedWindowIds: appendResolvedWindowId(roomWithWinners.resolvedWindowIds, claimWindow.windowId),
    gangDraw: {
      seatId: claimWindow.upgradedBySeatId,
      playerId: claimWindow.upgradedByPlayerId,
      gangType: "baGang",
      tile: claimWindow.targetTile,
    },
    eventLog: [
      ...roomWithWinners.eventLog,
      ...responseEvents,
      {
        type: "baGangClaimed",
        seatId: claimWindow.upgradedBySeatId,
        playerId: claimWindow.upgradedByPlayerId,
        tile: claimWindow.targetTile,
        usedTiles: [claimWindow.tile],
      },
      {
        type: "qiangGangWindowClosed",
        reason: trigger === "timeout" ? "timeoutAllPassed" : "allPassed",
      },
    ],
  });
}

function markQiangGangHuWinners(room: RoomState, claimWindow: BaGangClaimWindow): RoomState {
  if (room.round === null || claimWindow.huClaims.length === 0) {
    return room;
  }

  const winnerSeatIds = new Set(claimWindow.huClaims.map((claim) => claim.seatId));

  return {
    ...room,
    round: {
      ...room.round,
      players: room.round.players.map((player) =>
        winnerSeatIds.has(player.id)
          ? {
              ...player,
              hasWon: true,
              claimedWinningTile: {
                tile: claimWindow.tile,
                source: "qiangGang" as const,
                sourceWindowId: claimWindow.windowId,
                responsibleSeatId: claimWindow.upgradedBySeatId,
                responsiblePlayerId: claimWindow.upgradedByPlayerId,
              },
            }
          : player,
      ),
    },
  };
}

function qiangGangResponseEvents(
  room: RoomState,
  claimWindow: BaGangClaimWindow,
  timedOutPlayerIds: PlayerId[] = [],
): RoomEvent[] {
  const timedOut = new Set(timedOutPlayerIds);
  const events: RoomEvent[] = [];

  for (const seatId of claimWindow.pendingPlayerIds) {
    const huClaim = claimWindow.huClaims.find((claim) => claim.seatId === seatId);

    if (huClaim !== undefined) {
      events.push({
        type: "qiangGangHuClaimed",
        seatId,
        playerId: huClaim.playerId,
        responsibleSeatId: claimWindow.upgradedBySeatId,
        responsiblePlayerId: claimWindow.upgradedByPlayerId,
        tile: claimWindow.tile,
        patterns: huClaim.patterns,
        genCount: huClaim.genCount,
        points: huClaim.points,
      });
      continue;
    }

    if (claimWindow.passedPlayerIds.includes(seatId) && !timedOut.has(seatId)) {
      const playerId = room.seats.find((seat) => seat.seatId === seatId)?.playerId;

      if (playerId !== null && playerId !== undefined) {
        events.push({ type: "qiangGangPassed", seatId, playerId });
      }
    }
  }

  return events;
}

function resolveDiscardClaimWindow(
  room: RoomState,
  claimWindow: ClaimWindow,
  reason: "allPassed" | "timeout" | "claimed",
  timedOutPlayerIds: PlayerId[] = [],
): RoomState {
  const nextPlayerOverride = claimWindow.huClaims.length === 0
    ? claimWindow.meldClaims[0]?.seatId
    : undefined;

  return finishRoundIfNeeded(
    closeClaimWindow(
      settleDiscardClaimWindow(room, claimWindow, timedOutPlayerIds),
      claimWindow,
      reason,
      nextPlayerOverride,
    ),
  );
}

function closeClaimWindow(
  room: RoomState,
  claimWindow: ClaimWindow,
  reason: "allPassed" | "timeout" | "claimed",
  nextPlayerOverride?: PlayerId,
): RoomState {
  const nextPlayer =
    nextPlayerOverride ??
    (room.round === null ? claimWindow.nextPlayer : findNextActivePlayer(room.round, claimWindow.discardedBySeatId));
  const nextPhase: RoundPhase =
    nextPlayerOverride === undefined ? "draw" : room.gangDraw === null ? "discard" : "gangDraw";

  return {
    ...room,
    phase: nextPhase,
    selfDrawEligible: false,
    lastDrawnTileId: null,
    round: room.round === null ? null : { ...room.round, currentPlayer: nextPlayer },
    claimWindow: null,
    resolvedWindowIds: appendResolvedWindowId(room.resolvedWindowIds, claimWindow.windowId),
    eventLog: [...room.eventLog, { type: "claimWindowClosed", reason, nextPlayer }],
  };
}

function appendResolvedWindowId(resolvedWindowIds: string[], windowId: string): string[] {
  return resolvedWindowIds.includes(windowId)
    ? resolvedWindowIds
    : [...resolvedWindowIds, windowId];
}

type RecordHuOutcomeInput = {
  outcomeId: string;
  method: HuOutcomeFact["method"];
  winnerSeatIds: PlayerId[];
  responsibleSeatId: PlayerId | null;
};

function recordHuOutcome(room: RoomState, input: RecordHuOutcomeInput): RoomState {
  if (input.winnerSeatIds.length === 0 || room.huOutcomeFacts.some((fact) => fact.outcomeId === input.outcomeId)) {
    return room;
  }

  const fact: HuOutcomeFact = {
    roundId: roundId(room),
    outcomeId: input.outcomeId,
    method: input.method,
    winnerSeatIds: [...input.winnerSeatIds],
    responsibleSeatId: input.responsibleSeatId,
  };

  return {
    ...room,
    firstWinnerSeatId: room.firstWinnerSeatId ?? input.winnerSeatIds[0],
    multipleHuDiscarderSeatId:
      input.method === "discard" && input.winnerSeatIds.length > 1
        ? input.responsibleSeatId
        : room.multipleHuDiscarderSeatId,
    huOutcomeFacts: [...room.huOutcomeFacts, fact],
  };
}

type CreateGangSettlementFactInput = {
  gangType: GangType;
  gangSeatId: PlayerId;
  gangPlayerId: string;
  targetTile: Tile;
  physicalTiles: PhysicalTile[];
  payerSeatIds: PlayerId[];
  pointsPerPayer?: 0 | 1 | 2 | 4;
  paymentEligibility?: BaGangPaymentEligibility | "normal";
  sourceWindowId: string | null;
  relatedEventType: GangSettlementFact["relatedEventType"];
};

function createGangSettlementFact(
  room: RoomState,
  input: CreateGangSettlementFactInput,
): GangSettlementFact {
  const physicalTiles = [...input.physicalTiles];
  const usesLaizi = physicalTiles.some(isYaoJi);
  const pointsPerPayer = input.pointsPerPayer ?? calculateGangPoints(input.gangType, usesLaizi) as 1 | 2 | 4;
  const sourceId = input.sourceWindowId ?? `event-${room.eventLog.length}`;

  return {
    gangId: `${room.id}:round:${room.roundNumber}:gang:${input.gangType}:${sourceId}`,
    gangType: input.gangType,
    gangSeatId: input.gangSeatId,
    gangPlayerId: input.gangPlayerId,
    targetTile: input.targetTile,
    physicalTiles,
    usesLaizi,
    payers: [...input.payerSeatIds]
      .sort((left, right) => left - right)
      .flatMap((seatId): GangSettlementPayer[] => {
        const playerId = room.seats[seatId]?.playerId;

        return playerId === null || playerId === undefined ? [] : [{ seatId, playerId }];
      }),
    pointsPerPayer,
    paymentEligibility: input.paymentEligibility ?? "normal",
    sourceWindowId: input.sourceWindowId,
    relatedEventType: input.relatedEventType,
  };
}

function activeGangPayerSeatIds(round: RoundState, gangSeatId: PlayerId): PlayerId[] {
  return round.players
    .filter((player) => player.id !== gangSeatId && !player.hasWon)
    .map((player) => player.id);
}

function appendGangSettlementFact(
  facts: GangSettlementFact[],
  fact: GangSettlementFact,
): GangSettlementFact[] {
  return facts.some((value) => value.gangId === fact.gangId) ? facts : [...facts, fact];
}

function finishRoundIfNeeded(room: RoomState): RoomState {
  if (room.round === null) {
    return room;
  }

  const remainingPlayerIds = room.round.players.filter((player) => !player.hasWon).map((player) => player.id);
  const wallExhausted =
    room.round.wall.length === 0 && (room.phase === "draw" || room.phase === "gangDraw");
  const reason =
    remainingPlayerIds.length <= 1 ? "onePlayerLeft" : wallExhausted ? "wallEmpty" : null;

  if (room.roundEnd !== null) {
    return settleRoundPayments(room);
  }

  if (reason === null) {
    return room;
  }

  const roundEnd: RoundEndState = { reason, remainingPlayerIds };

  return settleRoundPayments({
    ...room,
    status: "ended",
    phase: "ended",
    selfDrawEligible: false,
    lastDrawnTileId: null,
    roundEnd,
    chaJiao: null,
    chaJiaoSettlementFacts: [],
    claimWindow: null,
    baGangClaimWindow: null,
    gangDraw: null,
    eventLog: [...room.eventLog, { type: "roundEnded", ...roundEnd }],
  });
}

function settleRoundPayments(room: RoomState): RoomState {
  const settledRoom = settleRoundChaJiaoPayments(
    settleRoundGangPayments(settleRoundChickenPayments(room)),
  );

  return finalizeRoundHistory(settledRoom);
}

function finalizeRoundHistory(room: RoomState): RoomState {
  if (room.round === null || room.roundEnd === null || room.status !== "ended") {
    return room;
  }

  if (room.roundHistory.some((entry) => entry.roundNumber === room.roundNumber)) {
    return room;
  }

  const nextDealerDecision = decideNextDealer(room);
  const scoreDeltas = room.scores.map((score): RoundScoreDelta => {
    const before = room.roundStartScores.find((value) => value.seatId === score.seatId)?.points ?? 0;
    return {
      seatId: score.seatId,
      playerId: score.playerId,
      beforePoints: before,
      delta: score.points - before,
      afterPoints: score.points,
    };
  });
  const roundHistoryEntry: RoundHistoryEntry = {
    roundId: roundId(room),
    roundNumber: room.roundNumber,
    dealerSeatId: room.currentDealer,
    roundEnd: {
      reason: room.roundEnd.reason,
      remainingPlayerIds: [...room.roundEnd.remainingPlayerIds],
    },
    nextDealerDecision,
    scoreDeltas,
    settlementLedger: [...room.settlementLedger],
  };
  const resetReadyEvents: RoomEvent[] = room.seats.flatMap((seat) =>
    seat.ready && seat.playerId !== null
      ? [{ type: "readyChanged" as const, seatId: seat.seatId, playerId: seat.playerId, ready: false }]
      : [],
  );

  return {
    ...room,
    gameStatus: "betweenRounds",
    nextDealerDecision,
    roundHistory: [...room.roundHistory, roundHistoryEntry],
    seats: room.seats.map((seat) => ({ ...seat, ready: false })),
    eventLog: [
      ...room.eventLog,
      ...resetReadyEvents,
      {
        type: "nextDealerDecided",
        completedRoundNumber: room.roundNumber,
        nextDealerSeatId: nextDealerDecision.nextDealerSeatId,
        reason: nextDealerDecision.reason,
      },
    ],
  };
}

function decideNextDealer(room: RoomState): NextDealerDecision {
  const dealerOverride = [...room.huOutcomeFacts].reverse().find((fact) =>
    (fact.method === "qiangGang" && fact.responsibleSeatId !== null) ||
    (fact.method === "discard" && fact.winnerSeatIds.length > 1 && fact.responsibleSeatId !== null),
  );
  const reason: NextDealerReason = dealerOverride?.method === "qiangGang"
    ? "qiangGangDeclarer"
    : dealerOverride !== undefined
      ? "multipleHuDiscarder"
      : room.firstWinnerSeatId !== null
        ? "firstWinner"
        : "wallEmptyDealerKeeps";
  const nextDealerSeatId = dealerOverride?.responsibleSeatId ?? room.firstWinnerSeatId ?? room.currentDealer;

  return {
    roundId: roundId(room),
    completedRoundNumber: room.roundNumber,
    nextDealerSeatId,
    reason,
    firstWinnerSeatId: room.firstWinnerSeatId,
    multipleHuDiscarderSeatId: room.multipleHuDiscarderSeatId,
  };
}

export function settleRoundChickenPayments(room: RoomState): RoomState {
  if (room.round === null || room.roundEnd === null || room.status !== "ended") {
    return room;
  }

  const sourceSettlementId = `${room.id}:round:${room.roundNumber}:chicken`;
  const roundEndReason = room.roundEnd.reason;
  const transfers = room.round.players.flatMap((player): ChickenSettlementTransfer[] => {
    const winnerPlayerId = room.seats[player.id]?.playerId;

    if (winnerPlayerId === null || winnerPlayerId === undefined) {
      return [];
    }

    const finalSettlementTiles = [
      ...player.hand,
      ...player.melds.flatMap((meld) => meld.tiles),
      ...(player.claimedWinningTile === null ? [] : [player.claimedWinningTile.tile]),
    ];
    const chickenSettlement = calculateChickenSettlement(finalSettlementTiles);
    const liability = qiangGangSanJiLiability(player);

    return chickenSettlement.payments.flatMap((payment): ChickenSettlementTransfer[] => {
      const chickenSuit = chickenSuitFromPayment(payment.tile);

      if (chickenSuit === null) {
        return [];
      }

      if (
        payment.kind === "threeChicken" &&
        liability !== null &&
        liability.chickenSuit === chickenSuit
      ) {
        return [{
          winnerSeatId: player.id,
          winnerPlayerId,
          loserSeatId: liability.responsibleSeatId,
          loserPlayerId: liability.responsiblePlayerId,
          reason: "qiangGangSanJiLiability",
          chickenSuit,
          chickenCount: 3,
          points: 48,
          relatedEvent: {
            type: "qiangGangHuClaimed",
            windowId: liability.sourceWindowId,
            seatId: player.id,
            responsibleSeatId: liability.responsibleSeatId,
            responsiblePlayerId: liability.responsiblePlayerId,
          },
        }];
      }

      return seatIds.flatMap((loserSeatId): ChickenSettlementTransfer[] => {
        if (loserSeatId === player.id) {
          return [];
        }

        const loserPlayerId = room.seats[loserSeatId]?.playerId;

        if (loserPlayerId === null || loserPlayerId === undefined) {
          return [];
        }

        return [{
          winnerSeatId: player.id,
          winnerPlayerId,
          loserSeatId,
          loserPlayerId,
          reason: payment.kind === "threeChicken" ? "sanJi" : "siJi",
          chickenSuit,
          chickenCount: payment.count,
          points: payment.pointsPerOpponent,
          relatedEvent: { type: "roundEnded", reason: roundEndReason },
        }];
      });
    });
  });
  const result = applyChickenSettlementBatch(
    room.scores,
    room.settlementLedger,
    room.resolvedSettlementIds,
    sourceSettlementId,
    transfers,
  );

  if (result.resolvedSettlementIds === room.resolvedSettlementIds) {
    return room;
  }

  return {
    ...room,
    scores: result.scores,
    settlementLedger: result.ledger,
    resolvedSettlementIds: result.resolvedSettlementIds,
  };
}

export function settleRoundGangPayments(room: RoomState): RoomState {
  if (room.round === null || room.roundEnd === null || room.status !== "ended") {
    return room;
  }

  if (room.gangSettlementFacts.length === 0) {
    return room;
  }

  const sourceSettlementId = `${room.id}:round:${room.roundNumber}:gang`;
  const transfers = room.gangSettlementFacts.flatMap((fact): GangSettlementTransfer[] =>
    fact.pointsPerPayer === 0 ? [] : fact.payers.map((payer) => ({
      gangId: fact.gangId,
      winnerSeatId: fact.gangSeatId,
      winnerPlayerId: fact.gangPlayerId,
      loserSeatId: payer.seatId,
      loserPlayerId: payer.playerId,
      reason: fact.gangType,
      targetTile: fact.targetTile,
      physicalTiles: fact.physicalTiles.map(tileFace),
      usesLaizi: fact.usesLaizi,
      sourceWindowId: fact.sourceWindowId,
      points: fact.pointsPerPayer as 1 | 2 | 4,
      relatedEvent: { type: fact.relatedEventType, seatId: fact.gangSeatId },
    })),
  );
  const result = applyGangSettlementBatch(
    room.scores,
    room.settlementLedger,
    room.resolvedSettlementIds,
    sourceSettlementId,
    transfers,
  );

  if (result.resolvedSettlementIds === room.resolvedSettlementIds) {
    return room;
  }

  return {
    ...room,
    scores: result.scores,
    settlementLedger: result.ledger,
    resolvedSettlementIds: result.resolvedSettlementIds,
  };
}

export function settleRoundChaJiaoPayments(room: RoomState): RoomState {
  if (
    room.round === null ||
    room.roundEnd?.reason !== "wallEmpty" ||
    room.status !== "ended"
  ) {
    return room;
  }

  const analysis = room.chaJiao === null
    ? buildChaJiaoSettlement(room)
    : { result: room.chaJiao, facts: room.chaJiaoSettlementFacts };
  const analyzedRoom: RoomState = room.chaJiao === null
    ? {
        ...room,
        chaJiao: analysis.result,
        chaJiaoSettlementFacts: analysis.facts,
      }
    : room;
  const sourceSettlementId = `${room.id}:round:${room.roundNumber}:chaJiao`;
  const transfers = analysis.facts.flatMap((fact): ChaJiaoSettlementTransfer[] =>
    fact.payers.map((payer) => ({
      chaJiaoId: `${fact.factId}:payer:${payer.seatId}`,
      winnerSeatId: fact.winnerSeatId,
      winnerPlayerId: fact.winnerPlayerId,
      loserSeatId: payer.seatId,
      loserPlayerId: payer.playerId,
      reason: "chaJiao",
      winningTile: fact.winningTile,
      patterns: [...fact.patterns],
      genCount: fact.genCount,
      sourceWindowId: null,
      rawPoints: fact.rawPoints,
      finalPoints: fact.points,
      relatedEvent: { type: "roundEnded", reason: "wallEmpty" },
    })),
  );
  const result = applyChaJiaoSettlementBatch(
    analyzedRoom.scores,
    analyzedRoom.settlementLedger,
    analyzedRoom.resolvedSettlementIds,
    sourceSettlementId,
    transfers,
  );

  if (
    analyzedRoom === room &&
    result.resolvedSettlementIds === room.resolvedSettlementIds
  ) {
    return room;
  }

  return {
    ...analyzedRoom,
    scores: result.scores,
    settlementLedger: result.ledger,
    resolvedSettlementIds: result.resolvedSettlementIds,
  };
}

function qiangGangSanJiLiability(
  player: RoundState["players"][number],
): {
  chickenSuit: ChickenSuit;
  sourceWindowId: string;
  responsibleSeatId: PlayerId;
  responsiblePlayerId: string;
} | null {
  const claimed = player.claimedWinningTile;

  if (claimed === null || claimed.source !== "qiangGang" || !isYaoJi(claimed.tile)) {
    return null;
  }

  const chickenSuit = chickenSuitFromPayment(claimed.tile);

  if (chickenSuit === null) {
    return null;
  }

  const tilesBeforeClaim = [
    ...player.hand,
    ...player.melds.flatMap((meld) => meld.tiles),
  ];
  const countBeforeClaim = tilesBeforeClaim.filter(
    (value) => value.suit === chickenSuit && isYaoJi(value),
  ).length;

  if (countBeforeClaim !== 2) {
    return null;
  }

  return {
    chickenSuit,
    sourceWindowId: claimed.sourceWindowId,
    responsibleSeatId: claimed.responsibleSeatId,
    responsiblePlayerId: claimed.responsiblePlayerId,
  };
}

function chickenSuitFromPayment(tileValue: Tile): ChickenSuit | null {
  return tileValue.suit === "bamboos" || tileValue.suit === "dots" ? tileValue.suit : null;
}

type WinningWinCheckResult = Extract<WinCheckResult, { canHu: true }>;

type ChaJiaoBestWin = {
  winningTile: Tile;
  result: WinningWinCheckResult;
};

function buildChaJiaoSettlement(room: RoomState): {
  result: ChaJiaoResult;
  facts: ChaJiaoSettlementFact[];
} {
  if (room.round === null) {
    return { result: { reason: "wallEmpty", players: [] }, facts: [] };
  }

  const candidates = allTileCandidates();
  const analyses = room.round.players
    .filter((player) => !player.hasWon)
    .map((player) => ({
      player,
      playerId: room.seats[player.id]?.playerId ?? null,
      best: findBestChaJiaoWin(room.round!, player.id, candidates),
    }));
  const payers = analyses.flatMap((analysis): ChaJiaoSettlementPayer[] =>
    analysis.best === null && analysis.playerId !== null
      ? [{ seatId: analysis.player.id, playerId: analysis.playerId }]
      : [],
  );

  return {
    result: {
      reason: "wallEmpty",
      players: analyses.map((analysis) => ({
        seatId: analysis.player.id,
        playerId: analysis.playerId,
        isListening: analysis.best !== null,
        bestWinningTile: analysis.best?.winningTile ?? null,
        patterns: analysis.best?.result.patterns ?? [],
        genCount: analysis.best?.result.score.genCount ?? 0,
        rawHuPoints: analysis.best?.result.score.rawPoints ?? null,
        maxHuPoints: analysis.best?.result.score.cappedPoints ?? null,
      })),
    },
    facts: analyses.flatMap((analysis): ChaJiaoSettlementFact[] => {
      if (analysis.best === null || analysis.playerId === null) {
        return [];
      }

      return [{
        factId: `${room.id}:round:${room.roundNumber}:chaJiao:fact:seat:${analysis.player.id}`,
        winnerSeatId: analysis.player.id,
        winnerPlayerId: analysis.playerId,
        payers,
        winningTile: analysis.best.winningTile,
        decomposition: analysis.best.result.decomposition,
        patterns: [...analysis.best.result.patterns],
        genCount: analysis.best.result.score.genCount,
        rawPoints: analysis.best.result.score.rawPoints,
        points: analysis.best.result.score.cappedPoints,
      }];
    }),
  };
}

function findBestChaJiaoWin(
  round: RoundState,
  playerId: PlayerId,
  candidates: Tile[],
): ChaJiaoBestWin | null {
  const wins = candidates.flatMap((winningTile): ChaJiaoBestWin[] => {
    const result = checkDiscardHu(round, playerId, winningTile);

    return result.canHu ? [{ winningTile, result }] : [];
  });
  wins.sort(compareChaJiaoBestWins);

  return wins[0] ?? null;
}

function compareChaJiaoBestWins(left: ChaJiaoBestWin, right: ChaJiaoBestWin): number {
  const leftScore = left.result.score;
  const rightScore = right.result.score;
  const leftMultiplier = leftScore.multiplierBeforeWinMethod * leftScore.winMethodMultiplier;
  const rightMultiplier = rightScore.multiplierBeforeWinMethod * rightScore.winMethodMultiplier;

  return (
    rightScore.cappedPoints - leftScore.cappedPoints ||
    rightScore.rawPoints - leftScore.rawPoints ||
    rightMultiplier - leftMultiplier ||
    rightScore.genCount - leftScore.genCount ||
    tileKey(left.winningTile).localeCompare(tileKey(right.winningTile)) ||
    huDecompositionSignature(left.result.decomposition).localeCompare(
      huDecompositionSignature(right.result.decomposition),
    )
  );
}

function allTileCandidates(): Tile[] {
  const suits: Suit[] = ["characters", "dots", "bamboos"];
  const ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return suits.flatMap((suit) => ranks.map((rank) => tile(suit, rank)));
}

function findNextActivePlayer(round: RoundState, fromPlayer: PlayerId): PlayerId {
  for (let offset = 1; offset <= seatIds.length; offset += 1) {
    const candidate = ((fromPlayer + offset) % seatIds.length) as PlayerId;

    if (!round.players[candidate].hasWon) {
      return candidate;
    }
  }

  return fromPlayer;
}

function roundId(room: Pick<RoomState, "id" | "roundNumber">): string {
  return `${room.id}:round:${room.roundNumber}`;
}

function cloneScores(scores: readonly PlayerScoreBalance[]): PlayerScoreBalance[] {
  return scores.map((score) => ({ ...score }));
}

function replaceSeat(seats: SeatState[], seatId: PlayerId, nextSeat: SeatState): SeatState[] {
  return seats.map((seat) => (seat.seatId === seatId ? nextSeat : seat));
}
