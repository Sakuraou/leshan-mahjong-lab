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

export type SevenPairsDecomposition = {
  fixedMeldCount: 0;
  pairs: HuPairGroup[];
  dragonCount: 0 | 1 | 2 | 3;
};

export type HuDecomposition = StandardHuDecomposition | SevenPairsDecomposition;

export type HuCheckResult = {
  canHu: boolean;
  laiziCount: number;
  reason?: HuCheckReason;
};

export type HuExplainResult =
  | {
      canHu: true;
      laiziCount: number;
      decomposition: HuDecomposition;
    }
  | {
      canHu: false;
      laiziCount: number;
      reason: HuCheckReason;
    };

export type FindHuDecompositionsInput = HuCheckInput & {
  limit?: number;
};

export type HuDecompositionCandidate = {
  signature: string;
  decomposition: HuDecomposition;
};

export type FindHuDecompositionsResult =
  | {
      canHu: true;
      laiziCount: number;
      candidates: HuDecompositionCandidate[];
      truncated: boolean;
      exploredNodes: number;
    }
  | {
      canHu: false;
      laiziCount: number;
      candidates: [];
      truncated: boolean;
      exploredNodes: number;
      reason: HuCheckReason;
    };

const tilesPerMeld = 3;
const tilesPerPair = 2;
const standardMeldCount = 4;
const suitSize = 9;

export const MAX_HU_DECOMPOSITIONS = 128;
export const MAX_HU_SEARCH_NODES = 20_000;
export const MAX_SEVEN_PAIRS_DECOMPOSITIONS = 128;

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

type SevenPairsPlan = {
  pairTargetIndexes: number[];
};

type SevenPairsPlanSearch = {
  plans: SevenPairsPlan[];
  exploredNodes: number;
  truncated: boolean;
};

type MeldMemo = Map<string, MeldPlan[] | null>;

type MultiMeldMemo = Map<string, MeldPlan[][]>;

type MultiSearchContext = {
  candidateLimit: number;
  nodeLimit: number;
  exploredNodes: number;
  truncated: boolean;
  pureLaiziTargetIndexes: number[];
  memo: MultiMeldMemo;
};

const maxSevenPairsSearchNodes = 5_000;

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
    const sevenPairs = findSevenPairsDecompositions({ hand, fixedMeldCount });

    if (!sevenPairs.canHu) {
      return { canHu: false, laiziCount, reason: "cannotDecompose" };
    }

    if (!explain) {
      return { canHu: true, laiziCount };
    }

    return {
      canHu: true,
      laiziCount,
      decomposition: sevenPairs.candidates[0].decomposition,
    };
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

export function findHuDecompositions(input: FindHuDecompositionsInput): FindHuDecompositionsResult {
  const hand = input.hand;
  const fixedMeldCount = input.fixedMeldCount ?? 0;
  const laiziCount = hand.filter(isYaoJi).length;

  if (!Number.isInteger(fixedMeldCount) || fixedMeldCount < 0 || fixedMeldCount > standardMeldCount) {
    return emptyDecompositionSearch(laiziCount, "invalidMeldCount");
  }

  const meldsNeeded = standardMeldCount - fixedMeldCount;
  const expectedTileCount = meldsNeeded * tilesPerMeld + tilesPerPair;

  if (hand.length !== expectedTileCount) {
    return emptyDecompositionSearch(laiziCount, "invalidTileCount");
  }

  const countResult = countOrdinaryTiles(hand);

  if (!countResult.valid) {
    return emptyDecompositionSearch(laiziCount, "tooManyCopies");
  }

  const firstPlan = choosePairAndFormMelds(countResult.counts, countResult.laiziCount, meldsNeeded);

  if (firstPlan === null) {
    return emptyDecompositionSearch(laiziCount, "cannotDecompose");
  }

  const requestedLimit = input.limit === undefined
    ? MAX_HU_DECOMPOSITIONS
    : Number.isFinite(input.limit)
      ? Math.floor(input.limit)
      : 1;
  const resultLimit = Math.min(Math.max(requestedLimit, 1), MAX_HU_DECOMPOSITIONS);
  const context: MultiSearchContext = {
    candidateLimit: resultLimit + 1,
    nodeLimit: MAX_HU_SEARCH_NODES,
    exploredNodes: 0,
    truncated: false,
    pureLaiziTargetIndexes: pureLaiziTargetIndexes(countResult.counts),
    memo: new Map(),
  };
  const plans = findPairAndMeldPlans(
    countResult.counts,
    countResult.laiziCount,
    meldsNeeded,
    context,
  );
  const laiziSources = hand.filter(isYaoJi);
  const candidatesBySignature = new Map<string, HuDecompositionCandidate>();

  for (const plan of [firstPlan, ...plans]) {
    const decomposition = materializeDecomposition(plan, laiziSources, fixedMeldCount);
    const signature = huDecompositionSignature(decomposition);

    if (!candidatesBySignature.has(signature)) {
      candidatesBySignature.set(signature, { signature, decomposition });
    }
  }

  const allCandidates = [...candidatesBySignature.values()].sort((left, right) =>
    compareAscii(left.signature, right.signature),
  );
  const truncated = context.truncated || allCandidates.length > resultLimit;

  return {
    canHu: true,
    laiziCount,
    candidates: allCandidates.slice(0, resultLimit),
    truncated,
    exploredNodes: context.exploredNodes,
  };
}

