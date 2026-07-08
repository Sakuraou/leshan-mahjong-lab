import test from "node:test";
import assert from "node:assert/strict";

import {
  createRoom,
  claimAnGang,
  claimBaGang,
  claimHu,
  claimMingGang,
  claimPeng,
  claimSelfDrawHu,
  chooseMissingSuit,
  drawGangTile,
  discardRoomTile,
  drawRoomTile,
  passClaim,
  joinRoom,
  startRoomRound,
  takeSeat,
  tile,
  toggleReady,
  toClientVisibleRoomState,
  type RoomState,
  type Suit,
  type Tile,
} from "../../src/game/index.ts";

test("creates a waiting room with four empty seats", () => {
  const room = createRoom({ id: "room-001", seed: "room-seed" });

  assert.equal(room.id, "room-001");
  assert.equal(room.seed, "room-seed");
  assert.equal(room.status, "waiting");
  assert.equal(room.round, null);
  assert.deepEqual(
    room.seats.map((seat) => ({
      seatId: seat.seatId,
      playerId: seat.playerId,
      ready: seat.ready,
      connected: seat.connected,
    })),
    [
      { seatId: 0, playerId: null, ready: false, connected: false },
      { seatId: 1, playerId: null, ready: false, connected: false },
      { seatId: 2, playerId: null, ready: false, connected: false },
      { seatId: 3, playerId: null, ready: false, connected: false },
    ],
  );
  assert.deepEqual(room.eventLog, [{ type: "roomCreated", roomId: "room-001" }]);
});

test("joins players as room members before they take seats", () => {
  const room = joinPlayer(createRoom({ id: "room-join", seed: "join-seed" }), "p1", "Player One");

  assert.deepEqual(room.members, [{ playerId: "p1", displayName: "Player One", connected: true }]);
  assert.equal(room.seats.every((seat) => seat.playerId === null), true);
  assert.deepEqual(room.eventLog.at(-1), {
    type: "playerJoined",
    playerId: "p1",
    displayName: "Player One",
  });
});

test("rejects joining the same player twice", () => {
  const room = joinPlayer(createRoom({ id: "room-duplicate-join", seed: "duplicate-join-seed" }), "p1", "Player One");

  assert.deepEqual(joinRoom(room, { playerId: "p1", displayName: "Player One Again" }), {
    ok: false,
    reason: "playerAlreadyJoined",
  });
});

test("lets a joined player take an empty seat", () => {
  const joined = joinPlayer(createRoom({ id: "room-seat", seed: "seat-seed" }), "p1", "Player One");
  const result = takeSeat(joined, "p1", 2);

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.room.seats[2], {
    seatId: 2,
    playerId: "p1",
    displayName: "Player One",
    connected: true,
    ready: false,
  });
  assert.deepEqual(result.room.eventLog.at(-1), { type: "seatTaken", seatId: 2, playerId: "p1" });
});

test("rejects taking a seat before joining the room", () => {
  const room = createRoom({ id: "room-seat-before-join", seed: "seat-before-join-seed" });

  assert.deepEqual(takeSeat(room, "p1", 0), {
    ok: false,
    reason: "playerNotInRoom",
  });
});

test("rejects seating a player twice", () => {
  const room = takeSeatOk(
    joinPlayer(createRoom({ id: "room-duplicate-seat", seed: "duplicate-seat-seed" }), "p1", "Player One"),
    "p1",
    0,
  );

  assert.deepEqual(takeSeat(room, "p1", 1), {
    ok: false,
    reason: "playerAlreadySeated",
  });
});

test("toggles ready state for a seated player", () => {
  const room = takeSeatOk(joinPlayer(createRoom({ id: "room-ready", seed: "ready-seed" }), "p1", "Player One"), "p1", 0);

  const readyResult = toggleReady(room, "p1");

  assert.equal(readyResult.ok, true);

  if (!readyResult.ok) {
    return;
  }

  assert.equal(readyResult.room.seats[0].ready, true);
  assert.deepEqual(readyResult.room.eventLog.at(-1), {
    type: "readyChanged",
    seatId: 0,
    playerId: "p1",
    ready: true,
  });

  const unreadyResult = toggleReady(readyResult.room, "p1");

  assert.equal(unreadyResult.ok && unreadyResult.room.seats[0].ready, false);
});

