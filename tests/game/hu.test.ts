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
  const result = canHuWithLaizi({
    hand: [
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
    ],
    explain: true,
  });

  assert.equal(result.canHu, true);

  if (!result.canHu) {
    return;
  }

  assert.deepEqual(result.decomposition.pair.tiles.find((value) => value.usedAsLaizi), {
    source: tile("dots", 1),
    target: tile("characters", 2),
    usedAsLaizi: true,
  });
});

test("uses laizi to complete a triplet", () => {
  const result = canHuWithLaizi({
    hand: [
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
    ],
    explain: true,
  });

  assert.equal(result.canHu, true);

  if (!result.canHu) {
    return;
  }

  const explainedTriplet = result.decomposition.melds.find(
    (meld) => meld.type === "triplet" && meld.tiles.some((value) => value.usedAsLaizi),
  );
  assert.equal(explainedTriplet?.tiles.every((value) => value.target.rank === 8), true);
  assert.deepEqual(explainedTriplet?.tiles.find((value) => value.usedAsLaizi)?.source, tile("bamboos", 1));
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

test("explains a laizi sequence with one fixed meld", () => {
  const result = canHuWithLaizi({
    hand: [
      tile("characters", 2),
      tile("characters", 3),
      tile("characters", 4),
      tile("dots", 3),
      tile("dots", 4),
      tile("dots", 5),
      tile("bamboos", 7),
      tile("bamboos", 8),
      tile("bamboos", 1),
      tile("characters", 9),
      tile("characters", 9),
    ],
    fixedMeldCount: 1,
    explain: true,
  });

  assert.equal(result.canHu, true);

  if (!result.canHu) {
    return;
  }

  assert.equal(result.decomposition.fixedMeldCount, 1);
  assert.equal(result.decomposition.melds.length, 3);
  assert.deepEqual(
    result.decomposition.melds
      .flatMap((meld) => meld.tiles)
      .find((value) => value.usedAsLaizi),
    {
      source: tile("bamboos", 1),
      target: tile("bamboos", 9),
      usedAsLaizi: true,
    },
  );
});

test("rejects non-integer or out-of-range fixed meld counts", () => {
  for (const fixedMeldCount of [-1, 1.5, 5]) {
    assert.deepEqual(canHuWithLaizi({ hand: [], fixedMeldCount }), {
      canHu: false,
      laiziCount: 0,
      reason: "invalidMeldCount",
    });
  }
});
