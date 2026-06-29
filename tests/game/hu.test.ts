import test from "node:test";
import assert from "node:assert/strict";

import { canHuWithLaizi, tile } from "../../src/game/index.ts";

test("recognizes a standard hand without laizi", () => {
  const result = canHuWithLaizi([
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("bamboos", 5),
    tile("bamboos", 6),
    tile("bamboos", 7),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("dots", 9),
    tile("dots", 9),
  ]);

  assert.deepEqual(result, {
    canHu: true,
    laiziCount: 0,
  });
});

test("uses laizi to complete a sequence", () => {
  const result = canHuWithLaizi([
    tile("characters", 2),
    tile("characters", 4),
    tile("bamboos", 1),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("bamboos", 5),
    tile("bamboos", 6),
    tile("bamboos", 7),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("dots", 9),
    tile("dots", 9),
  ]);

  assert.deepEqual(result, {
    canHu: true,
    laiziCount: 1,
  });
});

test("uses laizi to complete the pair", () => {
  const result = canHuWithLaizi([
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("bamboos", 5),
    tile("bamboos", 6),
    tile("bamboos", 7),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("characters", 5),
    tile("dots", 1),
  ]);

  assert.deepEqual(result, {
    canHu: true,
    laiziCount: 1,
  });
});

test("uses laizi to complete a triplet", () => {
  const result = canHuWithLaizi([
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("bamboos", 5),
    tile("bamboos", 6),
    tile("bamboos", 7),
    tile("characters", 9),
    tile("characters", 9),
    tile("bamboos", 1),
    tile("dots", 8),
    tile("dots", 8),
  ]);

  assert.deepEqual(result, {
    canHu: true,
    laiziCount: 1,
  });
});

test("uses two laizi as the pair", () => {
  const result = canHuWithLaizi([
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("bamboos", 5),
    tile("bamboos", 6),
    tile("bamboos", 7),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("bamboos", 1),
    tile("dots", 1),
  ]);

  assert.deepEqual(result, {
    canHu: true,
    laiziCount: 2,
  });
});

test("does not treat 1 character as laizi", () => {
  const result = canHuWithLaizi([
    tile("characters", 2),
    tile("characters", 4),
    tile("characters", 1),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("bamboos", 5),
    tile("bamboos", 6),
    tile("bamboos", 7),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("dots", 9),
    tile("dots", 9),
  ]);

  assert.deepEqual(result, {
    canHu: false,
    laiziCount: 0,
    reason: "cannotDecompose",
  });
});

test("rejects a hand that cannot form four melds and one pair", () => {
  const result = canHuWithLaizi([
    tile("characters", 2),
    tile("characters", 3),
    tile("characters", 4),
    tile("dots", 3),
    tile("dots", 4),
    tile("dots", 5),
    tile("bamboos", 5),
    tile("bamboos", 6),
    tile("bamboos", 8),
    tile("characters", 7),
    tile("characters", 8),
    tile("characters", 9),
    tile("dots", 8),
    tile("characters", 6),
  ]);

  assert.deepEqual(result, {
    canHu: false,
    laiziCount: 0,
    reason: "cannotDecompose",
  });
});

test("validates the concealed hand tile count for standard hu", () => {
  assert.deepEqual(canHuWithLaizi([tile("characters", 2)]), {
    canHu: false,
    laiziCount: 0,
    reason: "invalidTileCount",
  });
});