test("rejects starting a round before four players are seated", () => {
  const room = readySeat(
    takeSeatOk(joinPlayer(createRoom({ id: "room-short", seed: "short-seed" }), "p1", "Player One"), "p1", 0),
    "p1",
  );

  assert.deepEqual(startRoomRound(room), {
    ok: false,
    reason: "notEnoughPlayers",
  });
});

test("rejects starting a full room before all players are ready", () => {
  const room = seatPlayers(createRoom({ id: "room-not-ready", seed: "not-ready-seed" }));

  assert.deepEqual(startRoomRound(room), {
    ok: false,
    reason: "notAllPlayersReady",
  });
});

test("starts a round after four seated players are ready", () => {
  const room = ["p1", "p2", "p3", "p4"].reduce(
    (nextRoom, playerId) => readySeat(nextRoom, playerId),
    seatPlayers(createRoom({ id: "room-start", seed: "start-seed" })),
  );

  const result = startRoomRound(room);

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.room.status, "dingque");
  assert.equal(result.room.round?.seed, "start-seed");
  assert.equal(result.room.round?.players.length, 4);
  assert.equal(result.room.round?.players[0].hand.length, 14);
  assert.equal(result.room.round?.players[1].hand.length, 13);
  assert.deepEqual(result.room.eventLog.at(-1), { type: "roundStarted", seed: "start-seed", dealer: 0 });
});

test("redacts other players' hands in client-visible room state", () => {
  const room = startReadyRoom();
  const visible = toClientVisibleRoomState(room, "p2");

  assert.equal(visible.localSeatId, 1);
  assert.equal(visible.round?.players[1].hand?.length, 13);
  assert.equal(visible.round?.players[0].hand, null);
  assert.equal(visible.round?.players[0].handCount, 14);
  assert.deepEqual(
    visible.round?.players.map((player) => ({
      id: player.id,
      handIsVisible: player.hand !== null,
      handCount: player.handCount,
    })),
    [
      { id: 0, handIsVisible: false, handCount: 14 },
      { id: 1, handIsVisible: true, handCount: 13 },
      { id: 2, handIsVisible: false, handCount: 13 },
      { id: 3, handIsVisible: false, handCount: 13 },
    ],
  );
});

test("lets a seated player choose their missing suit after the round starts", () => {
  const room = startReadyRoom();
  const result = chooseMissingSuit(room, "p2", "dots");

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.room.round?.players[1].missingSuit, "dots");
  assert.deepEqual(result.room.eventLog.at(-1), {
    type: "missingSuitChosen",
    seatId: 1,
    playerId: "p2",
    suit: "dots",
  });
});

test("draws a tile for the current seated player after dingque is complete", () => {
  const room = readyRoomForPlayerTwoDraw();
  const beforeHandCount = room.round?.players[1].hand.length;
  const beforeWallCount = room.round?.wall.length;
  const result = drawRoomTile(room, "p2");

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.room.round?.players[1].hand.length, (beforeHandCount ?? 0) + 1);
  assert.equal(result.room.round?.wall.length, (beforeWallCount ?? 0) - 1);
  assert.deepEqual(result.room.eventLog.at(-1), { type: "tileDrawn", seatId: 1, playerId: "p2" });

  const visibleToP1 = toClientVisibleRoomState(result.room, "p1");
  const visibleToP2 = toClientVisibleRoomState(result.room, "p2");

  assert.equal(visibleToP1.round?.players[1].hand, null);
  assert.equal(visibleToP1.round?.players[1].handCount, 14);
  assert.equal(visibleToP2.round?.players[1].hand?.length, 14);
});

