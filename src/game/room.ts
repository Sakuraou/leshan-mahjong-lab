import {
  discardTile as discardRoundTile,
  drawTile as drawRoundTile,
  startRound,
  type DiscardTileResult,
  type DrawTileResult,
} from "./round.ts";
import { isYaoJi, sameTile, tile } from "./tiles.ts";
import { checkCurrentPlayerHu, checkDiscardHu } from "./win.ts";
import {
  applyChickenSettlementBatch,
  applyHuSettlementBatch,
  calculateChickenSettlement,
  createInitialScoreBalances,
  type ChickenSettlementTransfer,
  type ChickenSuit,
  type HuSettlementEventType,
  type HuSettlementReason,
  type HuSettlementTransfer,
  type PlayerScoreBalance,
  type RoundEndReason,
  type SettlementLedgerEntry,
} from "./rules.ts";
import type { Meld, PlayerId, Rank, RoundState, ScorePattern, Suit, Tile } from "./types.ts";

const seatIds: PlayerId[] = [0, 1, 2, 3];
export const DEFAULT_RESPONSE_WINDOW_TIMEOUT_MS = 15_000;

export type ResponseWindowKind = "discardClaim" | "qiangGang";
export type ResponseWindowStatus = "open" | "expired";
export type ResponseWindowTiming = { now?: number; timeoutMs?: number };

type ResponseWindowMetadata = {
  windowId: string;
  deadlineAt: number;
  status: ResponseWindowStatus;
};

export type RoomStatus = "waiting" | "dingque" | "playing" | "ended";

export type RoundPhase = "dingque" | "draw" | "discard" | "claim" | "gangDraw" | "qiangGang" | "ended";

export type ClientLegalAction =
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

export type ClaimWindow = ResponseWindowMetadata & {
  discardedBySeatId: PlayerId;
  discardedByPlayerId: string;
  tile: Tile;
  nextPlayer: PlayerId;
  pendingPlayerIds: PlayerId[];
  passedPlayerIds: PlayerId[];
  huClaims: HuClaim[];
};

export type HuClaim = {
  seatId: PlayerId;
  playerId: string;
  patterns: ScorePattern[];
  genCount: number;
  rawPoints: number;
  points: number;
};

export type BaGangClaimWindow = ResponseWindowMetadata & {
  upgradedBySeatId: PlayerId;
  upgradedByPlayerId: string;
  targetTile: Tile;
  tile: Tile;
  pengMeldIndex: number;
  pendingPlayerIds: PlayerId[];
  passedPlayerIds: PlayerId[];
  huClaims: HuClaim[];
};

export type ClientVisibleBaGangClaimWindow = Omit<BaGangClaimWindow, "pengMeldIndex">;

export type ClientVisibleResponseWindow = {
  windowId: string;
  kind: ResponseWindowKind;
  deadlineAt: number;
  remainingMs: number;
  status: ResponseWindowStatus;
};

export type GangDrawState = {
  seatId: PlayerId;
  playerId: string;
  gangType: "mingGang" | "anGang" | "baGang";
  tile: Tile;
};

export type RoundEndState = {
  reason: RoundEndReason;
  remainingPlayerIds: PlayerId[];
};

export type ChaJiaoPlayerResult = {
  seatId: PlayerId;
  playerId: string | null;
  isListening: boolean;
  maxHuPoints: number | null;
};

export type ChaJiaoResult = {
  reason: "wallEmpty";
  players: ChaJiaoPlayerResult[];
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
  | { type: "missingSuitChosen"; seatId: PlayerId; playerId: string; suit: Suit }
  | { type: "tileDrawn"; seatId: PlayerId; playerId: string }
  | { type: "tileDiscarded"; seatId: PlayerId; playerId: string; tile: Tile }
  | { type: "claimWindowOpened"; discardedBySeatId: PlayerId; tile: Tile; pendingPlayerIds: PlayerId[] }
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
  | { type: "claimWindowClosed"; reason: "allPassed" | "timeout" | "claimed"; nextPlayer: PlayerId };

export type ClientRoomEvent =
  | RoomEvent
  | { type: "anGangClaimed"; seatId: PlayerId; playerId: string };

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
  status: RoomStatus;
  phase: RoundPhase | null;
  selfDrawEligible: boolean;
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
  resolvedSettlementIds: string[];
  resolvedWindowIds: string[];
  eventLog: RoomEvent[];
};

