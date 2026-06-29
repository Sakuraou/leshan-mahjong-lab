import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateChickenSettlement,
  calculateGangPoints,
  calculateHuScore,
  checkDiscardLegal,
  createWall,
  hasOrdinaryMissingSuitTile,
  hasWuJi,
  isYaoJi,
  tile,
} from "../../src/game/index.ts";

test("builds the 108-tile Leshan Mahjong wall", () => {
  assert.equal(createWall().length, 108);
});

test("recognizes eight-chicken yao ji tiles", () => {
  assert.equal(isYaoJi(tile("bamboos", 1)), true);
  assert.equal(isYaoJi(tile("dots", 1)), true);
  assert.equal(isYaoJi(tile("characters", 1)), false);
  assert.equal(isYaoJi(tile("dots", 2)), false);
});

test("checks dingque discard order while treating yao ji as laizi", () => {
  const hand = [tile("dots", 2), tile("characters", 5), tile("dots", 1)];

  assert.deepEqual(
    checkDiscardLegal({
      hand,
      discard: tile("characters", 5),
      missingSuit: "dots",
    }),
    { legal: false, reason: "mustDiscardMissingSuitFirst" },
  );

  assert.deepEqual(
    checkDiscardLegal({
      hand,
      discard: tile("dots", 2),
      missingSuit: "dots",
    }),
    { legal: true },
  );

  assert.equal(hasOrdinaryMissingSuitTile(hand, "dots"), true);
});

test("forbids active yao ji discard in the MVP", () => {
  const hand = [tile("characters", 5), tile("dots", 1)];

  assert.deepEqual(
    checkDiscardLegal({
      hand,
      discard: tile("dots", 1),
      missingSuit: "dots",
    }),
    { legal: false, reason: "cannotDiscardYaoJi" },
  );
});

test("detects wu ji from original yao ji tiles", () => {
  assert.equal(
    hasWuJi([
      tile("characters", 1),
      tile("characters", 2),
      tile("characters", 3),
      tile("characters", 4),
      tile("characters", 5),
      tile("characters", 6),
      tile("characters", 7),
      tile("characters", 8),
      tile("characters", 9),
      tile("dots", 2),
      tile("dots", 3),
      tile("dots", 4),
      tile("bamboos", 2),
      tile("bamboos", 3),
    ]),
    true,
  );

  assert.equal(hasWuJi([tile("characters", 2), tile("dots", 1)]), false);
});

test("settles three chicken and four chicken by original yao ji suit", () => {
  assert.deepEqual(
    calculateChickenSettlement([tile("bamboos", 1), tile("bamboos", 1), tile("bamboos", 1)]),
    {
      bambooCount: 3,
      dotCount: 0,
      payments: [
        {
          kind: "threeChicken",
          tile: tile("bamboos", 1),
          count: 3,
          pointsPerOpponent: 16,
        },
      ],
      totalPerOpponent: 16,
    },
  );

  assert.equal(
    calculateChickenSettlement([
      tile("bamboos", 1),
      tile("bamboos", 1),
      tile("dots", 1),
      tile("dots", 1),
    ]).totalPerOpponent,
    0,
  );

  assert.equal(
    calculateChickenSettlement([
      tile("bamboos", 1),
      tile("bamboos", 1),
      tile("bamboos", 1),
      tile("dots", 1),
      tile("dots", 1),
      tile("dots", 1),
    ]).totalPerOpponent,
    32,
  );
});

test("calculates gang points with laizi reduction", () => {
  assert.equal(calculateGangPoints("mingGang", false), 4);
  assert.equal(calculateGangPoints("mingGang", true), 2);
  assert.equal(calculateGangPoints("anGang", false), 4);
  assert.equal(calculateGangPoints("anGang", true), 2);
  assert.equal(calculateGangPoints("baGang", false), 2);
  assert.equal(calculateGangPoints("baGang", true), 1);
});

test("calculates minimum win score, stacking, self-draw, and cap", () => {
  assert.equal(calculateHuScore({ patterns: ["pingHu"], winMethod: "discard" }).canWin, false);
  assert.deepEqual(calculateHuScore({ patterns: ["pingHu"], winMethod: "selfDraw" }), {
    patterns: [{ pattern: "pingHu", fan: 0, multiplier: 1 }],
    genCount: 0,
    multiplierBeforeWinMethod: 1,
    winMethodMultiplier: 2,
    rawPoints: 2,
    cappedPoints: 2,
    canWin: true,
  });

  assert.equal(
    calculateHuScore({
      patterns: ["wuJi", "qingYiSe"],
      winMethod: "selfDraw",
    }).rawPoints,
    32,
  );

  assert.equal(
    calculateHuScore({
      patterns: ["qingYiSe", "xiaoQiDui"],
      winMethod: "discard",
    }).rawPoints,
    16,
  );

  assert.equal(
    calculateHuScore({
      patterns: ["shuangLongQiDui", "qingYiSe", "wuJi"],
      genCount: 2,
      winMethod: "selfDraw",
    }).cappedPoints,
    64,
  );
});