test("rejects draw before start, before dingque, out of turn, and outside draw phase", () => {
  const waitingRoom = seatPlayers(createRoom({ id: "room-draw-waiting", seed: "draw-waiting-seed" }));

  assert.deepEqual(drawRoomTile(waitingRoom, "p1"), {
    ok: false,
    reason: "roundNotStarted",
  });

  const started = startReadyRoom();

  assert.deepEqual(drawRoomTile(started, "p1"), {
    ok: false,
    reason: "missingSuitNotSet",
  });

  const ready = readyRoomForPlayerTwoDraw();

  assert.deepEqual(drawRoomTile(ready, "p3"), {
    ok: false,
    reason: "notCurrentPlayer",
  });

  assert.deepEqual(drawRoomTile({ ...ready, round: { ...ready.round!, currentPlayer: 0 } }, "p1"), {
    ok: false,
    reason: "notDrawPhase",
  });
});

test("discards a tile for the current seated player after dingque is complete", () => {
  const { room, discard } = readyRoomForDealerDiscard();
  const beforeHandCount = room.round?.players[0].hand.length;
  const result = discardRoomTile(room, "p1", discard);

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.room.round?.players[0].hand.length, (beforeHandCount ?? 0) - 1);
  assert.equal(result.room.round?.players[0].discards.length, 1);
  assert.equal(result.room.round?.currentPlayer, 1);
  assert.deepEqual(result.room.eventLog.at(-2), {
    type: "tileDiscarded",
    seatId: 0,
    playerId: "p1",
    tile: discard,
  });
  assert.deepEqual(result.room.eventLog.at(-1), {
    type: "claimWindowOpened",
    discardedBySeatId: 0,
    tile: discard,
    pendingPlayerIds: [1, 2, 3],
  });
  assert.equal(result.room.claimWindow?.nextPlayer, 1);

  const visibleToP1 = toClientVisibleRoomState(result.room, "p1");
  const visibleToP2 = toClientVisibleRoomState(result.room, "p2");

  assert.equal(visibleToP1.round?.players[0].hand?.length, 13);
  assert.equal(visibleToP2.round?.players[0].hand, null);
  assert.equal(visibleToP2.round?.players[0].handCount, 13);
  assert.deepEqual(visibleToP2.round?.players[0].discards, [discard]);
  assert.equal(visibleToP2.claimWindow?.pendingPlayerIds.length, 3);
});

test("rejects discard before start, before dingque, out of turn, and outside discard phase", () => {
  const waitingRoom = seatPlayers(createRoom({ id: "room-discard-waiting", seed: "discard-waiting-seed" }));
  const tile: Tile = { suit: "characters", rank: 5 };

  assert.deepEqual(discardRoomTile(waitingRoom, "p1", tile), {
    ok: false,
    reason: "roundNotStarted",
  });

  const started = startReadyRoom();
  const startedTile = started.round!.players[0].hand.find((value) => !isYaoJi(value))!;

  assert.deepEqual(discardRoomTile(started, "p1", startedTile), {
    ok: false,
    reason: "missingSuitNotSet",
  });

  const { room, discard } = readyRoomForDealerDiscard();

  assert.deepEqual(discardRoomTile(room, "p2", discard), {
    ok: false,
    reason: "notCurrentPlayer",
  });

  assert.deepEqual(discardRoomTile({ ...room, round: { ...room.round!, currentPlayer: 1 } }, "p2", discard), {
    ok: false,
    reason: "notDiscardPhase",
  });
});

test("closes the claim window after all eligible players pass", () => {
  const { room, discard } = readyRoomForDealerDiscard();
  const discarded = discardRoomTile(room, "p1", discard);

  assert.equal(discarded.ok, true);

  if (!discarded.ok) {
    return;
  }

  const playerTwoPassed = passClaim(discarded.room, "p2");
  assert.equal(playerTwoPassed.ok, true);

  if (!playerTwoPassed.ok) {
    return;
  }

  assert.deepEqual(playerTwoPassed.room.claimWindow?.passedPlayerIds, [1]);

  const playerThreePassed = passClaim(playerTwoPassed.room, "p3");
  assert.equal(playerThreePassed.ok, true);

  if (!playerThreePassed.ok) {
    return;
  }

  const playerFourPassed = passClaim(playerThreePassed.room, "p4");
  assert.equal(playerFourPassed.ok, true);

  if (!playerFourPassed.ok) {
    return;
  }

  assert.equal(playerFourPassed.room.claimWindow, null);
  assert.deepEqual(playerFourPassed.room.eventLog.at(-1), {
    type: "claimWindowClosed",
    reason: "allPassed",
    nextPlayer: 1,
  });
});

