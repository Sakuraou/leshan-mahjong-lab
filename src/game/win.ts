import { canHuWithLaizi, type HuCheckReason } from "./hu.ts";
import { calculateHuScore, hasOrdinaryMissingSuitTile, hasWuJi } from "./rules.ts";
import { isYaoJi } from "./tiles.ts";
import type { HuScore, PlayerId, RoundState, ScorePattern, Tile, WinMethod } from "./types.ts";

export type WinCheckReason =
  | "playerAlreadyWon"
  | "missingSuitNotSet"
  | "hasMissingSuitTile"
  | "cannotDecompose"
  | "belowMinimumScore"
  | HuCheckReason;

export type WinCheckResult =
  | {
      canHu: true;
      winMethod: WinMethod;
      hand: Tile[];
      patterns: ScorePattern[];
      score: HuScore;
    }
  | {
      canHu: false;
      winMethod: WinMethod;
      hand: Tile[];
      reason: WinCheckReason;
      patterns?: ScorePattern[];
      score?: HuScore;
    };

export function checkCurrentPlayerHu(round: RoundState): WinCheckResult {
  const player = round.players[round.currentPlayer];
  return checkPlayerHu(round, player.id, player.hand, "selfDraw");
}

export function checkDiscardHu(round: RoundState, playerId: PlayerId, discard: Tile): WinCheckResult {
  const player = round.players[playerId];
  return checkPlayerHu(round, playerId, [...player.hand, discard], "discard");
}

function checkPlayerHu(
  round: RoundState,
  playerId: PlayerId,
  hand: Tile[],
  winMethod: WinMethod,
): WinCheckResult {
  const player = round.players[playerId];

  if (player.hasWon) {
    return { canHu: false, winMethod, hand, reason: "playerAlreadyWon" };
  }

  if (player.missingSuit === null) {
    return { canHu: false, winMethod, hand, reason: "missingSuitNotSet" };
  }

  if (hasOrdinaryMissingSuitTile(hand, player.missingSuit)) {
    return { canHu: false, winMethod, hand, reason: "hasMissingSuitTile" };
  }

  const structure = canHuWithLaizi(hand);

  if (!structure.canHu) {
    return {
      canHu: false,
      winMethod,
      hand,
      reason: structure.reason ?? "cannotDecompose",
    };
  }

  const patterns = detectBasicPatterns(hand);
  const score = calculateHuScore({ patterns, winMethod });

  if (!score.canWin) {
    return {
      canHu: false,
      winMethod,
      hand,
      reason: "belowMinimumScore",
      patterns,
      score,
    };
  }

  return {
    canHu: true,
    winMethod,
    hand,
    patterns,
    score,
  };
}

function detectBasicPatterns(hand: Tile[]): ScorePattern[] {
  const patterns: ScorePattern[] = ["pingHu"];

  if (hasWuJi(hand)) {
    patterns.push("wuJi");
  }

  if (hasQingYiSe(hand)) {
    patterns.push("qingYiSe");
  }

  return patterns;
}

function hasQingYiSe(hand: Tile[]): boolean {
  const ordinarySuits = new Set(hand.filter((value) => !isYaoJi(value)).map((value) => value.suit));
  return ordinarySuits.size === 1;
}

