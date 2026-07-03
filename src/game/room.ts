import {
  discardTile as discardRoundTile,
  drawTile as drawRoundTile,
  startRound,
  type DiscardTileResult,
  type DrawTileResult,
} from "./round.ts";
import { isYaoJi, sameTile } from "./tiles.ts";
import { checkDiscardHu } from "./win.ts";
import type { PlayerId, RoundState, ScorePattern, Suit, Tile } from "./types.ts";

const seatIds: PlayerId[] = [0, 1, 2, 3];

export type RoomStatus = "waiting" | "dingque";

export type ClaimWindow = {
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
  points: number;
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

export type RoomEvent =
  | { type: "roomCreated"; roomId: string }
  | { type: "playerJoined"; playerId: string; displayName: string }
  | { type: "seatTaken"; seatId: PlayerId; playerId: string }
  | { type: "readyChanged"; seatId: PlayerId; playerId: string; ready: boolean }
  | { type: "roundStarted"; seed: string; dealer: PlayerId }
  | { type: "missingSuitChosen"; seatId: PlayerId; playerId: string; suit: Suit }
  | { type: "tileDrawn"; seatId: PlayerId; playerId: string }
  | { type: "tileDiscarded"; seatId: PlayerId; playerId: string; tile: Tile }
  | { type: "claimWindowOpened"; discardedBySeatId: PlayerId; tile: Tile; pendingPlayerIds: PlayerId[] }
  | { type: "claimPassed"; seatId: PlayerId; playerId: string }
  | { type: "huClaimed"; seatId: PlayerId; playerId: string; tile: Tile; patterns: ScorePattern[]; points: number }
  | { type: "pengClaimed"; seatId: PlayerId; playerId: string; tile: Tile; usedTiles: Tile[] }
  | { type: "mingGangClaimed"; seatId: PlayerId; playerId: string; tile: Tile; usedTiles: Tile[] }
  | { type: "claimWindowClosed"; reason: "allPassed" | "timeout" | "claimed"; nextPlayer: PlayerId };

export type RoomState = {
  id: string;
  seed: string;
  status: RoomStatus;
  members: RoomMember[];
  seats: SeatState[];
  round: RoundState | null;
  claimWindow: ClaimWindow | null;
  eventLog: RoomEvent[];
};

export type VisiblePlayerState = {
  id: PlayerId;
  hand: Tile[] | null;
  handCount: number;
  discards: Tile[];
  melds: RoundState["players"][number]["melds"];
  hasWon: boolean;
  missingSuit: RoundState["players"][number]["missingSuit"];
};

export type ClientVisibleRoomState = {
  id: string;
  status: RoomStatus;
  localSeatId: PlayerId | null;
  seats: SeatState[];
  round:
    | null
    | {
        seed: string;
        dealer: PlayerId;
        currentPlayer: PlayerId;
        wallCount: number;
        players: VisiblePlayerState[];
      };
  claimWindow: ClaimWindow | null;
  eventLog: RoomEvent[];
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
        | "claimWindowOpen"
        | "notCurrentPlayer"
        | "notDrawPhase"
        | DrawTileResult["reason"];
    };

export type DiscardRoomTileResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
        | "missingSuitNotSet"
        | "claimWindowOpen"
        | "notCurrentPlayer"
        | "notDiscardPhase"
        | DiscardTileResult["reason"];
    };

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
        | "noClaimWindow"
        | "claimNotAllowed"
        | "claimAlreadyResponded"
        | "cannotHu";
    };

export type ClaimPengResult =
  | { ok: true; room: RoomState }
  | {
      ok: false;
      reason:
        | "roundNotStarted"
        | "playerNotSeated"
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
        | "noClaimWindow"
        | "claimNotAllowed"
        | "claimAlreadyResponded"
        | "cannotMingGang";
    };

export type ExpireClaimWindowResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "noClaimWindow" };