test("lets a player claim discard hu from the claim window", () => {
  const { room, discard } = readyRoomForClaimHu();
  const discarded = discardRoomTile(room, "p1", discard);

  assert.equal(discarded.ok, true);

  if (!discarded.ok) {
    return;
  }

  const claimed = claimHu(discarded.room, "p2");
  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  assert.equal(claimed.room.round?.players[1].hasWon, true);
  assert.equal(claimed.room.claimWindow?.huClaims[0].seatId, 1);
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "huClaimed",
    seatId: 1,
    playerId: "p2",
    tile: discard,
    patterns: ["pingHu", "wuJi", "qingYiSe"],
    points: 16,
  });
});

test("continues blood battle by skipping a player who claimed discard hu", () => {
  const { room, discard } = readyRoomForClaimHu();
  const discarded = discardRoomTile(room, "p1", discard);

  assert.equal(discarded.ok, true);

  if (!discarded.ok) {
    return;
  }

  const claimed = claimHu(discarded.room, "p2");
  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  const playerThreePassed = passClaim(claimed.room, "p3");
  assert.equal(playerThreePassed.ok, true);

  if (!playerThreePassed.ok) {
    return;
  }

  const playerFourPassed = passClaim(playerThreePassed.room, "p4");
  assert.equal(playerFourPassed.ok, true);

  if (!playerFourPassed.ok) {
    return;
  }

  assert.equal(playerFourPassed.room.round?.players[1].hasWon, true);
  assert.equal(playerFourPassed.room.claimWindow, null);
  assert.equal(playerFourPassed.room.round?.currentPlayer, 2);
});

test("keeps hu priority over peng while a hu-capable player is unresolved", () => {
  const { room, discard } = readyRoomForHuPriority();
  const discarded = discardRoomTile(room, "p1", discard);

  assert.equal(discarded.ok, true);

  if (!discarded.ok) {
    return;
  }

  assert.deepEqual(claimPeng(discarded.room, "p3"), {
    ok: false,
    reason: "cannotPeng",
  });
});

test("records multiple discard hu claims before closing the claim window", () => {
  const { room, discard } = readyRoomForMultiHu();
  const discarded = discardRoomTile(room, "p1", discard);

  assert.equal(discarded.ok, true);

  if (!discarded.ok) {
    return;
  }

  const playerTwoClaimed = claimHu(discarded.room, "p2");
  assert.equal(playerTwoClaimed.ok, true);

  if (!playerTwoClaimed.ok) {
    return;
  }

  const playerThreeClaimed = claimHu(playerTwoClaimed.room, "p3");
  assert.equal(playerThreeClaimed.ok, true);

  if (!playerThreeClaimed.ok) {
    return;
  }

  assert.deepEqual(playerThreeClaimed.room.claimWindow?.huClaims.map((claim) => claim.seatId), [1, 2]);

  const playerFourPassed = passClaim(playerThreeClaimed.room, "p4");
  assert.equal(playerFourPassed.ok, true);

  if (!playerFourPassed.ok) {
    return;
  }

  assert.equal(playerFourPassed.room.claimWindow, null);
  assert.equal(playerFourPassed.room.round?.players[1].hasWon, true);
  assert.equal(playerFourPassed.room.round?.players[2].hasWon, true);
  assert.equal(playerFourPassed.room.round?.currentPlayer, 3);
});

test("lets the current player claim self-draw hu and keeps the round moving", () => {
  const room = readyRoomForSelfDrawHu();
  const claimed = claimSelfDrawHu(room, "p1");

  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  assert.equal(claimed.room.round?.players[0].hasWon, true);
  assert.equal(claimed.room.round?.currentPlayer, 1);
  assert.equal(claimed.room.roundEnd, null);
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "selfDrawHuClaimed",
    seatId: 0,
    playerId: "p1",
    patterns: ["pingHu"],
    points: 2,
  });
});

