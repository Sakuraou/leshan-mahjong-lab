import type { Rank, Suit, Tile } from "./types.ts";
import { isYaoJi, SUITS } from "./tiles.ts";

export type HuCheckReason = "invalidTileCount" | "invalidMeldCount" | "tooManyCopies" | "cannotDecompose";

export type HuCheckInput = {
  hand: Tile[];
  fixedMeldCount?: number;
};

export type HuExplainInput = HuCheckInput & {
  explain: true;
};

export type HuResolvedTile = {
  source: Tile;
  target: Tile;
  usedAsLaizi: boolean;
};

export type HuPairGroup = {
  type: "pair";
  tiles: HuResolvedTile[];
};

export type HuMeldGroup = {
  type: "triplet" | "sequence";
  tiles: HuResolvedTile[];
};

export type StandardHuDecomposition = {
  fixedMeldCount: number;
  pair: HuPairGroup;
  melds: HuMeldGroup[];
};

export type HuCheckResult = {
  canHu: boolean;
  laiziCount: number;
  reason?: HuCheckReason;
};

export type HuExplainResult =
  | {
      canHu: true;
      laiziCount: number;
      decomposition: StandardHuDecomposition;
    }
  | {
      canHu: false;
      laiziCount: number;
      reason: HuCheckReason;
    };

const tilesPerMeld = 3;
const tilesPerPair = 2;
const standardMeldCount = 4;
const suitSize = 9;

type PairPlan = {
  type: "pair";
  targetIndexes: [number, number];
  laiziMask: [boolean, boolean];
};

type MeldPlan = {
  type: "triplet" | "sequence";
  targetIndexes: [number, number, number];
  laiziMask: [boolean, boolean, boolean];
};

type DecompositionPlan = {
  pair: PairPlan;
  melds: MeldPlan[];
};

type MeldMemo = Map<string, MeldPlan[] | null>;

export function canHuWithLaizi(input: HuExplainInput): HuExplainResult;
export function canHuWithLaizi(input: HuCheckInput | Tile[]): HuCheckResult;
export function canHuWithLaizi(
  input: HuExplainInput | HuCheckInput | Tile[],
): HuExplainResult | HuCheckResult {
  const hand = Array.isArray(input) ? input : input.hand;
  const fixedMeldCount = Array.isArray(input) ? 0 : (input.fixedMeldCount ?? 0);
  const explain = !Array.isArray(input) && "explain" in input && input.explain;
  const laiziCount = hand.filter(isYaoJi).length;

  if (!Number.isInteger(fixedMeldCount) || fixedMeldCount < 0 || fixedMeldCount > standardMeldCount) {
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

  const plan = choosePairAndFormMelds(countResult.counts, countResult.laiziCount, meldsNeeded);

  if (plan === null) {
    return { canHu: false, laiziCount, reason: "cannotDecompose" };
  }

  if (!explain) {
    return { canHu: true, laiziCount };
  }

  return {
    canHu: true,
    laiziCount,
    decomposition: materializeDecomposition(plan, hand.filter(isYaoJi), fixedMeldCount),
  };
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

function choosePairAndFormMelds(
  counts: number[],
  laiziCount: number,
  meldsNeeded: number,
): DecompositionPlan | null {
  const canonicalTargetIndex = counts.findIndex((count) => count > 0);
  const fallbackTargetIndex = canonicalTargetIndex === -1 ? 0 : canonicalTargetIndex;

  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] >= 2) {
      const nextCounts = [...counts];
      nextCounts[index] -= 2;
      const melds = formMelds(nextCounts, laiziCount, meldsNeeded, fallbackTargetIndex, new Map());

      if (melds !== null) {
        return {
          pair: { type: "pair", targetIndexes: [index, index], laiziMask: [false, false] },
          melds,
        };
      }
    }

    if (counts[index] >= 1 && laiziCount >= 1) {
      const nextCounts = [...counts];
      nextCounts[index] -= 1;
      const melds = formMelds(nextCounts, laiziCount - 1, meldsNeeded, fallbackTargetIndex, new Map());

      if (melds !== null) {
        return {
          pair: { type: "pair", targetIndexes: [index, index], laiziMask: [false, true] },
          melds,
        };
      }
    }
  }

  if (laiziCount >= 2) {
    const melds = formMelds([...counts], laiziCount - 2, meldsNeeded, fallbackTargetIndex, new Map());

    if (melds !== null) {
      return {
        pair: {
          type: "pair",
          targetIndexes: [fallbackTargetIndex, fallbackTargetIndex],
          laiziMask: [true, true],
        },
        melds,
      };
    }
  }

  return null;
}

function formMelds(
  counts: number[],
  laiziCount: number,
  meldsRemaining: number,
  fallbackTargetIndex: number,
  memo: MeldMemo,
): MeldPlan[] | null {
  const ordinaryTileCount = counts.reduce((sum, count) => sum + count, 0);

  if (ordinaryTileCount + laiziCount !== meldsRemaining * tilesPerMeld) {
    return null;
  }

  if (meldsRemaining === 0) {
    return ordinaryTileCount === 0 && laiziCount === 0 ? [] : null;
  }

  if (ordinaryTileCount === 0) {
    return Array.from({ length: meldsRemaining }, () => ({
      type: "triplet" as const,
      targetIndexes: [fallbackTargetIndex, fallbackTargetIndex, fallbackTargetIndex],
      laiziMask: [true, true, true],
    }));
  }

  const memoKey = `${counts.join(",")}|${laiziCount}|${meldsRemaining}`;

  if (memo.has(memoKey)) {
    return memo.get(memoKey) ?? null;
  }

  const firstIndex = counts.findIndex((count) => count > 0);
  const tripletResult = tryTriplets(
    counts,
    firstIndex,
    laiziCount,
    meldsRemaining,
    fallbackTargetIndex,
    memo,
  );

  if (tripletResult !== null) {
    memo.set(memoKey, tripletResult);
    return tripletResult;
  }

  const sequenceResult = trySequences(
    counts,
    firstIndex,
    laiziCount,
    meldsRemaining,
    fallbackTargetIndex,
    memo,
  );

  memo.set(memoKey, sequenceResult);
  return sequenceResult;
}

