import test from "node:test";
import assert from "node:assert/strict";

import type { Meld, PlayerState, RoundState, ScorePattern, Tile } from "../../src/game/index.ts";
import {
  calculateHuScore,
  checkCurrentPlayerHu,
  checkDiscardHu,
  detectHuPatterns,
  findHuDecompositions,
  huDecompositionSignature,
  isSevenPairsDecomposition,
  tile,
} from "../../src/game/index.ts";

test("allows self-draw ping hu because self-draw doubles to 2 points", () => {
  const round = makeRound([
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("dots", 6),
    tile("dots", 7),
    tile("dots", 8),
    tile("characters", 5),
    tile("bamboos", 1),
  ]);

  const result = checkCurrentPlayerHu(round);

  assert.equal(result.canHu, true);
  assert.equal(result.canHu && result.score.rawPoints, 2);
  assert.deepEqual(result.canHu && result.patterns, ["pingHu"]);
});

test("rejects discard ping hu because it is only 1 point", () => {
  const round = makeRound([
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("dots", 6),
    tile("dots", 7),
    tile("dots", 8),
    tile("bamboos", 1),
  ]);

  const result = checkDiscardHu(round, 0, tile("characters", 5));

  assert.equal(result.canHu, false);
  assert.equal(!result.canHu && result.reason, "belowMinimumScore");
  assert.deepEqual(!result.canHu && result.patterns, ["pingHu"]);
  assert.equal(!result.canHu && result.score?.rawPoints, 1);
});

test("allows discard hu with wu ji and qing yi se", () => {
  const round = makeRound([
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("characters", 3),
    tile("characters", 4),
    tile("characters", 5),
    tile("characters", 5),
    tile("characters", 6),
    tile("characters", 7),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("characters", 9),
  ]);

  const result = checkDiscardHu(round, 0, tile("characters", 9));

  assert.equal(result.canHu, true);
  assert.equal(result.canHu && result.score.rawPoints, 16);
  assert.deepEqual(result.canHu && result.patterns, ["pingHu", "wuJi", "qingYiSe"]);
});

test("rejects hands that cannot form a hu structure", () => {
  const round = makeRound([
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("dots", 6),
    tile("dots", 7),
    tile("dots", 9),
    tile("characters", 5),
    tile("characters", 6),
  ]);

  const result = checkCurrentPlayerHu(round);

  assert.equal(result.canHu, false);
  assert.equal(!result.canHu && result.reason, "cannotDecompose");
});

test("scores small, single-, double-, and triple-dragon seven pairs without extra gen", () => {
  const cases: Array<{
    name: string;
    hand: Tile[];
    pattern: ScorePattern;
    rawPoints: number;
    dragonCount: 0 | 1 | 2 | 3;
  }> = [
    {
      name: "small seven pairs",
      hand: pairHand([
        tile("characters", 2), tile("characters", 5), tile("characters", 8),
        tile("dots", 2), tile("dots", 5), tile("dots", 8), tile("dots", 9),
      ]),
      pattern: "xiaoQiDui",
      rawPoints: 32,
      dragonCount: 0,
    },
    {
      name: "single dragon",
      hand: [
        ...repeatTile(tile("characters", 2), 4),
        ...pairHand([
          tile("characters", 5), tile("characters", 8), tile("dots", 2),
          tile("dots", 5), tile("dots", 8),
        ]),
      ],
      pattern: "longQiDui",
      rawPoints: 64,
      dragonCount: 1,
    },
    {
      name: "double dragon",
      hand: [
        ...repeatTile(tile("characters", 2), 4),
        ...repeatTile(tile("characters", 5), 4),
        ...pairHand([tile("characters", 8), tile("dots", 2), tile("dots", 5)]),
      ],
      pattern: "shuangLongQiDui",
      rawPoints: 128,
      dragonCount: 2,
    },
    {
      name: "triple dragon",
      hand: [
        ...repeatTile(tile("characters", 2), 4),
        ...repeatTile(tile("characters", 5), 4),
        ...repeatTile(tile("dots", 2), 4),
        ...repeatTile(tile("dots", 5), 2),
      ],
      pattern: "sanLongQiDui",
      rawPoints: 256,
      dragonCount: 3,
    },
  ];

  for (const value of cases) {
    const result = checkCurrentPlayerHu(makeRound(value.hand));
    assert.equal(result.canHu, true, value.name);
    if (!result.canHu) continue;
    assert.deepEqual(result.patterns, [value.pattern, "wuJi"], value.name);
    assert.equal(result.score.rawPoints, value.rawPoints, value.name);
    assert.equal(result.score.genCount, 0, value.name);
    assert.equal(isSevenPairsDecomposition(result.decomposition), true, value.name);
    if (!isSevenPairsDecomposition(result.decomposition)) continue;
    assert.equal(result.decomposition.dragonCount, value.dragonCount, value.name);
  }
});