test("marks wall-empty round end with cha jiao placeholder results", () => {
  const room = readyRoomForSelfDrawHu();
  const roomWithEmptyWall: RoomState = {
    ...room,
    round: {
      ...room.round!,
      wall: [],
    },
  };
  const claimed = claimSelfDrawHu(roomWithEmptyWall, "p1");

  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  assert.equal(claimed.room.roundEnd?.reason, "wallEmpty");
  assert.equal(claimed.room.chaJiao?.reason, "wallEmpty");
  assert.deepEqual(claimed.room.chaJiao?.players.map((player) => player.seatId), [1, 2, 3]);
  assert.equal(claimed.room.chaJiao?.players.every((player) => typeof player.isListening === "boolean"), true);
});
test("lets a player claim peng from the claim window", () => {
  const { room, discard } = readyRoomForPengOnly();
  const discarded = discardRoomTile(room, "p1", discard);

  assert.equal(discarded.ok, true);

  if (!discarded.ok) {
    return;
  }

  const claimed = claimPeng(discarded.room, "p2");
  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  assert.equal(claimed.room.claimWindow, null);
  assert.equal(claimed.room.round?.currentPlayer, 1);
  assert.equal(claimed.room.round?.players[0].discards.length, 0);
  assert.equal(claimed.room.round?.players[1].hand.length, 11);
  assert.deepEqual(claimed.room.round?.players[1].melds, [
    {
      type: "peng",
      tile: discard,
      tiles: [tile("characters", 9), tile("characters", 9), discard],
      fromPlayer: 0,
    },
  ]);
  assert.deepEqual(claimed.room.eventLog.at(-2), {
    type: "pengClaimed",
    seatId: 1,
    playerId: "p2",
    tile: discard,
    usedTiles: [tile("characters", 9), tile("characters", 9)],
  });
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "claimWindowClosed",
    reason: "claimed",
    nextPlayer: 1,
  });
});

test("lets a player claim ming gang from the claim window", () => {
  const { room, discard } = readyRoomForClaimMingGang();
  const discarded = discardRoomTile(room, "p1", discard);

  assert.equal(discarded.ok, true);

  if (!discarded.ok) {
    return;
  }

  const claimed = claimMingGang(discarded.room, "p2");
  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  assert.equal(claimed.room.claimWindow, null);
  assert.equal(claimed.room.round?.currentPlayer, 1);
  assert.equal(claimed.room.round?.players[0].discards.length, 0);
  assert.equal(claimed.room.round?.players[1].hand.length, 10);
  assert.deepEqual(claimed.room.round?.players[1].melds, [
    {
      type: "mingGang",
      tile: discard,
      tiles: [tile("characters", 9), tile("characters", 9), tile("characters", 9), discard],
      fromPlayer: 0,
    },
  ]);
  assert.deepEqual(claimed.room.eventLog.at(-2), {
    type: "mingGangClaimed",
    seatId: 1,
    playerId: "p2",
    tile: discard,
    usedTiles: [tile("characters", 9), tile("characters", 9), tile("characters", 9)],
  });
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "claimWindowClosed",
    reason: "claimed",
    nextPlayer: 1,
  });
});

test("lets the current player claim an gang after drawing", () => {
  const gangTile = tile("characters", 9);
  const room = readyRoomForActiveGang({
    hand: [
      gangTile,
      gangTile,
      gangTile,
      gangTile,
      tile("characters", 2),
      tile("characters", 3),
      tile("characters", 4),
      tile("dots", 2),
      tile("dots", 3),
      tile("dots", 4),
      tile("bamboos", 2),
      tile("bamboos", 3),
      tile("bamboos", 4),
      tile("characters", 5),
    ],
    melds: [],
  });

  const claimed = claimAnGang(room, "p1", gangTile);
  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  assert.equal(claimed.room.round?.players[0].hand.length, 10);
  assert.deepEqual(claimed.room.round?.players[0].melds, [
    {
      type: "anGang",
      tile: gangTile,
      tiles: [gangTile, gangTile, gangTile, gangTile],
      fromPlayer: null,
    },
  ]);
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "anGangClaimed",
    seatId: 0,
    playerId: "p1",
    tile: gangTile,
    usedTiles: [gangTile, gangTile, gangTile, gangTile],
  });
});