export function findSevenPairsDecompositions(
  input: FindHuDecompositionsInput,
): FindHuDecompositionsResult {
  const hand = input.hand;
  const fixedMeldCount = input.fixedMeldCount ?? 0;
  const laiziCount = hand.filter(isYaoJi).length;

  if (!Number.isInteger(fixedMeldCount) || fixedMeldCount < 0 || fixedMeldCount > standardMeldCount) {
    return emptyDecompositionSearch(laiziCount, "invalidMeldCount");
  }

  if (fixedMeldCount !== 0) {
    return emptyDecompositionSearch(laiziCount, "cannotDecompose");
  }

  if (hand.length !== 14) {
    return emptyDecompositionSearch(laiziCount, "invalidTileCount");
  }

  const countResult = countOrdinaryTiles(hand);

  if (!countResult.valid) {
    return emptyDecompositionSearch(laiziCount, "tooManyCopies");
  }

  const search = findSevenPairsPlans(countResult.counts, countResult.laiziCount);

  if (search.plans.length === 0) {
    return {
      ...emptyDecompositionSearch(laiziCount, "cannotDecompose"),
      exploredNodes: search.exploredNodes,
      truncated: search.truncated,
    };
  }

  const requestedLimit = input.limit === undefined
    ? MAX_SEVEN_PAIRS_DECOMPOSITIONS
    : Number.isFinite(input.limit)
      ? Math.floor(input.limit)
      : 1;
  const resultLimit = Math.min(
    Math.max(requestedLimit, 1),
    MAX_SEVEN_PAIRS_DECOMPOSITIONS,
  );
  const candidatesBySignature = new Map<string, HuDecompositionCandidate>();

  for (const plan of search.plans) {
    const decomposition = materializeSevenPairsDecomposition(plan, hand);
    const signature = huDecompositionSignature(decomposition);
    candidatesBySignature.set(signature, { signature, decomposition });
  }

  const candidates = [...candidatesBySignature.values()].sort(compareSevenPairsCandidates);

  return {
    canHu: true,
    laiziCount,
    candidates: candidates.slice(0, resultLimit),
    truncated: search.truncated || candidates.length > resultLimit,
    exploredNodes: search.exploredNodes,
  };
}

export function findAllHuDecompositions(
  input: FindHuDecompositionsInput,
): FindHuDecompositionsResult {
  const standard = findHuDecompositions(input);
  const sevenPairs = findSevenPairsDecompositions(input);
  const candidates = [
    ...(standard.canHu ? standard.candidates : []),
    ...(sevenPairs.canHu ? sevenPairs.candidates : []),
  ].sort((left, right) => compareAscii(left.signature, right.signature));

  if (candidates.length === 0) {
    const reason = !standard.canHu && standard.reason !== "cannotDecompose"
      ? standard.reason
      : !sevenPairs.canHu && sevenPairs.reason !== "cannotDecompose"
        ? sevenPairs.reason
        : "cannotDecompose";

    return {
      canHu: false,
      laiziCount: standard.laiziCount,
      candidates: [],
      truncated: standard.truncated || sevenPairs.truncated,
      exploredNodes: standard.exploredNodes + sevenPairs.exploredNodes,
      reason,
    };
  }

  return {
    canHu: true,
    laiziCount: standard.laiziCount,
    candidates,
    truncated: standard.truncated || sevenPairs.truncated,
    exploredNodes: standard.exploredNodes + sevenPairs.exploredNodes,
  };
}

export function isSevenPairsDecomposition(
  decomposition: HuDecomposition,
): decomposition is SevenPairsDecomposition {
  return "pairs" in decomposition;
}

