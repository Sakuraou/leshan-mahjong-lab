import test from "node:test";
import assert from "node:assert/strict";

import type { PlayerState, RoundState, Tile } from "../../src/game/index.ts";
import { checkCurrentPlayerHu, checkDiscardHu, tile } from "../../src/game/index.ts";

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

function makeRound(hand: Tile[]): RoundState {
  return {
    seed: "win-test",
    dealer: 0,
    players: [makePlayer(0, hand), makePlayer(1), makePlayer(2), makePlayer(3)],
    wall: [],
    currentPlayer: 0,
  };
}

function makePlayer(id: PlayerState["id"], hand: Tile[] = []): PlayerState {
  return {
    id,
    hand,
    discards: [],
    melds: [],
    hasWon: false,
    missingSuit: "bamboos",
  };
}
