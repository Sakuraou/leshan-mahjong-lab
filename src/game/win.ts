import {
  findAllHuDecompositions,
  type HuDecompositionCandidate,
  type HuDecomposition,
  type HuCheckReason,
} from "./hu.ts";
import { detectHuPatterns } from "./patterns.ts";
import { calculateHuScore, hasOrdinaryMissingSuitTile, type HuScore } from "./rules.ts";
import type { PlayerId, RoundState, ScorePattern, Tile, WinMethod } from "./types.ts";

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
      decomposition: HuDecomposition;
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

  const structure = findAllHuDecompositions({
    hand,
    fixedMeldCount: player.melds.length,
  });

  if (!structure.canHu) {
    return {
      canHu: false,
      winMethod,
      hand,
      reason: structure.reason ?? "cannotDecompose",
    };
  }

  const scoredCandidates = structure.candidates.map((candidate) =>
    scoreHuCandidate(candidate, player.melds, hand, winMethod),
  );
  scoredCandidates.sort(compareScoredHuCandidates);
  const best = scoredCandidates[0];
  const { patterns, score } = best;

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
    decomposition: best.candidate.decomposition,
    patterns,
    score,
  };
}

type ScoredHuCandidate = {
  candidate: HuDecompositionCandidate;
  patterns: ScorePattern[];
  score: HuScore;
  totalMultiplier: number;
};

function scoreHuCandidate(
  candidate: HuDecompositionCandidate,
  melds: RoundState["players"][number]["melds"],
  hand: Tile[],
  winMethod: WinMethod,
): ScoredHuCandidate {
  const detected = detectHuPatterns({
    decomposition: candidate.decomposition,
    melds,
    originalHand: hand,
    winMethod,
  });
  const score = calculateHuScore({
    patterns: detected.patterns,
    genCount: detected.genCount,
    winMethod,
  });

  return {
    candidate,
    patterns: detected.patterns,
    score,
    totalMultiplier: score.multiplierBeforeWinMethod * score.winMethodMultiplier,
  };
}

function compareScoredHuCandidates(left: ScoredHuCandidate, right: ScoredHuCandidate): number {
  return (
    right.score.cappedPoints - left.score.cappedPoints ||
    right.score.rawPoints - left.score.rawPoints ||
    right.totalMultiplier - left.totalMultiplier ||
    right.score.genCount - left.score.genCount ||
    (left.candidate.signature < right.candidate.signature
      ? -1
      : left.candidate.signature > right.candidate.signature
        ? 1
        : 0)
  );
}
