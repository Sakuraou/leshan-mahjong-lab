import test from "node:test";
import assert from "node:assert/strict";

import { createWall, seededShuffle, startRound, tileKey } from "../../src/game/index.ts";

test("seeded shuffle is reproducible", () => {
  const wall = createWall();
  const first = seededShuffle(wall, "demo-seed").map(tileKey);
  const second = seededShuffle(wall, "demo-seed").map(tileKey);

  assert.deepEqual(first, second);
});

test("different seeds usually produce different shuffled walls", () => {
  const wall = createWall();
  const first = seededShuffle(wall, "demo-seed-a").map(tileKey);
  const second = seededShuffle(wall, "demo-seed-b").map(tileKey);

  assert.notDeepEqual(first, second);
});

test("starts a round with dealer 14 tiles and other players 13 tiles", () => {
  const round = startRound({ seed: "deal-counts", dealer: 0 });

  assert.equal(round.players.length, 4);
  assert.equal(round.players[0].hand.length, 14);
  assert.equal(round.players[1].hand.length, 13);
  assert.equal(round.players[2].hand.length, 13);
  assert.equal(round.players[3].hand.length, 13);
});

test("keeps the remaining wall after dealing", () => {
  const round = startRound({ seed: "remaining-wall", dealer: 0 });
  const dealtTileCount = round.players.reduce((sum, player) => sum + player.hand.length, 0);

  assert.equal(dealtTileCount, 53);
  assert.equal(round.wall.length, 55);
  assert.equal(dealtTileCount + round.wall.length, 108);
});

test("supports a configurable dealer and current player", () => {
  const round = startRound({ seed: "dealer-two", dealer: 2 });

  assert.equal(round.dealer, 2);
  assert.equal(round.currentPlayer, 2);
  assert.equal(round.players[2].hand.length, 14);
  assert.equal(round.players[0].hand.length, 13);
  assert.equal(round.players[1].hand.length, 13);
  assert.equal(round.players[3].hand.length, 13);
});

test("starts players with empty discards and active status", () => {
  const round = startRound({ seed: "player-state" });

  assert.deepEqual(
    round.players.map((player) => ({
      id: player.id,
      discards: player.discards,
      hasWon: player.hasWon,
    })),
    [
      { id: 0, discards: [], hasWon: false },
      { id: 1, discards: [], hasWon: false },
      { id: 2, discards: [], hasWon: false },
      { id: 3, discards: [], hasWon: false },
    ],
  );
});

