import type { Suit, Tile } from "./types.ts";
import { isYaoJi, SUITS } from "./tiles.ts";

export type HuCheckReason = "invalidTileCount" | "invalidMeldCount" | "tooManyCopies" | "cannotDecompose";

export type HuCheckInput = {
  hand: Tile[];
  fixedMeldCount?: number;
};

export type HuCheckResult = {
  canHu: boolean;
  laiziCount: number;
  reason?: HuCheckReason;
};

const tilesPerMeld = 3;
const tilesPerPair = 2;
const standardMeldCount = 4;
const suitSize = 9;

export function canHuWithLaizi(input: HuCheckInput | Tile[]): HuCheckResult {
  const hand = Array.isArray(input) ? input : input.hand;
  const fixedMeldCount = Array.isArray(input) ? 0 : (input.fixedMeldCount ?? 0);
  const laiziCount = hand.filter(isYaoJi).length;

  if (fixedMeldCount < 0 || fixedMeldCount > standardMeldCount) {
    return { canHu: false, laiziCount, reason: "invalidMeldCount" };
  }

  const meldsNeeded = standardMeldCount - fixedMeldCount;
  const expectedTileCount = meldsNeeded * tilesPerMeld + tilesPerPair;

  if (hand.length !== expectedTileCount) {
    return { canHu: false, laiziCount, reason: "invalidTileCount" };
  }

  const countResult = countOrdinaryTiles(hand);

  if (!countResult.valid) {
    return { canHu: false, laiziCount, reason: "tooManyCopies" };
  }

  if (canChoosePairAndFormMelds(countResult.counts, countResult.laiziCount, meldsNeeded)) {
    return { canHu: true, laiziCount };
  }

  return { canHu: false, laiziCount, reason: "cannotDecompose" };
}

type CountOrdinaryTilesResult =
  | { valid: true; counts: number[]; laiziCount: number }
  | { valid: false };

function countOrdinaryTiles(hand: Tile[]): CountOrdinaryTilesResult {
  const counts = Array.from({ length: SUITS.length * suitSize }, () => 0);
  let laiziCount = 0;

  for (const value of hand) {
    if (isYaoJi(value)) {
      laiziCount += 1;
      continue;
    }

    const index = tileIndex(value);
    counts[index] += 1;

    if (counts[index] > 4) {
      return { valid: false };
    }
  }

  return { valid: true, counts, laiziCount };
}

function canChoosePairAndFormMelds(counts: number[], laiziCount: number, meldsNeeded: number): boolean {
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] >= 2) {
      const nextCounts = [...counts];
      nextCounts[index] -= 2;

      if (canFormMelds(nextCounts, laiziCount, meldsNeeded, new Map())) {
        return true;
      }
    }

    if (counts[index] >= 1 && laiziCount >= 1) {
      const nextCounts = [...counts];
      nextCounts[index] -= 1;

      if (canFormMelds(nextCounts, laiziCount - 1, meldsNeeded, new Map())) {
        return true;
      }
    }
  }

  if (laiziCount >= 2) {
    return canFormMelds([...counts], laiziCount - 2, meldsNeeded, new Map());
  }

  return false;
}

function canFormMelds(
  counts: number[],
  laiziCount: number,
  meldsRemaining: number,
  memo: Map<string, boolean>,
): boolean {
  const ordinaryTileCount = counts.reduce((sum, count) => sum + count, 0);

  if (ordinaryTileCount + laiziCount !== meldsRemaining * tilesPerMeld) {
    return false;
  }

  if (ordinaryTileCount === 0) {
    return laiziCount === meldsRemaining * tilesPerMeld;
  }

  if (meldsRemaining === 0) {
    return false;
  }

  const memoKey = `${counts.join(",")}|${laiziCount}|${meldsRemaining}`;
  const cached = memo.get(memoKey);

  if (cached !== undefined) {
    return cached;
  }

  const firstIndex = counts.findIndex((count) => count > 0);
  const canForm =
    tryTriplet(counts, firstIndex, laiziCount, meldsRemaining, memo) ||
    trySequence(counts, firstIndex, laiziCount, meldsRemaining, memo);

  memo.set(memoKey, canForm);
  return canForm;
}

function tryTriplet(
  counts: number[],
  index: number,
  laiziCount: number,
  meldsRemaining: number,
  memo: Map<string, boolean>,
): boolean {
  const ordinaryUsed = Math.min(counts[index], tilesPerMeld);
  const laiziNeeded = tilesPerMeld - ordinaryUsed;

  if (laiziNeeded > laiziCount) {
    return false;
  }

  const nextCounts = [...counts];
  nextCounts[index] -= ordinaryUsed;

  return canFormMelds(nextCounts, laiziCount - laiziNeeded, meldsRemaining - 1, memo);
}

function trySequence(
  counts: number[],
  index: number,
  laiziCount: number,
  meldsRemaining: number,
  memo: Map<string, boolean>,
): boolean {
  const rankIndex = index % suitSize;

  if (rankIndex > 6) {
    return false;
  }

  const sequenceIndexes = [index, index + 1, index + 2];
  const laiziNeeded = sequenceIndexes.filter((sequenceIndex) => counts[sequenceIndex] === 0).length;

  if (laiziNeeded > laiziCount) {
    return false;
  }

  const nextCounts = [...counts];

  for (const sequenceIndex of sequenceIndexes) {
    if (nextCounts[sequenceIndex] > 0) {
      nextCounts[sequenceIndex] -= 1;
    }
  }

  return canFormMelds(nextCounts, laiziCount - laiziNeeded, meldsRemaining - 1, memo);
}

function tileIndex(value: Tile): number {
  return suitIndex(value.suit) * suitSize + value.rank - 1;
}

function suitIndex(suit: Suit): number {
  return SUITS.indexOf(suit);
}