function tryTriplets(
  counts: number[],
  index: number,
  laiziCount: number,
  meldsRemaining: number,
  fallbackTargetIndex: number,
  memo: MeldMemo,
): MeldPlan[] | null {
  const maximumNaturalUsed = Math.min(counts[index], tilesPerMeld);

  for (let naturalUsed = maximumNaturalUsed; naturalUsed >= 1; naturalUsed -= 1) {
    const laiziNeeded = tilesPerMeld - naturalUsed;

    if (laiziNeeded > laiziCount) {
      continue;
    }

    const nextCounts = [...counts];
    nextCounts[index] -= naturalUsed;
    const remaining = formMelds(
      nextCounts,
      laiziCount - laiziNeeded,
      meldsRemaining - 1,
      fallbackTargetIndex,
      memo,
    );

    if (remaining !== null) {
      return [
        {
          type: "triplet",
          targetIndexes: [index, index, index],
          laiziMask: [false, naturalUsed < 2, naturalUsed < 3],
        },
        ...remaining,
      ];
    }
  }

  return null;
}

function trySequences(
  counts: number[],
  index: number,
  laiziCount: number,
  meldsRemaining: number,
  fallbackTargetIndex: number,
  memo: MeldMemo,
): MeldPlan[] | null {
  const rankIndex = index % suitSize;
  const suitStartIndex = index - rankIndex;

  for (let offset = 0; offset <= 2; offset += 1) {
    const startRankIndex = rankIndex - offset;

    if (startRankIndex < 0 || startRankIndex > 6) {
      continue;
    }

    const targetIndexes: [number, number, number] = [
      suitStartIndex + startRankIndex,
      suitStartIndex + startRankIndex + 1,
      suitStartIndex + startRankIndex + 2,
    ];

    for (const laiziMask of sequenceLaiziMasks(counts, targetIndexes, index)) {
      const laiziNeeded = laiziMask.filter(Boolean).length;

      if (laiziNeeded > laiziCount) {
        continue;
      }

      const nextCounts = [...counts];

      targetIndexes.forEach((targetIndex, position) => {
        if (!laiziMask[position]) {
          nextCounts[targetIndex] -= 1;
        }
      });

      const remaining = formMelds(
        nextCounts,
        laiziCount - laiziNeeded,
        meldsRemaining - 1,
        fallbackTargetIndex,
        memo,
      );

      if (remaining !== null) {
        return [{ type: "sequence", targetIndexes, laiziMask }, ...remaining];
      }
    }
  }

  return null;
}

function sequenceLaiziMasks(
  counts: number[],
  targetIndexes: [number, number, number],
  anchorIndex: number,
): Array<[boolean, boolean, boolean]> {
  let masks: Array<[boolean, boolean, boolean]> = [[false, false, false]];

  targetIndexes.forEach((targetIndex, position) => {
    if (targetIndex === anchorIndex) {
      return;
    }

    if (counts[targetIndex] === 0) {
      masks = masks.map((mask) => replaceMaskValue(mask, position, true));
      return;
    }

    masks = masks.flatMap((mask) => [mask, replaceMaskValue(mask, position, true)]);
  });

  return masks;
}

function replaceMaskValue(
  mask: [boolean, boolean, boolean],
  position: number,
  value: boolean,
): [boolean, boolean, boolean] {
  const nextMask: [boolean, boolean, boolean] = [...mask];
  nextMask[position] = value;
  return nextMask;
}

function materializeDecomposition(
  plan: DecompositionPlan,
  laiziSources: Tile[],
  fixedMeldCount: number,
): StandardHuDecomposition {
  let laiziIndex = 0;

  const resolveGroup = (group: PairPlan | MeldPlan): HuResolvedTile[] =>
    group.targetIndexes.map((targetIndex, index) => {
      const target = indexTile(targetIndex);

      if (!group.laiziMask[index]) {
        return { source: target, target, usedAsLaizi: false };
      }

      const source = laiziSources[laiziIndex];
      laiziIndex += 1;
      return { source, target, usedAsLaizi: true };
    });

  return {
    fixedMeldCount,
    pair: { type: "pair", tiles: resolveGroup(plan.pair) },
    melds: plan.melds.map((meld) => ({ type: meld.type, tiles: resolveGroup(meld) })),
  };
}

function tileIndex(value: Tile): number {
  return suitIndex(value.suit) * suitSize + value.rank - 1;
}

function indexTile(index: number): Tile {
  return {
    suit: SUITS[Math.floor(index / suitSize)],
    rank: ((index % suitSize) + 1) as Rank,
  };
}

function suitIndex(suit: Suit): number {
  return SUITS.indexOf(suit);
}
