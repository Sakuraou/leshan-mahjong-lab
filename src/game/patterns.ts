import type { StandardHuDecomposition } from "./hu.ts";
import { isYaoJi, tileKey } from "./tiles.ts";
import type { Meld, ScorePattern, Tile, WinMethod } from "./types.ts";

export type DetectHuPatternsInput = {
  decomposition: StandardHuDecomposition;
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