export function huDecompositionSignature(decomposition: HuDecomposition): string {
  if (isSevenPairsDecomposition(decomposition)) {
    const pairSignatures = decomposition.pairs
      .map((pair) => tileSignature(pair.tiles[0].target))
      .sort();

    return `v2|d:${decomposition.dragonCount}|p:${pairSignatures.join(",")}`;
  }

  const pairTarget = decomposition.pair.tiles[0]?.target;
  const pairSignature = pairTarget === undefined ? "none" : tileSignature(pairTarget);
  const meldSignatures = decomposition.melds
    .map((meld) => {
      const targets = meld.tiles.map((value) => value.target);
      const target = meld.type === "sequence"
        ? [...targets].sort((left, right) => left.rank - right.rank)[0]
        : targets[0];
      return `${meld.type === "sequence" ? "s" : "t"}:${tileSignature(target)}`;
    })
    .sort();

  return `v1|f:${decomposition.fixedMeldCount}|p:${pairSignature}|m:${meldSignatures.join(",")}`;
}

type CountOrdinaryTilesResult =
  | { valid: true; counts: number[]; laiziCount: number }
  | { valid: false };

function countOrdinaryTiles(hand: Tile[]): CountOrdinaryTilesResult {
  const counts = Array.from({ length: SUITS.length * suitSize }, () => 0);
  const physicalCounts = new Map<string, number>();
  let laiziCount = 0;

  for (const value of hand) {
    const physicalKey = tileSignature(value);
    const physicalCount = (physicalCounts.get(physicalKey) ?? 0) + 1;

    if (physicalCount > 4) {
      return { valid: false };
    }

    physicalCounts.set(physicalKey, physicalCount);

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

function findPairAndMeldPlans(
  counts: number[],
  laiziCount: number,
  meldsNeeded: number,
  context: MultiSearchContext,
): DecompositionPlan[] {
  const plans = new Map<string, DecompositionPlan>();
  const canonicalTargetIndex = counts.findIndex((count) => count > 0);
  const fallbackTargetIndex = canonicalTargetIndex === -1 ? 0 : canonicalTargetIndex;

  const addPlans = (pair: PairPlan, nextCounts: number[], remainingLaizi: number): boolean => {
    const meldPlans = collectMeldPlans(
      nextCounts,
      remainingLaizi,
      meldsNeeded,
      fallbackTargetIndex,
      context,
    );

    for (const melds of meldPlans) {
      const plan = { pair, melds };
      const signature = decompositionPlanSignature(plan);

      if (!plans.has(signature)) {
        plans.set(signature, plan);

        if (plans.size >= context.candidateLimit) {
          context.truncated = true;
          return false;
        }
      }
    }

    return true;
  };

  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] >= 2) {
      const nextCounts = [...counts];
      nextCounts[index] -= 2;

      if (!addPlans(
        { type: "pair", targetIndexes: [index, index], laiziMask: [false, false] },
        nextCounts,
        laiziCount,
      )) {
        break;
      }
    }

    if (counts[index] >= 1 && laiziCount >= 1) {
      const nextCounts = [...counts];
      nextCounts[index] -= 1;

      if (!addPlans(
        { type: "pair", targetIndexes: [index, index], laiziMask: [false, true] },
        nextCounts,
        laiziCount - 1,
      )) {
        break;
      }
    }
  }

  if (plans.size < context.candidateLimit && laiziCount >= 2) {
    for (const targetIndex of context.pureLaiziTargetIndexes) {
      if (!addPlans(
        {
          type: "pair",
          targetIndexes: [targetIndex, targetIndex],
          laiziMask: [true, true],
        },
        [...counts],
        laiziCount - 2,
      )) {
        break;
      }
    }
  }

  return [...plans.values()];
}

