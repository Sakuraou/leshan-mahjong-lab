import type { GangType, PatternScore, ScorePattern, Suit, Tile, WinMethod } from "./types.ts";
import { containsTile, isOrdinaryMissingSuitTile, isYaoJi, tile, tileLabel } from "./tiles.ts";

export type DiscardCheckInput = {
  hand: Tile[];
  discard: Tile;
  missingSuit: Suit;
  forbidYaoJiDiscard?: boolean;
};

export type DiscardCheckResult =
  | { legal: true }
  | {
      legal: false;
      reason: "tileNotInHand" | "mustDiscardMissingSuitFirst" | "cannotDiscardYaoJi";
    };

export function checkDiscardLegal(input: DiscardCheckInput): DiscardCheckResult {
  const forbidYaoJiDiscard = input.forbidYaoJiDiscard ?? true;

  if (!containsTile(input.hand, input.discard)) {
    return { legal: false, reason: "tileNotInHand" };
  }

  const hasOrdinaryMissingSuitTile = input.hand.some((value) =>
    isOrdinaryMissingSuitTile(value, input.missingSuit),
  );

  if (
    hasOrdinaryMissingSuitTile &&
    !isOrdinaryMissingSuitTile(input.discard, input.missingSuit)
  ) {
    return { legal: false, reason: "mustDiscardMissingSuitFirst" };
  }

  if (forbidYaoJiDiscard && isYaoJi(input.discard)) {
    return { legal: false, reason: "cannotDiscardYaoJi" };
  }

  return { legal: true };
}

export function hasOrdinaryMissingSuitTile(hand: Tile[], missingSuit: Suit): boolean {
  return hand.some((value) => isOrdinaryMissingSuitTile(value, missingSuit));
}

export function hasWuJi(finalSettlementTiles: Tile[]): boolean {
  return finalSettlementTiles.every((value) => !isYaoJi(value));
}

export type ChickenPayment = {
  kind: "threeChicken" | "fourChicken";
  tile: Tile;
  count: 3 | 4;
  pointsPerOpponent: 16 | 32;
};

export type ChickenSettlement = {
  bambooCount: number;
  dotCount: number;
  payments: ChickenPayment[];
  totalPerOpponent: number;
};

export function calculateChickenSettlement(finalSettlementTiles: Tile[]): ChickenSettlement {
  const bambooYaoJi = tile("bamboos", 1);
  const dotYaoJi = tile("dots", 1);
  const bambooCount = finalSettlementTiles.filter((value) => value.suit === "bamboos" && value.rank === 1)
    .length;
  const dotCount = finalSettlementTiles.filter((value) => value.suit === "dots" && value.rank === 1)
    .length;

  const payments = [
    chickenPaymentForCount(bambooYaoJi, bambooCount),
    chickenPaymentForCount(dotYaoJi, dotCount),
  ].filter((payment): payment is ChickenPayment => payment !== null);

  return {
    bambooCount,
    dotCount,
    payments,
    totalPerOpponent: payments.reduce((sum, payment) => sum + payment.pointsPerOpponent, 0),
  };
}

function chickenPaymentForCount(yaoJi: Tile, count: number): ChickenPayment | null {
  if (count === 3) {
    return {
      kind: "threeChicken",
      tile: yaoJi,
      count,
      pointsPerOpponent: 16,
    };
  }

  if (count === 4) {
    return {
      kind: "fourChicken",
      tile: yaoJi,
      count,
      pointsPerOpponent: 32,
    };
  }

  return null;
}

export function calculateGangPoints(type: GangType, usesLaizi: boolean): number {
  if (type === "baGang") {
    return usesLaizi ? 1 : 2;
  }

  return usesLaizi ? 2 : 4;
}

const patternScores: Record<ScorePattern, PatternScore> = {
  pingHu: { pattern: "pingHu", fan: 0, multiplier: 1 },
  daDui: { pattern: "daDui", fan: 1, multiplier: 2 },
  danDiao: { pattern: "danDiao", fan: 1, multiplier: 2 },
  qingYiSe: { pattern: "qingYiSe", fan: 2, multiplier: 4 },
  xiaoQiDui: { pattern: "xiaoQiDui", fan: 2, multiplier: 4 },
  wuJi: { pattern: "wuJi", fan: 2, multiplier: 4 },
  longQiDui: { pattern: "longQiDui", fan: 3, multiplier: 8 },
  shuangLongQiDui: { pattern: "shuangLongQiDui", fan: 4, multiplier: 16 },
};

export type HuScoreInput = {
  patterns: ScorePattern[];
  genCount?: number;
  winMethod: WinMethod;
  cap?: number;
};

export type HuScore = {
  patterns: PatternScore[];
  genCount: number;
  multiplierBeforeWinMethod: number;
  winMethodMultiplier: 1 | 2;
  rawPoints: number;
  cappedPoints: number;
  canWin: boolean;
};

export function calculateHuScore(input: HuScoreInput): HuScore {
  const cap = input.cap ?? 64;
  const genCount = input.genCount ?? 0;
  const patterns = input.patterns.map((pattern) => patternScores[pattern]);
  const patternMultiplier = patterns.reduce(
    (multiplier, patternScore) => multiplier * patternScore.multiplier,
    1,
  );
  const genMultiplier = 2 ** genCount;
  const multiplierBeforeWinMethod = patternMultiplier * genMultiplier;
  const winMethodMultiplier = input.winMethod === "selfDraw" ? 2 : 1;
  const rawPoints = multiplierBeforeWinMethod * winMethodMultiplier;
  const cappedPoints = Math.min(rawPoints, cap);

  return {
    patterns,
    genCount,
    multiplierBeforeWinMethod,
    winMethodMultiplier,
    rawPoints,
    cappedPoints,
    canWin: rawPoints >= 2,
  };
}

export function describeChickenPayment(payment: ChickenPayment): string {
  return `${payment.kind} ${tileLabel(payment.tile)}: ${payment.pointsPerOpponent}`;
}