export type VisiblePlayerState = {
  id: PlayerId;
  hand: Tile[] | null;
  handCount: number;
  discards: Tile[];
  melds: ClientVisibleMeld[];
  hasWon: boolean;
  missingSuit: RoundState["players"][number]["missingSuit"];
};

export type ClientVisibleRoomState = {
  id: string;
  status: RoomStatus;
  phase: RoundPhase | null;
  legalActions: ClientLegalAction[];
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
  claimWindow: ClaimWindow | null;
  baGangClaimWindow: ClientVisibleBaGangClaimWindow | null;
  gangDraw: ClientVisibleGangDrawState | null;
  roundEnd: RoundEndState | null;
  chaJiao: ChaJiaoResult | null;
  scores: PlayerScoreBalance[];
  settlementLedger: SettlementLedgerEntry[];
  responseWindow: ClientVisibleResponseWindow | null;
  eventLog: ClientRoomEvent[];
};

export type CreateRoomInput = {
  id: string;
  seed: string;
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
  return {
    id: input.id,
    seed: input.seed,
    roundNumber: 0,
    status: "waiting",
    phase: null,
    selfDrawEligible: false,
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
    scores: createInitialScoreBalances(),
    settlementLedger: [],
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
  if (room.status !== "waiting") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  if (room.seats.some((seat) => seat.playerId === null)) {
    return { ok: false, reason: "notEnoughPlayers" };
  }

  if (room.seats.some((seat) => !seat.ready)) {
    return { ok: false, reason: "notAllPlayersReady" };
  }

  return {
    ok: true,
    room: {
      ...room,
      roundNumber: room.roundNumber + 1,
      status: "dingque",
      phase: "dingque",
      selfDrawEligible: true,
      round: startRound({ seed: room.seed, dealer }),
      claimWindow: null,
      baGangClaimWindow: null,
      gangDraw: null,
      roundEnd: null,
      chaJiao: null,
      eventLog: [...room.eventLog, { type: "roundStarted", dealer }],
    },
  };
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
    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    room: finishRoundIfNeeded({
      ...room,
      phase: "discard",
      selfDrawEligible: true,
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
    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    room: finishRoundIfNeeded({
      ...room,
      phase: "discard",
      selfDrawEligible: true,
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
  timing: ResponseWindowTiming = {},
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

  const result = discardRoundTile(room.round, seat.seatId, tile);

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    room: {
      ...room,
      phase: "claim",
      selfDrawEligible: false,
      round: result.round,
      claimWindow: createClaimWindow(
        result.round,
        seat.seatId,
        playerId,
        tile,
        result.nextPlayer,
        responseWindowMetadata(room, "discardClaim", timing),
      ),
      eventLog: [
        ...room.eventLog,
        { type: "tileDiscarded", seatId: seat.seatId, playerId, tile },
        {
          type: "claimWindowOpened",
          discardedBySeatId: seat.seatId,
          tile,
          pendingPlayerIds: claimPendingPlayerIds(result.round, seat.seatId),
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
  const nextRoom = {
    ...room,
    claimWindow: allResponded ? null : nextClaimWindow,
    eventLog: [
      ...room.eventLog,
      { type: "claimPassed" as const, seatId: seat.seatId, playerId },
    ],
  };

  return {
    ok: true,
    room: allResponded
      ? finishRoundIfNeeded(
          closeClaimWindow(
            settleDiscardClaimWindow(nextRoom, nextClaimWindow),
            room.claimWindow,
            nextClaimWindow.huClaims.length > 0 ? "claimed" : "allPassed",
          ),
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
  const nextRound: RoundState = {
    ...room.round,
    players: room.round.players.map((player) =>
      player.id === seat.seatId
        ? {
            ...player,
            hasWon: true,
            claimedWinningTile: {
              tile: room.claimWindow!.tile,
              source: "discard",
              sourceWindowId: room.claimWindow!.windowId,
              responsibleSeatId: room.claimWindow!.discardedBySeatId,
              responsiblePlayerId: room.claimWindow!.discardedByPlayerId,
            },
          }
        : player,
    ),
  };
  const nextClaimWindow = { ...room.claimWindow, huClaims: [...room.claimWindow.huClaims, huClaim] };
  const allResponded = didAllClaimPlayersRespond(nextClaimWindow);
  const nextRoom = {
    ...room,
    round: nextRound,
    claimWindow: allResponded ? null : nextClaimWindow,
    eventLog: [
      ...room.eventLog,
      {
        type: "huClaimed" as const,
        seatId: seat.seatId,
        playerId,
        tile: room.claimWindow.tile,
        patterns: huClaim.patterns,
        genCount: huClaim.genCount,
        points: huClaim.points,
      },
    ],
  };

  return {
    ok: true,
    room: allResponded
      ? finishRoundIfNeeded(
          closeClaimWindow(
            settleDiscardClaimWindow(nextRoom, nextClaimWindow),
            room.claimWindow,
            "claimed",
          ),
        )
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
  const settledRoom = applyRoomHuSettlement(
    room,
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
      round: nextRound,
      eventLog: [
        ...room.eventLog,
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
      round: nextRound,
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
  tile: Tile,
  timing: ResponseWindowTiming = {},
): ClaimBaGangResult {
  const ready = prepareActiveGang(room, playerId);

  if (!ready.ok) {
    return ready;
  }

  const pengMeldIndex = ready.player.melds.findIndex((meld) => meld.type === "peng" && sameTile(meld.tile, tile));

  if (pengMeldIndex === -1) {
    return { ok: false, reason: "cannotBaGang" };
  }

  const usedTiles = chooseActiveGangTiles(ready.player.hand, tile, 1);

  if (usedTiles === null) {
    return { ok: false, reason: "cannotBaGang" };
  }

  const addedTile = usedTiles[0];
  const baGangClaimWindow = createBaGangClaimWindow(
    ready.round,
    ready.seat.seatId,
    playerId,
    tile,
    addedTile,
    pengMeldIndex,
    responseWindowMetadata(room, "qiangGang", timing),
  );

  const declaredRoom: RoomState = {
    ...room,
    phase: "qiangGang",
    selfDrawEligible: false,
    baGangClaimWindow,
    gangDraw: null,
    eventLog: [
      ...room.eventLog,
      { type: "baGangDeclared", seatId: ready.seat.seatId, playerId, tile, addedTile },
    ],
  };

  return {
    ok: true,
    room: didAllBaGangPlayersRespond(baGangClaimWindow)
      ? settleBaGangClaimWindow(declaredRoom, baGangClaimWindow)
      : declaredRoom,
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
    eventLog: [...room.eventLog, { type: "qiangGangPassed", seatId: seat.seatId, playerId }],
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
  const nextRound: RoundState = {
    ...room.round,
    players: room.round.players.map((player) =>
      player.id === seat.seatId
        ? {
            ...player,
            hasWon: true,
            claimedWinningTile: {
              tile: room.baGangClaimWindow!.tile,
              source: "qiangGang",
              sourceWindowId: room.baGangClaimWindow!.windowId,
              responsibleSeatId: room.baGangClaimWindow!.upgradedBySeatId,
              responsiblePlayerId: room.baGangClaimWindow!.upgradedByPlayerId,
            },
          }
        : player,
    ),
  };
  const nextWindow: BaGangClaimWindow = {
    ...room.baGangClaimWindow,
    huClaims: [...room.baGangClaimWindow.huClaims, huClaim],
  };
  const nextRoom: RoomState = {
    ...room,
    round: nextRound,
    baGangClaimWindow: nextWindow,
    eventLog: [
      ...room.eventLog,
      {
        type: "qiangGangHuClaimed",
        seatId: seat.seatId,
        playerId,
        responsibleSeatId: room.baGangClaimWindow.upgradedBySeatId,
        responsiblePlayerId: room.baGangClaimWindow.upgradedByPlayerId,
        tile: room.baGangClaimWindow.tile,
        patterns: huClaim.patterns,
        genCount: huClaim.genCount,
        points: huClaim.points,
      },
    ],
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

  if (room.claimWindow.huClaims.length > 0) {
    return { ok: false, reason: options.cannotReason };
  }

  if (hasUnresolvedHuOpportunity(room.round, room.claimWindow)) {
    return { ok: false, reason: options.cannotReason };
  }

  const player = room.round.players[seat.seatId];
  const usedTiles = chooseClaimMeldTiles(player.hand, room.claimWindow.tile, options.tilesNeededFromHand);

  if (usedTiles === null) {
    return { ok: false, reason: options.cannotReason };
  }

  const nextPlayer = {
    ...player,
    hand: removeTiles(player.hand, usedTiles),
    melds: [
      ...player.melds,
      {
        type: options.meldType,
        tile: room.claimWindow.tile,
        tiles: [...usedTiles, room.claimWindow.tile],
        fromPlayer: room.claimWindow.discardedBySeatId,
      },
    ],
  };
  const nextRound: RoundState = {
    ...room.round,
    currentPlayer: seat.seatId,
    players: room.round.players.map((value) => {
      if (value.id === seat.seatId) {
        return nextPlayer;
      }

      if (value.id === room.claimWindow!.discardedBySeatId) {
        return { ...value, discards: removeLastTile(value.discards, room.claimWindow!.tile) };
      }

      return value;
    }),
  };
  const nextRoom: RoomState = {
    ...room,
    round: nextRound,
    claimWindow: null,
    gangDraw:
      options.meldType === "mingGang"
        ? { seatId: seat.seatId, playerId, gangType: "mingGang", tile: room.claimWindow.tile }
        : room.gangDraw,
    eventLog: [
      ...room.eventLog,
      { type: options.eventType, seatId: seat.seatId, playerId, tile: room.claimWindow.tile, usedTiles },
    ],
  };

  return {
    ok: true,
    room: closeClaimWindow(nextRoom, room.claimWindow, "claimed", seat.seatId),
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
  const outcome = expiredWindow.huClaims.length > 0 ? "claimed" : "allPassed";
  const expiredRoom: RoomState = {
    ...room,
    claimWindow: null,
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

  return {
    ok: true,
    room: finishRoundIfNeeded(
      closeClaimWindow(
        settleDiscardClaimWindow(expiredRoom, expiredWindow),
        expiredWindow,
        "timeout",
      ),
    ),
  };
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

  return { ok: true, room: settleBaGangClaimWindow(expiredRoom, expiredWindow, "timeout") };
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

  return {
    id: room.id,
    status: room.status,
    phase: room.phase,
    legalActions: clientLegalActions(room, localSeatId),
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
              hand: player.id === localSeatId ? player.hand : null,
              handCount: player.hand.length,
              discards: player.discards,
              melds:
                player.id === localSeatId
                  ? player.melds
                  : player.melds.map((meld) =>
                      meld.type === "anGang"
                        ? { type: "anGang" as const, tile: null, tiles: [] as [], fromPlayer: null }
                        : meld,
                    ),
              hasWon: player.hasWon,
              missingSuit: player.missingSuit,
            })),
          },
    claimWindow: room.claimWindow,
    baGangClaimWindow:
      room.baGangClaimWindow === null
        ? null
        : {
            windowId: room.baGangClaimWindow.windowId,
            deadlineAt: room.baGangClaimWindow.deadlineAt,
            status: room.baGangClaimWindow.status,
            upgradedBySeatId: room.baGangClaimWindow.upgradedBySeatId,
            upgradedByPlayerId: room.baGangClaimWindow.upgradedByPlayerId,
            targetTile: room.baGangClaimWindow.targetTile,
            tile: room.baGangClaimWindow.tile,
            pendingPlayerIds: room.baGangClaimWindow.pendingPlayerIds,
            passedPlayerIds: room.baGangClaimWindow.passedPlayerIds,
            huClaims: room.baGangClaimWindow.huClaims,
          },
    gangDraw:
      room.gangDraw === null
        ? null
        : {
            ...room.gangDraw,
            tile:
              room.gangDraw.gangType === "anGang" && room.gangDraw.seatId !== localSeatId
                ? null
                : room.gangDraw.tile,
          },
    roundEnd: room.roundEnd,
    chaJiao: room.chaJiao,
    scores: room.scores,
    settlementLedger: room.settlementLedger,
    responseWindow: clientVisibleResponseWindow(room, now),
    eventLog: room.eventLog.map((event) => toClientVisibleRoomEvent(event, localSeatId)),
  };
}

function clientVisibleResponseWindow(room: RoomState, now: number): ClientVisibleResponseWindow | null {
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
  };
}

export function toClientVisibleRoomEvent(
  event: RoomEvent,
  localSeatId: PlayerId | null,
): ClientRoomEvent {
  if (event.type !== "anGangClaimed" || event.seatId === localSeatId) {
    return event;
  }

  return {
    type: "anGangClaimed",
    seatId: event.seatId,
    playerId: event.playerId,
  };
}

function clientLegalActions(room: RoomState, localSeatId: PlayerId | null): ClientLegalAction[] {
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

    if (
      room.selfDrawEligible &&
      player.melds.some(
        (meld) => meld.type === "peng" && chooseActiveGangTiles(player.hand, meld.tile, 1) !== null,
      )
    ) {
      actions.push("claimBaGang");
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

  if (room.claimWindow.huClaims.length === 0 && !hasUnresolvedHuOpportunity(room.round, room.claimWindow)) {
    if (chooseClaimMeldTiles(player.hand, room.claimWindow.tile, 2) !== null) {
      actions.push("claimPeng");
    }

    if (chooseClaimMeldTiles(player.hand, room.claimWindow.tile, 3) !== null) {
      actions.push("claimMingGang");
    }
  }

  return actions;
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
  targetTile: Tile,
  addedTile: Tile,
  pengMeldIndex: number,
  metadata: ResponseWindowMetadata,
): BaGangClaimWindow {
  return {
    ...metadata,
    upgradedBySeatId,
    upgradedByPlayerId,
    targetTile,
    tile: addedTile,
    pengMeldIndex,
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

  if (room.phase !== "discard" || !room.selfDrawEligible) {
    return { ok: false, reason: "notDiscardPhase" };
  }

  const player = room.round.players[seat.seatId];

  return { ok: true, round: room.round, seat, player };
}

function chooseActiveGangTiles(hand: Tile[], tile: Tile, tilesNeededFromHand: 1 | 4): Tile[] | null {
  const sameTiles = hand.filter((value) => sameTile(value, tile));
  const laiziTiles = hand.filter((value) => isYaoJi(value) && !sameTile(value, tile));
  const usedTiles = [...sameTiles, ...laiziTiles].slice(0, tilesNeededFromHand);

  return usedTiles.length === tilesNeededFromHand ? usedTiles : null;
}

function hasClaimResponse(claimWindow: ClaimWindow, seatId: PlayerId): boolean {
  return (
    claimWindow.passedPlayerIds.includes(seatId) ||
    claimWindow.huClaims.some((claim) => claim.seatId === seatId)
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

function chooseClaimMeldTiles(hand: Tile[], claimedTile: Tile, tilesNeededFromHand: 2 | 3): Tile[] | null {
  const sameTiles = hand.filter((tile) => sameTile(tile, claimedTile));
  const laiziTiles = hand.filter((tile) => isYaoJi(tile) && !sameTile(tile, claimedTile));
  const usedTiles = [...sameTiles, ...laiziTiles].slice(0, tilesNeededFromHand);

  return usedTiles.length === tilesNeededFromHand ? usedTiles : null;
}

function removeTiles(hand: Tile[], tilesToRemove: Tile[]): Tile[] {
  return tilesToRemove.reduce((nextHand, tile) => removeFirstTile(nextHand, tile), hand);
}

function removeFirstTile(hand: Tile[], tile: Tile): Tile[] {
  const index = hand.findIndex((value) => sameTile(value, tile));

  if (index === -1) {
    return hand;
  }

  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function removeLastTile(tiles: Tile[], tile: Tile): Tile[] {
  const index = tiles.findLastIndex((value) => sameTile(value, tile));

  if (index === -1) {
    return tiles;
  }

  return [...tiles.slice(0, index), ...tiles.slice(index + 1)];
}

function settleDiscardClaimWindow(room: RoomState, claimWindow: ClaimWindow): RoomState {
  return settleHuClaims(
    room,
    claimWindow.discardedBySeatId,
    claimWindow.discardedByPlayerId,
    claimWindow.huClaims,
    "discardHu",
    "huClaimed",
    claimWindow.windowId,
  );
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
): RoomState {
  if (room.round === null) {
    return room;
  }

  const upgrader = room.round.players[claimWindow.upgradedBySeatId];
  const nextHand = removeFirstTile(upgrader.hand, claimWindow.tile);

  if (claimWindow.huClaims.length > 0) {
    const settledRoom = settleHuClaims(
      room,
      claimWindow.upgradedBySeatId,
      claimWindow.upgradedByPlayerId,
      claimWindow.huClaims,
      "qiangGangHu",
      "qiangGangHuClaimed",
      claimWindow.windowId,
    );
    const nextRound: RoundState = {
      ...room.round,
      currentPlayer: findNextActivePlayer(room.round, claimWindow.upgradedBySeatId),
      players: room.round.players.map((player) =>
        player.id === claimWindow.upgradedBySeatId ? { ...player, hand: nextHand } : player,
      ),
    };

    return finishRoundIfNeeded({
      ...settledRoom,
      phase: "draw",
      selfDrawEligible: false,
      round: nextRound,
      baGangClaimWindow: null,
      gangDraw: null,
      resolvedWindowIds: appendResolvedWindowId(room.resolvedWindowIds, claimWindow.windowId),
      eventLog: [
        ...room.eventLog,
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

  const nextPlayer = {
    ...upgrader,
    hand: nextHand,
    melds: upgrader.melds.map((meld, index) =>
      index === claimWindow.pengMeldIndex
        ? { ...peng, type: "baGang" as const, tiles: [...peng.tiles, claimWindow.tile] }
        : meld,
    ),
  };
  const nextRound: RoundState = {
    ...room.round,
    players: room.round.players.map((player) =>
      player.id === claimWindow.upgradedBySeatId ? nextPlayer : player,
    ),
  };

  return finishRoundIfNeeded({
    ...room,
    phase: "gangDraw",
    selfDrawEligible: false,
    round: nextRound,
    baGangClaimWindow: null,
    resolvedWindowIds: appendResolvedWindowId(room.resolvedWindowIds, claimWindow.windowId),
    gangDraw: {
      seatId: claimWindow.upgradedBySeatId,
      playerId: claimWindow.upgradedByPlayerId,
      gangType: "baGang",
      tile: claimWindow.targetTile,
    },
    eventLog: [
      ...room.eventLog,
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

function finishRoundIfNeeded(room: RoomState): RoomState {
  if (room.round === null) {
    return room;
  }

  const remainingPlayerIds = room.round.players.filter((player) => !player.hasWon).map((player) => player.id);
  const reason =
    remainingPlayerIds.length <= 1 ? "onePlayerLeft" : room.round.wall.length === 0 ? "wallEmpty" : null;

  if (room.roundEnd !== null) {
    if (room.roundEnd.reason === "wallEmpty" && room.chaJiao === null) {
      return settleRoundChickenPayments({ ...room, chaJiao: buildChaJiaoResult(room) });
    }

    return settleRoundChickenPayments(room);
  }

  if (reason === null) {
    return room;
  }

  const roundEnd: RoundEndState = { reason, remainingPlayerIds };

  return settleRoundChickenPayments({
    ...room,
    status: "ended",
    phase: "ended",
    selfDrawEligible: false,
    roundEnd,
    chaJiao: reason === "wallEmpty" ? buildChaJiaoResult(room) : null,
    claimWindow: null,
    baGangClaimWindow: null,
    gangDraw: null,
    eventLog: [...room.eventLog, { type: "roundEnded", ...roundEnd }],
  });
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

function buildChaJiaoResult(room: RoomState): ChaJiaoResult {
  if (room.round === null) {
    return { reason: "wallEmpty", players: [] };
  }

  const candidates = allTileCandidates();

  return {
    reason: "wallEmpty",
    players: room.round.players
      .filter((player) => !player.hasWon)
      .map((player) => {
        const possibleScores = candidates.flatMap((candidate) => {
          const result = checkDiscardHu(room.round!, player.id, candidate);

          return result.canHu ? [result.score.cappedPoints] : [];
        });

        return {
          seatId: player.id,
          playerId: room.seats[player.id]?.playerId ?? null,
          isListening: possibleScores.length > 0,
          maxHuPoints: possibleScores.length > 0 ? Math.max(...possibleScores) : null,
        };
      }),
  };
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

function replaceSeat(seats: SeatState[], seatId: PlayerId, nextSeat: SeatState): SeatState[] {
  return seats.map((seat) => (seat.seatId === seatId ? nextSeat : seat));
}