test("selects seven pairs over a lower-scoring standard decomposition", () => {
  const hand = pairHand([1, 2, 3, 4, 5, 6, 7].map((rank) =>
    tile("characters", rank as 1 | 2 | 3 | 4 | 5 | 6 | 7),
  ));
  const result = checkCurrentPlayerHu(makeRound(hand));

  assert.equal(result.canHu, true);
  if (!result.canHu) return;
  assert.equal(isSevenPairsDecomposition(result.decomposition), true);
  assert.deepEqual(result.patterns, ["xiaoQiDui", "wuJi", "qingYiSe"]);
  assert.equal(result.score.rawPoints, 128);
  assert.equal(result.score.cappedPoints, 64);
});

test("resolves laizi targets into a pure dragon seven pairs without restoring wu ji", () => {
  const hand = [
    ...pairHand([
      tile("characters", 3), tile("characters", 4), tile("characters", 5),
      tile("characters", 6), tile("characters", 7),
    ]),
    tile("characters", 2),
    tile("bamboos", 1), tile("dots", 1), tile("bamboos", 1),
  ];
  const result = checkCurrentPlayerHu(makeRound(hand));
  const repeated = checkCurrentPlayerHu(makeRound(hand));

  assert.equal(result.canHu, true);
  assert.equal(repeated.canHu, true);
  if (!result.canHu || !repeated.canHu) return;
  assert.deepEqual(result.patterns, ["longQiDui", "qingYiSe"]);
  assert.equal(result.score.genCount, 0);
  assert.equal(isSevenPairsDecomposition(result.decomposition), true);
  if (!isSevenPairsDecomposition(result.decomposition)) return;
  assert.equal(result.decomposition.dragonCount, 1);
  assert.equal(
    huDecompositionSignature(repeated.decomposition),
    huDecompositionSignature(result.decomposition),
  );
  assert.equal(
    result.decomposition.pairs
      .flatMap((pair) => pair.tiles)
      .filter((value) => value.usedAsLaizi)
      .every((value) => value.target.suit === "characters" && value.target.rank === 2),
    true,
  );
});

test("allows discard seven pairs at its highest discard score", () => {
  const winningHand = pairHand([
    tile("characters", 2), tile("characters", 5), tile("characters", 8),
    tile("dots", 2), tile("dots", 5), tile("dots", 8), tile("dots", 9),
  ]);
  const result = checkDiscardHu(makeRound(winningHand.slice(0, -1)), 0, winningHand.at(-1)!);

  assert.equal(result.canHu, true);
  if (!result.canHu) return;
  assert.deepEqual(result.patterns, ["xiaoQiDui", "wuJi"]);
  assert.equal(result.score.rawPoints, 16);
});

test("allows self-draw hu after a peng meld", () => {
  const round = makeRound(
    exposedWinningHand(),
    [makeMeld("peng", tile("characters", 6), 3)],
  );

  const result = checkCurrentPlayerHu(round);

  assert.equal(result.canHu, true);

  if (!result.canHu) {
    return;
  }

  assert.equal(result.decomposition.fixedMeldCount, 1);
  assert.equal(result.decomposition.melds.length, 3);
  assert.deepEqual(result.patterns, ["pingHu"]);
  assert.equal(result.score.rawPoints, 2);
});

