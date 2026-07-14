import {
  isSevenPairsDecomposition,
  type HuDecomposition,
  type SevenPairsDecomposition,
} from "./hu.ts";
import { isYaoJi, tileKey } from "./tiles.ts";
import type { Meld, ScorePattern, Tile, WinMethod } from "./types.ts";

export type DetectHuPatternsInput = {
  decomposition: HuDecomposition;
  melds: readonly Meld[];
  // Full concealed winning hand, including the self-drawn or discarded winning tile.
  originalHand: readonly Tile[];
  winMethod: WinMethod;
};

export type HuPatternDetection = {
  patterns: ScorePattern[];
  genCount: number;
};

export function detectHuPatterns(input: DetectHuPatternsInput): HuPatternDetection {
  if (isSevenPairsDecomposition(input.decomposition)) {
    return detectSevenPairsPatterns(input, input.decomposition);
  }

  if (input.decomposition.fixedMeldCount !== input.melds.length) {
    throw new Error("Hu decomposition and exposed meld count do not match.");
  }

  const resolvedTiles = [
    ...input.decomposition.pair.tiles,
    ...input.decomposition.melds.flatMap((meld) => meld.tiles),
    ...input.melds.flatMap((meld) =>
      meld.tiles.map((source) => ({
        source,
        target: meld.tile,
        usedAsLaizi: isYaoJi(source),
      })),
    ),
  ];
  const originalTiles = [...input.originalHand, ...input.melds.flatMap((meld) => meld.tiles)];
  const patterns: ScorePattern[] = ["pingHu"];
  const completeMeldCount = input.decomposition.melds.length + input.melds.length;

  if (
    completeMeldCount === 4 &&
    input.decomposition.melds.every((meld) => meld.type === "triplet")
  ) {
    patterns.push("daDui");
  }

  if (
    input.melds.length === 4 &&
    input.decomposition.melds.length === 0 &&
    input.originalHand.length === 2
  ) {
    patterns.push("danDiao");
  }

  if (originalTiles.every((value) => !isYaoJi(value))) {
    patterns.push("wuJi");
  }

  if (new Set(resolvedTiles.map((value) => value.target.suit)).size === 1) {
    patterns.push("qingYiSe");
  }

  const targetCounts = new Map<string, number>();

  for (const value of resolvedTiles) {
    const key = tileKey(value.target);
    targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
  }

  const genCount = [...targetCounts.values()].reduce(
    (total, count) => total + Math.floor(count / 4),
    0,
  );

  return { patterns, genCount };
}

function detectSevenPairsPatterns(
  input: DetectHuPatternsInput,
  decomposition: SevenPairsDecomposition,
): HuPatternDetection {
  if (input.melds.length !== 0) {
    throw new Error("Seven pairs cannot contain exposed melds.");
  }

  const resolvedTiles = decomposition.pairs.flatMap((pair) => pair.tiles);
  const patterns: ScorePattern[] = [sevenPairsPattern(decomposition.dragonCount)];

  if (input.originalHand.every((value) => !isYaoJi(value))) {
    patterns.push("wuJi");
  }

  if (new Set(resolvedTiles.map((value) => value.target.suit)).size === 1) {
    patterns.push("qingYiSe");
  }

  // The dragon pattern already includes its roots, so seven pairs never adds gen fan again.
  return { patterns, genCount: 0 };
}

function sevenPairsPattern(dragonCount: SevenPairsDecomposition["dragonCount"]): ScorePattern {
  const patterns: Record<SevenPairsDecomposition["dragonCount"], ScorePattern> = {
    0: "xiaoQiDui",
    1: "longQiDui",
    2: "shuangLongQiDui",
    3: "sanLongQiDui",
  };

  return patterns[dragonCount];
}