test("lets the current gang player draw a replacement tile", () => {
  const gangTile = tile("characters", 9);
  const room = readyRoomForActiveGang({
    hand: [
      gangTile,
      gangTile,
      gangTile,
      gangTile,
      tile("characters", 2),
      tile("characters", 3),
      tile("characters", 4),
      tile("dots", 2),
      tile("dots", 3),
      tile("dots", 4),
      tile("bamboos", 2),
      tile("bamboos", 3),
      tile("bamboos", 4),
      tile("characters", 5),
    ],
    melds: [],
  });
  const claimed = claimAnGang(room, "p1", gangTile);

  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  const beforeHandCount = claimed.room.round?.players[0].hand.length ?? 0;
  const beforeWallCount = claimed.room.round?.wall.length ?? 0;
  const drawn = drawGangTile(claimed.room, "p1");

  assert.equal(drawn.ok, true);

  if (!drawn.ok) {
    return;
  }

  assert.equal(drawn.room.gangDraw, null);
  assert.equal(drawn.room.round?.players[0].hand.length, beforeHandCount + 1);
  assert.equal(drawn.room.round?.wall.length, beforeWallCount - 1);
  assert.deepEqual(drawn.room.eventLog.at(-1), {
    type: "gangTileDrawn",
    seatId: 0,
    playerId: "p1",
    gangType: "anGang",
  });
});

test("lets the current player claim ba gang from an existing peng meld", () => {
  const gangTile = tile("characters", 9);
  const room = readyRoomForActiveGang({
    hand: [
      gangTile,
      tile("characters", 2),
      tile("characters", 3),
      tile("characters", 4),
      tile("characters", 5),
      tile("characters", 6),
      tile("characters", 7),
      tile("dots", 2),
      tile("dots", 3),
      tile("dots", 4),
      tile("bamboos", 2),
      tile("bamboos", 3),
      tile("bamboos", 4),
      tile("characters", 8),
    ],
    melds: [{ type: "peng", tile: gangTile, tiles: [gangTile, gangTile, gangTile], fromPlayer: 2 }],
  });

  const claimed = claimBaGang(room, "p1", gangTile);
  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  assert.equal(claimed.room.round?.players[0].hand.length, 13);
  assert.deepEqual(claimed.room.round?.players[0].melds, [
    {
      type: "baGang",
      tile: gangTile,
      tiles: [gangTile, gangTile, gangTile, gangTile],
      fromPlayer: 2,
    },
  ]);
  assert.deepEqual(claimed.room.baGangClaimWindow, {
    upgradedBySeatId: 0,
    upgradedByPlayerId: "p1",
    tile: gangTile,
    pendingPlayerIds: [1, 2, 3],
    passedPlayerIds: [],
    huClaims: [],
  });
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "baGangClaimed",
    seatId: 0,
    playerId: "p1",
    tile: gangTile,
    usedTiles: [gangTile],
  });
});

test("rejects choosing missing suit before start, without a seat, or twice", () => {
  const waitingRoom = seatPlayers(createRoom({ id: "room-missing-waiting", seed: "missing-waiting-seed" }));

  assert.deepEqual(chooseMissingSuit(waitingRoom, "p1", "dots"), {
    ok: false,
    reason: "roundNotStarted",
  });

  const room = startReadyRoom();

  assert.deepEqual(chooseMissingSuit(room, "missing-player", "dots"), {
    ok: false,
    reason: "playerNotSeated",
  });

  const chosen = chooseMissingSuit(room, "p1", "bamboos");

  assert.equal(chosen.ok, true);

  if (!chosen.ok) {
    return;
  }

  assert.deepEqual(chooseMissingSuit(chosen.room, "p1", "dots"), {
    ok: false,
    reason: "missingSuitAlreadyChosen",
  });
});