function collectMeldPlans(
  counts: number[],
  laiziCount: number,
  meldsRemaining: number,
  fallbackTargetIndex: number,
  context: MultiSearchContext,
): MeldPlan[][] {
  const ordinaryTileCount = counts.reduce((sum, count) => sum + count, 0);

  if (ordinaryTileCount + laiziCount !== meldsRemaining * tilesPerMeld) {
    return [];
  }

  if (meldsRemaining === 0) {
    return ordinaryTileCount === 0 && laiziCount === 0 ? [[]] : [];
  }

  if (ordinaryTileCount === 0) {
    return pureLaiziMeldPlans(
      meldsRemaining,
      context.pureLaiziTargetIndexes.includes(fallbackTargetIndex)
        ? context.pureLaiziTargetIndexes
        : [fallbackTargetIndex, ...context.pureLaiziTargetIndexes],
      context,
    );
  }

  const memoKey = `${counts.join(",")}|${laiziCount}|${meldsRemaining}`;
  const cached = context.memo.get(memoKey);

  if (cached !== undefined) {
    return cached;
  }

  if (context.exploredNodes >= context.nodeLimit) {
    context.truncated = true;
    return [];
  }

  context.exploredNodes += 1;
  const firstIndex = counts.findIndex((count) => count > 0);
  const results = new Map<string, MeldPlan[]>();

  const addResult = (meld: MeldPlan, remaining: MeldPlan[]): boolean => {
    const candidate = [meld, ...remaining];
    const signature = meldPlanListSignature(candidate);

    if (!results.has(signature)) {
      results.set(signature, candidate);

      if (results.size >= context.candidateLimit) {
        context.truncated = true;
        return false;
      }
    }

    return true;
  };

  const maximumNaturalUsed = Math.min(counts[firstIndex], tilesPerMeld);

  tripletLoop:
  for (let naturalUsed = maximumNaturalUsed; naturalUsed >= 1; naturalUsed -= 1) {
    const laiziNeeded = tilesPerMeld - naturalUsed;

    if (laiziNeeded > laiziCount) {
      continue;
    }

    const nextCounts = [...counts];
    nextCounts[firstIndex] -= naturalUsed;
    const remainingPlans = collectMeldPlans(
      nextCounts,
      laiziCount - laiziNeeded,
      meldsRemaining - 1,
      fallbackTargetIndex,
      context,
    );
    const triplet: MeldPlan = {
      type: "triplet",
      targetIndexes: [firstIndex, firstIndex, firstIndex],
      laiziMask: [false, naturalUsed < 2, naturalUsed < 3],
    };

    for (const remaining of remainingPlans) {
      if (!addResult(triplet, remaining)) {
        break tripletLoop;
      }
    }
  }

  if (results.size < context.candidateLimit) {
    const rankIndex = firstIndex % suitSize;
    const suitStartIndex = firstIndex - rankIndex;

    sequenceLoop:
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

      for (const laiziMask of sequenceLaiziMasks(counts, targetIndexes, firstIndex)) {
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

        const remainingPlans = collectMeldPlans(
          nextCounts,
          laiziCount - laiziNeeded,
          meldsRemaining - 1,
          fallbackTargetIndex,
          context,
        );
        const sequence: MeldPlan = { type: "sequence", targetIndexes, laiziMask };

        for (const remaining of remainingPlans) {
          if (!addResult(sequence, remaining)) {
            break sequenceLoop;
          }
        }
      }
    }
  }

  const collected = [...results.values()];
  context.memo.set(memoKey, collected);
  return collected;
}

function decompositionPlanSignature(plan: DecompositionPlan): string {
  return `p:${plan.pair.targetIndexes[0]}|m:${meldPlanListSignature(plan.melds)}`;
}

function meldPlanListSignature(melds: MeldPlan[]): string {
  return melds
    .map((meld) => `${meld.type === "sequence" ? "s" : "t"}:${meld.targetIndexes.join("-")}`)
    .sort()
    .join(",");
}

function pureLaiziTargetIndexes(counts: number[]): number[] {
  const targets = new Set<number>([0, suitSize, suitSize * 2]);

  counts.forEach((count, index) => {
    if (count > 0) {
      targets.add(index);
    }
  });

  return [...targets].sort((left, right) => left - right);
}

