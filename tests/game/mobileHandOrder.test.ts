import assert from "node:assert/strict";
import test from "node:test";

import {
  moveMobileHandTile,
  orderMobileHand,
  reconcileMobileHandOrder,
  type ClientOwnedTile,
  type Rank,
  type Suit,
} from "@leshan-mahjong/client-core";

test("initial mobile hand order is bamboo, dots, characters, then rank", () => {
  const hand = [owned("characters", 2, "c2"), owned("dots", 9, "d9"), owned("bamboos", 3, "b3")];
  const ids = reconcileMobileHandOrder([], hand);

  assert.deepEqual(ids, ["b3", "d9", "c2"]);
  assert.deepEqual(orderMobileHand(hand, ids).map((tile) => tile.tileId), ids);
});

test("duplicate faces move independently by tileId", () => {
  const ids = ["b2-a", "b2-b", "d5"];
  assert.deepEqual(moveMobileHandTile(ids, "b2-b", "b2-a"), ["b2-b", "b2-a", "d5"]);
  assert.deepEqual(moveMobileHandTile(ids, "missing", "b2-a"), ids);
});

test("draw and exchange insert only new tiles without re-sorting survivors", () => {
  const customOrder = ["c9", "b2", "d5"];
  const afterDraw = [
    owned("characters", 9, "c9"),
    owned("bamboos", 2, "b2"),
    owned("dots", 5, "d5"),
    owned("bamboos", 3, "draw-b3"),
  ];
  const drawOrder = reconcileMobileHandOrder(customOrder, afterDraw);
  assert.deepEqual(drawOrder, ["draw-b3", "c9", "b2", "d5"]);

  const afterExchange = [
    owned("characters", 9, "c9"),
    owned("dots", 5, "d5"),
    owned("bamboos", 3, "draw-b3"),
    owned("dots", 1, "returned-yaoji"),
  ];
  assert.deepEqual(
    reconcileMobileHandOrder(drawOrder, afterExchange),
    ["draw-b3", "returned-yaoji", "c9", "d5"],
  );
});

test("reconnect keeps surviving custom ids while a new round resets canonically", () => {
  const restored = reconcileMobileHandOrder(
    ["stale", "c7", "b8", "d2"],
    [owned("dots", 2, "d2"), owned("characters", 7, "c7"), owned("bamboos", 8, "b8")],
  );
  assert.deepEqual(restored, ["c7", "b8", "d2"]);

  const newRound = reconcileMobileHandOrder(
    restored,
    [owned("characters", 1, "new-c1"), owned("bamboos", 9, "new-b9"), owned("dots", 3, "new-d3")],
  );
  assert.deepEqual(newRound, ["new-b9", "new-d3", "new-c1"]);
});

function owned(suit: Suit, rank: Rank, tileId: string): ClientOwnedTile {
  return { suit, rank, tileId };
}