test("allows discard hu after a peng meld", () => {
  const round = makeRound(
    [
      tile("characters", 2),
      tile("characters", 3),
      tile("characters", 4),
      tile("characters", 3),
      tile("characters", 4),
      tile("characters", 5),
      tile("characters", 7),
      tile("characters", 8),
      tile("characters", 9),
      tile("characters", 9),
    ],
    [makeMeld("peng", tile("characters", 6), 3)],
  );

  const result = checkDiscardHu(round, 0, tile("characters", 9));

  assert.equal(result.canHu, true);

  if (!result.canHu) {
    return;
  }

  assert.equal(result.decomposition.fixedMeldCount, 1);
  assert.deepEqual(result.patterns, ["pingHu", "wuJi", "qingYiSe"]);
  assert.equal(result.score.rawPoints, 16);
});

test("allows self-draw hu after a gang meld", () => {
  const round = makeRound(
    exposedWinningHand(),
    [makeMeld("anGang", tile("characters", 6), 4)],
  );

  const result = checkCurrentPlayerHu(round);

  assert.equal(result.canHu, true);
  assert.equal(result.canHu && result.decomposition.fixedMeldCount, 1);
  assert.equal(result.canHu && result.score.genCount, 1);
});

test("detects da dui and applies its multiplier", () => {
  const result = checkCurrentPlayerHu(makeRound([
    ...repeatTile(tile("characters", 2), 3),
    ...repeatTile(tile("characters", 5), 3),
    ...repeatTile(tile("dots", 3), 3),
    ...repeatTile(tile("dots", 7), 3),
    ...repeatTile(tile("characters", 9), 2),
  ]));

  assert.equal(result.canHu, true);

  if (!result.canHu) {
    return;
  }

  assert.deepEqual(result.patterns, ["pingHu", "daDui", "wuJi"]);
  assert.equal(result.score.genCount, 0);
  assert.equal(result.score.rawPoints, 16);
});

test("detects dan diao for self-draw and discard wins", () => {
  const melds = [
    makeMeld("peng", tile("characters", 2), 3),
    makeMeld("peng", tile("characters", 5), 3),
    makeMeld("peng", tile("dots", 3), 3),
    makeMeld("peng", tile("dots", 6), 3),
  ];
  const selfDraw = checkCurrentPlayerHu(makeRound(repeatTile(tile("characters", 9), 2), melds));
  const discard = checkDiscardHu(makeRound([tile("characters", 9)], melds), 0, tile("characters", 9));

  assert.equal(selfDraw.canHu, true);
  assert.equal(discard.canHu, true);

  if (!selfDraw.canHu || !discard.canHu) {
    return;
  }

  assert.deepEqual(selfDraw.patterns, ["pingHu", "daDui", "danDiao", "wuJi"]);
  assert.deepEqual(discard.patterns, selfDraw.patterns);
  assert.equal(selfDraw.score.rawPoints, 32);
  assert.equal(discard.score.rawPoints, 16);
});