test("rejects room mutations after the round has started", () => {
  const room = startReadyRoom();

  assert.deepEqual(joinRoom(room, { playerId: "p5", displayName: "Player Five" }), {
    ok: false,
    reason: "roomAlreadyStarted",
  });
  assert.deepEqual(takeSeat(room, "p1", 0), {
    ok: false,
    reason: "roomAlreadyStarted",
  });
  assert.deepEqual(toggleReady(room, "p1"), {
    ok: false,
    reason: "roomAlreadyStarted",
  });
  assert.deepEqual(startRoomRound(room), {
    ok: false,
    reason: "roomAlreadyStarted",
  });
});

function startReadyRoom(): RoomState {
  const room = ["p1", "p2", "p3", "p4"].reduce(
    (nextRoom, playerId) => readySeat(nextRoom, playerId),
    seatPlayers(createRoom({ id: "room-visible", seed: "visible-seed" })),
  );
  const result = startRoomRound(room);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.room;
}

function readyRoomForPlayerTwoDraw(): RoomState {
  const room = ["p1", "p2", "p3", "p4"].reduce((nextRoom, playerId, index) => {
    const suits = ["bamboos", "dots", "characters", "bamboos"] as const;
    const result = chooseMissingSuit(nextRoom, playerId, suits[index]);

    if (!result.ok) {
      throw new Error(result.reason);
    }

    return result.room;
  }, startReadyRoom());

  return {
    ...room,
    round: {
      ...room.round!,
      currentPlayer: 1,
    },
  };
}

function readyRoomForDealerDiscard(): { room: RoomState; discard: Tile } {
  const started = startReadyRoom();
  const discard = findDiscardCandidate(started.round!.players[0].hand);
  const suits: Suit[] = [discard.suit, "dots", "characters", "bamboos"];
  const room = ["p1", "p2", "p3", "p4"].reduce((nextRoom, playerId, index) => {
    const result = chooseMissingSuit(nextRoom, playerId, suits[index]);

    if (!result.ok) {
      throw new Error(result.reason);
    }

    return result.room;
  }, started);

  return { room, discard };
}

function readyRoomForClaimHu(): { room: RoomState; discard: Tile } {
  const started = startReadyRoom();
  const discard = tile("characters", 9);

  return {
    discard,
    room: {
      ...started,
      round: {
        ...started.round!,
        currentPlayer: 0,
        players: started.round!.players.map((player) => {
          if (player.id === 0) {
            return {
              ...player,
              missingSuit: "characters",
              hand: [
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
                tile("bamboos", 3),
                tile("bamboos", 4),
              ],
            };
          }

          if (player.id === 1) {
            return {
              ...player,
              missingSuit: "bamboos",
              hand: [
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
              ],
            };
          }

          return { ...player, missingSuit: "dots" };
        }),
      },
    },
  };
}

function readyRoomForHuPriority(): { room: RoomState; discard: Tile } {
  const prepared = readyRoomForClaimHu();

  return {
    ...prepared,
    room: {
      ...prepared.room,
      round: {
        ...prepared.room.round!,
        players: prepared.room.round!.players.map((player) =>
          player.id === 2
            ? {
                ...player,
                missingSuit: "bamboos",
                hand: [
                  tile("characters", 9),
                  tile("characters", 9),
                  tile("characters", 2),
                  tile("characters", 3),
                  tile("characters", 4),
                  tile("characters", 5),
                  tile("characters", 6),
                  tile("characters", 7),
                  tile("dots", 2),
                  tile("dots", 3),
                  tile("dots", 4),
                  tile("bamboos", 2),
                  tile("bamboos", 3),
                ],
              }
            : player,
        ),
      },
    },
  };
}