export function createRoom(input: CreateRoomInput): RoomState {
  return {
    id: input.id,
    seed: input.seed,
    status: "waiting",
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
      status: "dingque",
      round: startRound({ seed: room.seed, dealer }),
      claimWindow: null,
      eventLog: [...room.eventLog, { type: "roundStarted", seed: room.seed, dealer }],
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

  return {
    ok: true,
    room: {
      ...room,
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

  if (room.claimWindow !== null) {
    return { ok: false, reason: "claimWindowOpen" };
  }

  if (room.round.currentPlayer !== seat.seatId) {
    return { ok: false, reason: "notCurrentPlayer" };
  }

  const player = room.round.players[seat.seatId];

  if (player.hand.length % 3 !== 1) {
    return { ok: false, reason: "notDrawPhase" };
  }

  const result = drawRoundTile(room.round);

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  return {
    ok: true,
    room: {
      ...room,
      round: result.round,
      eventLog: [...room.eventLog, { type: "tileDrawn", seatId: seat.seatId, playerId }],
    },
  };
}

export function discardRoomTile(room: RoomState, playerId: string, tile: Tile): DiscardRoomTileResult {
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

  if (room.claimWindow !== null) {
    return { ok: false, reason: "claimWindowOpen" };
  }

  if (room.round.currentPlayer !== seat.seatId) {
    return { ok: false, reason: "notCurrentPlayer" };
  }

  const player = room.round.players[seat.seatId];

  if (player.hand.length % 3 !== 2) {
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
      round: result.round,
      claimWindow: createClaimWindow(result.round, seat.seatId, playerId, tile, result.nextPlayer),
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

  if (room.claimWindow === null) {
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
    room: allResponded ? closeClaimWindow(nextRoom, room.claimWindow, "allPassed") : nextRoom,
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

  if (room.claimWindow === null) {
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
    points: huCheck.score.cappedPoints,
  };
  const nextRound: RoundState = {
    ...room.round,
    players: room.round.players.map((player) =>
      player.id === seat.seatId ? { ...player, hasWon: true } : player,
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
        points: huClaim.points,
      },
    ],
  };

  return {
    ok: true,
    room: allResponded ? closeClaimWindow(nextRoom, room.claimWindow, "allPassed") : nextRoom,
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

function claimMeldFromDiscard(
  room: RoomState,
  playerId: string,
  options:
    | {
        meldType: "peng";
        tilesNeededFromHand: 2;
        eventType: "pengClaimed";
        cannotReason: "cannotPeng";
      }
    | {
        meldType: "mingGang";
        tilesNeededFromHand: 3;
        eventType: "mingGangClaimed";
        cannotReason: "cannotMingGang";
      },
): ClaimPengResult | ClaimMingGangResult {
  if (room.round === null) {
    return { ok: false, reason: "roundNotStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  if (room.claimWindow === null) {
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
  const nextRoom = {
    ...room,
    round: nextRound,
    claimWindow: null,
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

export function expireClaimWindow(room: RoomState): ExpireClaimWindowResult {
  if (room.claimWindow === null) {
    return { ok: false, reason: "noClaimWindow" };
  }

  return {
    ok: true,
    room: closeClaimWindow({ ...room, claimWindow: null }, room.claimWindow, "timeout"),
  };
}

export function toClientVisibleRoomState(room: RoomState, playerId: string): ClientVisibleRoomState {
  const localSeatId = room.seats.find((seat) => seat.playerId === playerId)?.seatId ?? null;

  return {
    id: room.id,
    status: room.status,
    localSeatId,
    seats: room.seats,
    round:
      room.round === null
        ? null
        : {
            seed: room.round.seed,
            dealer: room.round.dealer,
            currentPlayer: room.round.currentPlayer,
            wallCount: room.round.wall.length,
            players: room.round.players.map((player) => ({
              id: player.id,
              hand: player.id === localSeatId ? player.hand : null,
              handCount: player.hand.length,
              discards: player.discards,
              melds: player.melds,
              hasWon: player.hasWon,
              missingSuit: player.missingSuit,
            })),
          },
    claimWindow: room.claimWindow,
    eventLog: room.eventLog,
  };
}

function createClaimWindow(
  round: RoundState,
  discardedBySeatId: PlayerId,
  discardedByPlayerId: string,
  tile: Tile,
  nextPlayer: PlayerId,
): ClaimWindow {
  return {
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

function hasClaimResponse(claimWindow: ClaimWindow, seatId: PlayerId): boolean {
  return (
    claimWindow.passedPlayerIds.includes(seatId) ||
    claimWindow.huClaims.some((claim) => claim.seatId === seatId)
  );
}

function didAllClaimPlayersRespond(claimWindow: ClaimWindow): boolean {
  return claimWindow.pendingPlayerIds.every((seatId) => hasClaimResponse(claimWindow, seatId));
}

function chooseClaimMeldTiles(hand: Tile[], claimedTile: Tile, tilesNeededFromHand: 2 | 3): Tile[] | null {
  const sameTiles = hand.filter((tile) => sameTile(tile, claimedTile));
  const laiziTiles = hand.filter(isYaoJi);
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

function closeClaimWindow(
  room: RoomState,
  claimWindow: ClaimWindow,
  reason: "allPassed" | "timeout" | "claimed",
  nextPlayerOverride?: PlayerId,
): RoomState {
  const nextPlayer =
    nextPlayerOverride ??
    (room.round === null ? claimWindow.nextPlayer : findNextActivePlayer(room.round, claimWindow.discardedBySeatId));

  return {
    ...room,
    round: room.round === null ? null : { ...room.round, currentPlayer: nextPlayer },
    claimWindow: null,
    eventLog: [...room.eventLog, { type: "claimWindowClosed", reason, nextPlayer }],
  };
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
