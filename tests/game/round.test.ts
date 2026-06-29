import test from "node:test";
import assert from "node:assert/strict";

import type { PlayerState, RoundState } from "../../src/game/index.ts";
import { createWall, discardTile, drawTile, seededShuffle, startRound, tile, tileKey } from "../../src/game/index.ts";

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
      missingSuit: player.missingSuit,
    })),
    [
      { id: 0, discards: [], hasWon: false, missingSuit: null },
      { id: 1, discards: [], hasWon: false, missingSuit: null },
      { id: 2, discards: [], hasWon: false, missingSuit: null },
      { id: 3, discards: [], hasWon: false, missingSuit: null },
    ],
  );
});

test("draws one tile for the current player and reduces the wall", () => {
  const round = makeRound({
    currentPlayer: 0,
    wall: [tile("characters", 9), tile("dots", 3)],
    players: [makePlayer(0, [tile("characters", 2)])],
  });

  const result = drawTile(round);

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.tile, tile("characters", 9));
  assert.equal(result.ok && result.round.wall.length, 1);
  assert.deepEqual(result.ok && result.round.players[0].hand, [
    tile("characters", 2),
    tile("characters", 9),
  ]);
});

test("rejects drawing from an empty wall", () => {
  const round = makeRound({ wall: [] });

  assert.deepEqual(drawTile(round), {
    ok: false,
    reason: "wallEmpty",
  });
});

test("discards a legal tile, records it, and switches to the next active player", () => {
  const round = makeRound({
    currentPlayer: 0,
    players: [
      makePlayer(0, [tile("characters", 5), tile("characters", 6)], "dots"),
      makePlayer(1, [], "dots", true),
      makePlayer(2, [], "characters"),
      makePlayer(3, [], "bamboos"),
    ],
  });

  const result = discardTile(round, 0, tile("characters", 5));

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.nextPlayer, 2);
  assert.equal(result.ok && result.round.currentPlayer, 2);
  assert.deepEqual(result.ok && result.round.players[0].hand, [tile("characters", 6)]);
  assert.deepEqual(result.ok && result.round.players[0].discards, [tile("characters", 5)]);
});

test("rejects discarding for a player who is not current", () => {
  const round = makeRound({
    currentPlayer: 0,
    players: [makePlayer(0, [tile("characters", 5)], "dots"), makePlayer(1, [tile("characters", 6)], "dots")],
  });

  assert.deepEqual(discardTile(round, 1, tile("characters", 6)), {
    ok: false,
    reason: "notCurrentPlayer",
  });
});

test("rejects discarding before dingque is set", () => {
  const round = makeRound({
    currentPlayer: 0,
    players: [makePlayer(0, [tile("characters", 5)])],
  });

  assert.deepEqual(discardTile(round, 0, tile("characters", 5)), {
    ok: false,
    reason: "missingSuitNotSet",
  });
});

test("rejects illegal discard when missing-suit tiles must be discarded first", () => {
  const round = makeRound({
    currentPlayer: 0,
    players: [makePlayer(0, [tile("dots", 2), tile("characters", 5)], "dots")],
  });

  assert.deepEqual(discardTile(round, 0, tile("characters", 5)), {
    ok: false,
    reason: "mustDiscardMissingSuitFirst",
  });
});

test("rejects active yao ji discard through round transition", () => {
  const round = makeRound({
    currentPlayer: 0,
    players: [makePlayer(0, [tile("dots", 1), tile("characters", 5)], "bamboos")],
  });

  assert.deepEqual(discardTile(round, 0, tile("dots", 1)), {
    ok: false,
    reason: "cannotDiscardYaoJi",
  });
});

function makeRound(overrides: Partial<RoundState> = {}): RoundState {
  const players = overrides.players ?? [makePlayer(0), makePlayer(1), makePlayer(2), makePlayer(3)];

  return {
    seed: "test-round",
    dealer: 0,
    players,
    wall: [],
    currentPlayer: 0,
    ...overrides,
  };
}

function makePlayer(
  id: PlayerState["id"],
  hand = [] as PlayerState["hand"],
  missingSuit: PlayerState["missingSuit"] = null,
  hasWon = false,
): PlayerState {
  return {
    id,
    hand,
    discards: [],
    hasWon,
    missingSuit,
  };
}