function readyRoomForPengOnly(): { room: RoomState; discard: Tile } {
  const prepared = readyRoomForClaimHu();

  return {
    ...prepared,
    room: {
      ...prepared.room,
      round: {
        ...prepared.room.round!,
        players: prepared.room.round!.players.map((player) =>
          player.id === 1
            ? {
                ...player,
                missingSuit: "bamboos",
                hand: [
                  tile("characters", 9),
                  tile("characters", 9),
                  tile("characters", 2),
                  tile("characters", 4),
                  tile("characters", 6),
                  tile("characters", 8),
                  tile("dots", 2),
                  tile("dots", 4),
                  tile("dots", 6),
                  tile("dots", 8),
                  tile("bamboos", 2),
                  tile("bamboos", 3),
                  tile("bamboos", 4),
                ],
              }
            : player,
        ),
      },
    },
  };
}

function readyRoomForMultiHu(): { room: RoomState; discard: Tile } {
  const prepared = readyRoomForClaimHu();
  const playerTwo = prepared.room.round!.players[1];

  return {
    ...prepared,
    room: {
      ...prepared.room,
      round: {
        ...prepared.room.round!,
        players: prepared.room.round!.players.map((player) =>
          player.id === 2
            ? {
                ...player,
                missingSuit: playerTwo.missingSuit,
                hand: playerTwo.hand,
              }
            : player,
        ),
      },
    },
  };
}

function readyRoomForClaimMingGang(): { room: RoomState; discard: Tile } {
  const prepared = readyRoomForClaimHu();

  return {
    ...prepared,
    room: {
      ...prepared.room,
      round: {
        ...prepared.room.round!,
        players: prepared.room.round!.players.map((player) =>
          player.id === 1
            ? {
                ...player,
                hand: [
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
                  tile("characters", 9),
                  tile("characters", 9),
                  tile("characters", 9),
                ],
              }
            : player,
        ),
      },
    },
  };
}

function readyRoomForSelfDrawHu(): RoomState {
  const started = startReadyRoom();

  return {
    ...started,
    round: {
      ...started.round!,
      currentPlayer: 0,
      players: started.round!.players.map((player) =>
        player.id === 0
          ? {
              ...player,
              missingSuit: "bamboos",
              hand: [
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
              ],
            }
          : { ...player, missingSuit: "dots" },
      ),
    },
  };
}

function readyRoomForActiveGang(input: {
  hand: Tile[];
  melds: NonNullable<RoomState["round"]>["players"][number]["melds"];
}): RoomState {
  const started = startReadyRoom();

  return {
    ...started,
    round: {
      ...started.round!,
      currentPlayer: 0,
      players: started.round!.players.map((player) =>
        player.id === 0
          ? { ...player, hand: input.hand, melds: input.melds, missingSuit: "bamboos" }
          : { ...player, missingSuit: "dots" },
      ),
    },
  };
}

function findDiscardCandidate(hand: Tile[]): Tile {
  const tile = hand.find((value) => !isYaoJi(value));

  if (tile === undefined) {
    throw new Error("Expected at least one non-yao-ji discard candidate.");
  }

  return tile;
}

function isYaoJi(tile: Tile): boolean {
  return tile.rank === 1 && (tile.suit === "bamboos" || tile.suit === "dots");
}

function seatPlayers(room: RoomState): RoomState {
  return [
    ["p1", "Player One"],
    ["p2", "Player Two"],
    ["p3", "Player Three"],
    ["p4", "Player Four"],
  ].reduce((nextRoom, [playerId, displayName], index) => {
    const joined = joinPlayer(nextRoom, playerId, displayName);
    return takeSeatOk(joined, playerId, index as 0 | 1 | 2 | 3);
  }, room);
}

function joinPlayer(room: RoomState, playerId: string, displayName: string): RoomState {
  const result = joinRoom(room, { playerId, displayName });

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.room;
}

function takeSeatOk(room: RoomState, playerId: string, seatId: 0 | 1 | 2 | 3): RoomState {
  const result = takeSeat(room, playerId, seatId);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.room;
}

function readySeat(room: RoomState, playerId: string): RoomState {
  const result = toggleReady(room, playerId);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.room;
}