test("counts resolved roots and separates target-based qing yi se from source-based wu ji", () => {
  const cases: Array<{
    name: string;
    hand: Tile[];
    melds: Meld[];
    patterns: ScorePattern[];
    genCount: number;
    rawPoints: number;
  }> = [
    {
      name: "one root from peng plus a concealed fourth tile",
      hand: [
        tile("characters", 2), tile("characters", 3), tile("characters", 4),
        tile("characters", 5), tile("characters", 6), tile("characters", 7),
        tile("dots", 2), tile("dots", 3), tile("dots", 4),
        tile("characters", 9), tile("characters", 9),
      ],
      melds: [makeMeld("peng", tile("characters", 4), 3)],
      patterns: ["pingHu", "wuJi"],
      genCount: 1,
      rawPoints: 16,
    },
    {
      name: "two roots from two peng melds",
      hand: [
        tile("characters", 2), tile("characters", 3), tile("characters", 4),
        tile("dots", 4), tile("dots", 5), tile("dots", 6),
        tile("characters", 9), tile("characters", 9),
      ],
      melds: [
        makeMeld("peng", tile("characters", 4), 3),
        makeMeld("peng", tile("dots", 6), 3),
      ],
      patterns: ["pingHu", "wuJi"],
      genCount: 2,
      rawPoints: 32,
    },
    {
      name: "laizi resolves as the fourth tile of a root",
      hand: [
        tile("bamboos", 1), tile("characters", 2), tile("characters", 3),
        tile("characters", 5), tile("characters", 6), tile("characters", 7),
        tile("dots", 2), tile("dots", 3), tile("dots", 4),
        tile("characters", 9), tile("characters", 9),
      ],
      melds: [makeMeld("peng", tile("characters", 4), 3)],
      patterns: ["pingHu"],
      genCount: 1,
      rawPoints: 4,
    },
    {
      name: "off-suit exposed meld breaks qing yi se",
      hand: [
        tile("characters", 2), tile("characters", 3), tile("characters", 4),
        tile("characters", 3), tile("characters", 4), tile("characters", 5),
        tile("characters", 7), tile("characters", 8), tile("characters", 9),
        tile("characters", 9), tile("characters", 9),
      ],
      melds: [makeMeld("peng", tile("dots", 8), 3)],
      patterns: ["pingHu", "wuJi"],
      genCount: 0,
      rawPoints: 8,
    },
    {
      name: "exposed yao ji source breaks wu ji without breaking qing yi se",
      hand: [
        tile("characters", 2), tile("characters", 3), tile("characters", 4),
        tile("characters", 3), tile("characters", 4), tile("characters", 5),
        tile("characters", 7), tile("characters", 8), tile("characters", 9),
        tile("characters", 9), tile("characters", 9),
      ],
      melds: [{
        type: "peng",
        tile: tile("characters", 6),
        tiles: [tile("characters", 6), tile("characters", 6), tile("bamboos", 1)],
        fromPlayer: 1,
      }],
      patterns: ["pingHu", "qingYiSe"],
      genCount: 0,
      rawPoints: 8,
    },
  ];

  for (const value of cases) {
    const result = checkCurrentPlayerHu(makeRound(value.hand, value.melds));
    assert.equal(result.canHu, true, value.name);

    if (!result.canHu) {
      continue;
    }

    assert.deepEqual(result.patterns, value.patterns, value.name);
    assert.equal(result.score.genCount, value.genCount, value.name);
    assert.equal(result.score.rawPoints, value.rawPoints, value.name);
  }
});

test("selects da dui over lower-scoring sequence decompositions", () => {
  const hand = [
    ...repeatTile(tile("characters", 1), 3),
    ...repeatTile(tile("characters", 2), 3),
    ...repeatTile(tile("characters", 3), 3),
    ...repeatTile(tile("characters", 4), 3),
    ...repeatTile(tile("characters", 5), 2),
  ];
  const search = findHuDecompositions({ hand });
  const result = checkCurrentPlayerHu(makeRound(hand));

  assert.equal(search.canHu, true);
  assert.equal(search.canHu && search.candidates.length > 1, true);
  assert.equal(result.canHu, true);

  if (!result.canHu) {
    return;
  }

  assert.deepEqual(result.patterns, ["pingHu", "daDui", "wuJi", "qingYiSe"]);
  assert.equal(result.score.rawPoints, 64);
  assert.equal(isSevenPairsDecomposition(result.decomposition), false);
  if (isSevenPairsDecomposition(result.decomposition)) return;
  assert.equal(result.decomposition.melds.every((meld) => meld.type === "triplet"), true);
});

test("checks every decomposition before applying the discard minimum", () => {
  const winningHand = [
    tile("bamboos", 1), tile("characters", 2), tile("characters", 3),
    tile("characters", 5), tile("characters", 6), tile("characters", 7),
    tile("dots", 2), tile("dots", 3), tile("dots", 4),
    tile("characters", 9), tile("characters", 9),
  ];
  const melds = [makeMeld("peng", tile("characters", 4), 3)];
  const search = findHuDecompositions({ hand: winningHand, fixedMeldCount: 1 });

  assert.equal(search.canHu, true);

  if (!search.canHu) {
    return;
  }

  const firstCandidate = search.candidates[0];
  const firstPatterns = detectHuPatterns({
    decomposition: firstCandidate.decomposition,
    melds,
    originalHand: winningHand,
    winMethod: "discard",
  });
  const firstScore = calculateHuScore({
    patterns: firstPatterns.patterns,
    genCount: firstPatterns.genCount,
    winMethod: "discard",
  });
  assert.equal(firstScore.canWin, false);

  const result = checkDiscardHu(
    makeRound(winningHand.slice(0, -1), melds),
    0,
    tile("characters", 9),
  );
  assert.equal(result.canHu, true);

  if (!result.canHu) {
    return;
  }

  assert.equal(result.score.genCount, 1);
  assert.equal(result.score.rawPoints, 2);
  assert.equal(huDecompositionSignature(result.decomposition).includes("s:c2"), true);
});

