import {
  canHuWithLaizi,
  type HuCheckReason,
  type StandardHuDecomposition,
} from "./hu.ts";
import { calculateHuScore, hasOrdinaryMissingSuitTile, hasWuJi, type HuScore } from "./rules.ts";
import { isYaoJi } from "./tiles.ts";
import type { Meld, PlayerId, RoundState, ScorePattern, Tile, WinMethod } from "./types.ts";

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
      decomposition: StandardHuDecomposition;
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

  const structure = canHuWithLaizi({
    hand,
    fixedMeldCount: player.melds.length,
    explain: true,
  });

  if (!structure.canHu) {
    return {
      canHu: false,
      winMethod,
      hand,
      reason: structure.reason ?? "cannotDecompose",
    };
  }

  const patterns = detectBasicPatterns(hand, player.melds);
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
    decomposition: structure.decomposition,
    patterns,
    score,
  };
}

function detectBasicPatterns(hand: Tile[], melds: Meld[]): ScorePattern[] {
  const patterns: ScorePattern[] = ["pingHu"];
  const finalSettlementTiles = [...hand, ...melds.flatMap((meld) => meld.tiles)];

  if (hasWuJi(finalSettlementTiles)) {
    patterns.push("wuJi");
  }

  if (hasQingYiSe(finalSettlementTiles)) {
    patterns.push("qingYiSe");
  }

  return patterns;
}

function hasQingYiSe(hand: Tile[]): boolean {
  const ordinarySuits = new Set(hand.filter((value) => !isYaoJi(value)).map((value) => value.suit));
  return ordinarySuits.size === 1;
}
