import type { PlayerId, PlayerState, RoundState, Tile } from "./types.ts";
import { checkDiscardLegal, type DiscardCheckResult } from "./rules.ts";
import { createWall, sameTile } from "./tiles.ts";

const playerCount = 4;
const dealerHandSize = 14;
const nonDealerHandSize = 13;

export type StartRoundInput = {
  seed: string;
  dealer?: PlayerId;
};

export type DrawTileResult =
  | { ok: true; round: RoundState; tile: Tile }
  | { ok: false; reason: "wallEmpty" | "playerAlreadyWon" };

export type DiscardTileResult =
  | { ok: true; round: RoundState; nextPlayer: PlayerId }
  | {
      ok: false;
      reason: "notCurrentPlayer" | "playerAlreadyWon" | "missingSuitNotSet" | FailureReason<DiscardCheckResult>;
    };

type FailureReason<TResult> = TResult extends { legal: false; reason: infer TReason } ? TReason : never;

export function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  const shuffled = [...values];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function startRound(input: StartRoundInput): RoundState {
  const dealer = input.dealer ?? 0;
  const wall = seededShuffle(createWall(), input.seed);
  const players = createPlayers();

  let drawIndex = 0;

  for (let playerIndex = 0; playerIndex < playerCount; playerIndex += 1) {
    const handSize = playerIndex === dealer ? dealerHandSize : nonDealerHandSize;
    players[playerIndex].hand = wall.slice(drawIndex, drawIndex + handSize);
    drawIndex += handSize;
  }

  return {
    seed: input.seed,
    dealer,
    players,
    wall: wall.slice(drawIndex),
    currentPlayer: dealer,
  };
}

function createPlayers(): PlayerState[] {
  return Array.from({ length: playerCount }, (_, id) => ({
    id: id as PlayerId,
    hand: [],
    discards: [],
    melds: [],
    hasWon: false,
    claimedWinningTile: null,
    missingSuit: null,
  }));
}

export function drawTile(round: RoundState): DrawTileResult {
  const player = round.players[round.currentPlayer];

  if (player.hasWon) {
    return { ok: false, reason: "playerAlreadyWon" };
  }

  const [drawnTile, ...remainingWall] = round.wall;

  if (drawnTile === undefined) {
    return { ok: false, reason: "wallEmpty" };
  }

  const players = replacePlayer(round.players, round.currentPlayer, {
    ...player,
    hand: [...player.hand, drawnTile],
  });

  return {
    ok: true,
    tile: drawnTile,
    round: {
      ...round,
      players,
      wall: remainingWall,
    },
  };
}

export function discardTile(round: RoundState, playerId: PlayerId, discard: Tile): DiscardTileResult {
  if (playerId !== round.currentPlayer) {
    return { ok: false, reason: "notCurrentPlayer" };
  }

  const player = round.players[playerId];

  if (player.hasWon) {
    return { ok: false, reason: "playerAlreadyWon" };
  }

  if (player.missingSuit === null) {
    return { ok: false, reason: "missingSuitNotSet" };
  }

  const legalCheck = checkDiscardLegal({
    hand: player.hand,
    discard,
    missingSuit: player.missingSuit,
  });

  if (!legalCheck.legal) {
    return { ok: false, reason: legalCheck.reason };
  }

  const nextHand = removeFirstMatchingTile(player.hand, discard);
  const nextPlayer = findNextActivePlayer(round, playerId);
  const players = replacePlayer(round.players, playerId, {
    ...player,
    hand: nextHand,
    discards: [...player.discards, discard],
  });

  return {
    ok: true,
    nextPlayer,
    round: {
      ...round,
      players,
      currentPlayer: nextPlayer,
    },
  };
}

function findNextActivePlayer(round: RoundState, fromPlayer: PlayerId): PlayerId {
  for (let offset = 1; offset <= playerCount; offset += 1) {
    const candidate = ((fromPlayer + offset) % playerCount) as PlayerId;

    if (!round.players[candidate].hasWon) {
      return candidate;
    }
  }

  return fromPlayer;
}

function replacePlayer(players: PlayerState[], playerId: PlayerId, nextPlayer: PlayerState): PlayerState[] {
  return players.map((player) => (player.id === playerId ? nextPlayer : player));
}

function removeFirstMatchingTile(hand: Tile[], target: Tile): Tile[] {
  const index = hand.findIndex((value) => sameTile(value, target));

  if (index === -1) {
    return hand;
  }

  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