test("chooses a qing yi se laizi target over off-suit pair targets", () => {
  const hand = [
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("bamboos", 1),
    tile("dots", 1),
  ];
  const melds = [
    makeMeld("peng", tile("characters", 2), 3),
    makeMeld("peng", tile("characters", 5), 3),
    makeMeld("peng", tile("characters", 8), 3),
  ];
  const search = findHuDecompositions({ hand, fixedMeldCount: 3 });

  assert.equal(search.canHu, true);

  if (!search.canHu) {
    return;
  }

  const candidatePatterns = search.candidates.map((candidate) =>
    detectHuPatterns({
      decomposition: candidate.decomposition,
      melds,
      originalHand: hand,
      winMethod: "selfDraw",
    }).patterns,
  );
  assert.equal(candidatePatterns.some((patterns) => patterns.includes("qingYiSe")), true);
  assert.equal(candidatePatterns.some((patterns) => !patterns.includes("qingYiSe")), true);

  const result = checkCurrentPlayerHu(makeRound(hand, melds));
  assert.equal(result.canHu, true);
  assert.equal(result.canHu && result.patterns.includes("qingYiSe"), true);
});

test("uses the stable signature as the final score tie-breaker", () => {
  const hand = [
    tile("bamboos", 1), tile("characters", 2), tile("characters", 3),
    tile("characters", 5), tile("characters", 6), tile("characters", 7),
    tile("dots", 2), tile("dots", 3), tile("dots", 4),
    tile("characters", 9), tile("characters", 9),
  ];
  const melds = [makeMeld("peng", tile("dots", 8), 3)];
  const first = checkCurrentPlayerHu(makeRound(hand, melds));
  const second = checkCurrentPlayerHu(makeRound(hand, melds));

  assert.equal(first.canHu, true);
  assert.equal(second.canHu, true);

  if (!first.canHu || !second.canHu) {
    return;
  }

  const firstSignature = huDecompositionSignature(first.decomposition);
  assert.equal(first.score.rawPoints, 2);
  assert.equal(firstSignature, "v1|f:1|p:c9|m:s:c1,s:c5,s:d2");
  assert.equal(huDecompositionSignature(second.decomposition), firstSignature);
});

function exposedWinningHand(): Tile[] {
  return [
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("characters", 5),
    tile("bamboos", 1),
  ];
}

function makeMeld(type: Meld["type"], value: Tile, count: 3 | 4): Meld {
  return {
    type,
    tile: value,
    tiles: Array.from({ length: count }, () => value),
    fromPlayer: type === "peng" || type === "mingGang" ? 1 : null,
  };
}

function repeatTile(value: Tile, count: number): Tile[] {
  return Array.from({ length: count }, () => value);
}

function pairHand(values: Tile[]): Tile[] {
  return values.flatMap((value) => repeatTile(value, 2));
}

function makeRound(hand: Tile[], melds: Meld[] = []): RoundState {
  return {
    seed: "win-test",
    dealer: 0,
    players: [makePlayer(0, hand, melds), makePlayer(1), makePlayer(2), makePlayer(3)],
    wall: [],
    currentPlayer: 0,
  };
}

function makePlayer(id: PlayerState["id"], hand: Tile[] = [], melds: Meld[] = []): PlayerState {
  return {
    id,
    hand,
    discards: [],
    melds,
    hasWon: false,
    claimedWinningTile: null,
    missingSuit: "bamboos",
  };
}
