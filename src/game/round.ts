import type { PlayerId, PlayerState, RoundState, Tile } from "./types.ts";
import { createWall } from "./tiles.ts";

const playerCount = 4;
const dealerHandSize = 14;
const nonDealerHandSize = 13;

export type StartRoundInput = {
  seed: string;
  dealer?: PlayerId;
};

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
    hasWon: false,
  }));
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