function pureLaiziMeldPlans(
  meldsRemaining: number,
  targetIndexes: number[],
  context: MultiSearchContext,
): MeldPlan[][] {
  const results: MeldPlan[][] = [];

  const visit = (startIndex: number, selected: number[]): void => {
    if (results.length >= context.candidateLimit) {
      context.truncated = true;
      return;
    }

    if (selected.length === meldsRemaining) {
      results.push(selected.map((targetIndex) => ({
        type: "triplet" as const,
        targetIndexes: [targetIndex, targetIndex, targetIndex],
        laiziMask: [true, true, true],
      })));
      return;
    }

    for (let index = startIndex; index < targetIndexes.length; index += 1) {
      visit(index, [...selected, targetIndexes[index]]);

      if (results.length >= context.candidateLimit) {
        return;
      }
    }
  };

  visit(0, []);
  return results;
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

function findSevenPairsPlans(counts: number[], laiziCount: number): SevenPairsPlanSearch {
  const forcedTargets: number[] = [];
  let remainingLaizi = laiziCount;

  counts.forEach((count, targetIndex) => {
    for (let pairIndex = 0; pairIndex < Math.floor(count / 2); pairIndex += 1) {
      forcedTargets.push(targetIndex);
    }

    if (count % 2 === 1) {
      forcedTargets.push(targetIndex);
      remainingLaizi -= 1;
    }
  });

  if (remainingLaizi < 0 || remainingLaizi % 2 !== 0) {
    return { plans: [], exploredNodes: 0, truncated: false };
  }

  const freePairCount = remainingLaizi / 2;

  if (forcedTargets.length + freePairCount !== 7) {
    return { plans: [], exploredNodes: 0, truncated: false };
  }

  const availableTargets = new Set<number>([0, suitSize, suitSize * 2]);
  counts.forEach((count, targetIndex) => {
    if (count > 0) {
      availableTargets.add(targetIndex);
    }
  });
  const targetIndexes = [...availableTargets].sort((left, right) => left - right);
  const plans = new Map<string, SevenPairsPlan>();
  let exploredNodes = 0;
  let truncated = false;

  const visit = (startIndex: number, selected: number[]): void => {
    if (exploredNodes >= maxSevenPairsSearchNodes) {
      truncated = true;
      return;
    }

    exploredNodes += 1;

    if (selected.length === freePairCount) {
      const pairTargetIndexes = [...forcedTargets, ...selected].sort((left, right) => left - right);
      const signature = pairTargetIndexes.join(",");
      plans.set(signature, { pairTargetIndexes });
      return;
    }

    for (let index = startIndex; index < targetIndexes.length; index += 1) {
      visit(index, [...selected, targetIndexes[index]]);

      if (truncated) {
        return;
      }
    }
  };

  visit(0, []);
  return { plans: [...plans.values()], exploredNodes, truncated };
}

function materializeSevenPairsDecomposition(
  plan: SevenPairsPlan,
  hand: Tile[],
): SevenPairsDecomposition {
  const ordinarySources = new Map<number, Tile[]>();

  for (const source of hand) {
    if (isYaoJi(source)) {
      continue;
    }

    const targetIndex = tileIndex(source);
    ordinarySources.set(targetIndex, [...(ordinarySources.get(targetIndex) ?? []), source]);
  }

  const laiziSources = hand.filter(isYaoJi);
  let laiziIndex = 0;
  const pairs = plan.pairTargetIndexes.map((targetIndex): HuPairGroup => {
    const target = indexTile(targetIndex);
    const targetSources = ordinarySources.get(targetIndex) ?? [];
    const resolvedTiles = Array.from({ length: 2 }, (): HuResolvedTile => {
      const source = targetSources.shift();

      if (source !== undefined) {
        return { source, target, usedAsLaizi: false };
      }

      const laiziSource = laiziSources[laiziIndex];
      laiziIndex += 1;
      return { source: laiziSource, target, usedAsLaizi: true };
    });
    ordinarySources.set(targetIndex, targetSources);
    return { type: "pair", tiles: resolvedTiles };
  });
  const targetCounts = new Map<number, number>();

  for (const targetIndex of plan.pairTargetIndexes) {
    targetCounts.set(targetIndex, (targetCounts.get(targetIndex) ?? 0) + 2);
  }

  const dragonCount = Math.min(
    3,
    [...targetCounts.values()].reduce((total, count) => total + Math.floor(count / 4), 0),
  ) as SevenPairsDecomposition["dragonCount"];

  return { fixedMeldCount: 0, pairs, dragonCount };
}

function compareSevenPairsCandidates(
  left: HuDecompositionCandidate,
  right: HuDecompositionCandidate,
): number {
  const leftDecomposition = left.decomposition;
  const rightDecomposition = right.decomposition;

  if (!isSevenPairsDecomposition(leftDecomposition) || !isSevenPairsDecomposition(rightDecomposition)) {
    return compareAscii(left.signature, right.signature);
  }

  const leftSuitCount = new Set(
    leftDecomposition.pairs.flatMap((pair) => pair.tiles.map((value) => value.target.suit)),
  ).size;
  const rightSuitCount = new Set(
    rightDecomposition.pairs.flatMap((pair) => pair.tiles.map((value) => value.target.suit)),
  ).size;

  return (
    rightDecomposition.dragonCount - leftDecomposition.dragonCount ||
    leftSuitCount - rightSuitCount ||
    compareAscii(left.signature, right.signature)
  );
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

function emptyDecompositionSearch(
  laiziCount: number,
  reason: HuCheckReason,
): FindHuDecompositionsResult {
  return {
    canHu: false,
    laiziCount,
    candidates: [],
    truncated: false,
    exploredNodes: 0,
    reason,
  };
}

function tileSignature(value: Tile): string {
  const suitCode: Record<Suit, string> = {
    characters: "c",
    dots: "d",
    bamboos: "b",
  };
  return `${suitCode[value.suit]}${value.rank}`;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
