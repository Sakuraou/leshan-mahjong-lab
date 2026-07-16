import test from "node:test";
import assert from "node:assert/strict";

import {
  createRoom,
  detectHeavenlyMissingSuit,
  claimAnGang,
  claimBaGang,
  claimHu,
  claimMingGang,
  claimPeng,
  claimQiangGangHu,
  claimSelfDrawHu,
  chooseMissingSuit,
  drawGangTile,
  discardRoomTile,
  drawRoomTile,
  exchangeGangYaoJi,
  expireClaimWindow,
  finishGame,
  handleRoomAction,
  passClaim,
  passQiangGang,
  readyNextRound,
  joinRoom,
  settleRoundChickenPayments,
  settleRoundChaJiaoPayments,
  settleRoundGangPayments,
  startRoomRound,
  startNextRound,
  takeSeat,
  tile,
  tickRoomStateDeadlines,
  toggleReady,
  toClientVisibleRoomState,
  type RoomState,
  type RoomServiceState,
  type ChaJiaoSettlementEntry,
  type ChickenSettlementEntry,
  type ClaimedWinningTile,
  type GangSettlementEntry,
  type Meld,
  type PhysicalTile,
  type PlayerId,
  type QiangGangSanJiLiabilityEntry,
  type Suit,
  type Tile,
} from "../../src/game/index.ts";

test("detects exactly one heavenly missing suit while ignoring yao ji", () => {
  assert.equal(detectHeavenlyMissingSuit([
    tile("bamboos", 1),
    tile("dots", 2),
    tile("characters", 3),
  ]), "bamboos");
  assert.equal(detectHeavenlyMissingSuit([
    tile("dots", 1),
    tile("bamboos", 2),
    tile("characters", 3),
  ]), "dots");
  assert.equal(detectHeavenlyMissingSuit([
    tile("characters", 1),
    tile("dots", 2),
    tile("bamboos", 3),
  ]), null);
  assert.equal(detectHeavenlyMissingSuit([
    tile("characters", 2),
    tile("characters", 3),
  ]), null);
});

test("auto-chooses heavenly missing suits immediately after dealing", () => {
  const readyRoom = ["p1", "p2", "p3", "p4"].reduce(
    (room, playerId) => readySeat(room, playerId),
    seatPlayers(createRoom({ id: "room-heavenly", seed: "tianque-46" })),
  );
  const started = startRoomRound(readyRoom, 0);
  assert.equal(started.ok, true);
  if (!started.ok || started.room.round === null) return;

  const expected = started.room.round.players.map((player) => detectHeavenlyMissingSuit(player.hand));
  assert.deepEqual(started.room.round.players.map((player) => player.missingSuit), expected);
  assert.equal(expected.some((suit) => suit !== null), true);
  assert.equal(expected.some((suit) => suit === null), true);

  const automaticEvents = started.room.eventLog.filter(
    (event) => event.type === "missingSuitChosen" && event.source === "heavenly",
  );
  assert.equal(automaticEvents.length, expected.filter((suit) => suit !== null).length);
  assert.equal(started.room.phase, "dingque");
});

test("creates a waiting room with four empty seats", () => {
  const room = createRoom({ id: "room-001", seed: "room-seed" });

  assert.equal(room.id, "room-001");
  assert.equal(room.seed, "room-seed");
  assert.equal(room.status, "waiting");
  assert.equal(room.phase, null);
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
  assert.equal(result.room.phase, "dingque");
  assert.equal(result.room.round?.seed, "start-seed");
  assert.equal(result.room.round?.players.length, 4);
  assert.equal(result.room.round?.players[0].hand.length, 14);
  assert.equal(result.room.round?.players[1].hand.length, 13);
  assert.deepEqual(result.room.eventLog.at(-1), { type: "roundStarted", dealer: 0 });
});

test("chooses the first formally settled winner as next dealer", () => {
  const ended = finishSingleDiscardHuRound();

  assert.equal(ended.gameStatus, "betweenRounds");
  assert.equal(ended.firstWinnerSeatId, 1);
  assert.deepEqual(ended.nextDealerDecision, {
    roundId: `${ended.id}:round:1`,
    completedRoundNumber: 1,
    nextDealerSeatId: 1,
    reason: "firstWinner",
    firstWinnerSeatId: 1,
    multipleHuDiscarderSeatId: null,
  });
});

test("makes an ordinary multi-hu discarder next dealer regardless of winner order", () => {
  const prepared = readyRoomForMultiHu();
  const activeRoom: RoomState = {
    ...prepared.room,
    round: {
      ...prepared.room.round!,
      players: prepared.room.round!.players.map((player) =>
        player.id === 3 ? { ...player, hasWon: true } : player,
      ),
    },
  };
  const discarded = discardRoomTile(activeRoom, "p1", prepared.discard);
  assert.equal(discarded.ok, true);
  if (!discarded.ok) return;
  const firstClaim = claimHu(discarded.room, "p2");
  assert.equal(firstClaim.ok, true);
  if (!firstClaim.ok) return;
  const resolved = claimHu(firstClaim.room, "p3");
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;

  assert.equal(resolved.room.firstWinnerSeatId, 1);
  assert.equal(resolved.room.nextDealerDecision?.reason, "multipleHuDiscarder");
  assert.equal(resolved.room.nextDealerDecision?.nextDealerSeatId, 0);
});

test("makes the robbed ba-gang declarer next dealer even after an earlier winner", () => {
  const prepared = readyRoomForQiangGangHu([1], [2, 3]);
  const roomWithEarlierWinner: RoomState = {
    ...prepared.room,
    firstWinnerSeatId: 2,
    huOutcomeFacts: [{
      roundId: `${prepared.room.id}:round:1`,
      outcomeId: "earlier-self-draw",
      method: "selfDraw",
      winnerSeatIds: [2],
      responsibleSeatId: null,
    }],
  };
  const declared = claimBaGang(roomWithEarlierWinner, "p1", prepared.gangTile);
  assert.equal(declared.ok, true);
  if (!declared.ok) return;
  const robbed = claimQiangGangHu(declared.room, "p2");
  assert.equal(robbed.ok, true);
  if (!robbed.ok) return;

  assert.equal(robbed.room.nextDealerDecision?.reason, "qiangGangDeclarer");
  assert.equal(robbed.room.nextDealerDecision?.nextDealerSeatId, 0);
  assert.equal(robbed.room.nextDealerDecision?.firstWinnerSeatId, 2);
});

test("keeps the current dealer after a wall-empty round with no winner", () => {
  const prepared = readyRoomForClaimHu();
  const roomWithEmptyWall: RoomState = {
    ...prepared.room,
    round: { ...prepared.room.round!, wall: [] },
  };
  const discarded = discardRoomTile(roomWithEmptyWall, "p1", prepared.discard);
  assert.equal(discarded.ok, true);
  if (!discarded.ok) return;

  let resolved = discarded.room;
  for (const playerId of ["p2", "p3", "p4"]) {
    const passed = passClaim(resolved, playerId);
    assert.equal(passed.ok, true);
    if (!passed.ok) return;
    resolved = passed.room;
  }

  assert.equal(resolved.roundEnd?.reason, "wallEmpty");
  assert.equal(resolved.nextDealerDecision?.reason, "wallEmptyDealerKeeps");
  assert.equal(resolved.nextDealerDecision?.nextDealerSeatId, 0);
});

test("requires four fresh ready states and preserves cumulative scores for the next round", () => {
  const ended = finishSingleDiscardHuRound();
  const firstRoundScores = ended.scores.map((score) => score.points);
  const notReady = startNextRound(ended);
  assert.deepEqual(notReady, { ok: false, reason: "notAllPlayersReady" });

  let readyRoom = ended;
  for (const playerId of ["p1", "p2", "p3", "p4"]) {
    const ready = readyNextRound(readyRoom, playerId);
    assert.equal(ready.ok, true);
    if (!ready.ok) return;
    readyRoom = ready.room;
  }
  const started = startNextRound(readyRoom);
  assert.equal(started.ok, true);
  if (!started.ok) return;

  assert.equal(started.room.roundNumber, 2);
  assert.equal(started.room.currentDealer, 1);
  assert.deepEqual(started.room.scores.map((score) => score.points), firstRoundScores);
  assert.deepEqual(started.room.roundStartScores.map((score) => score.points), firstRoundScores);
  assert.equal(started.room.roundHistory.length, 1);
  assert.deepEqual(started.room.settlementLedger, []);
});

test("lets any member finish between rounds and keeps the final result idempotent", () => {
  const playing = startReadyRoom();
  assert.deepEqual(finishGame(playing, "p2"), { ok: false, reason: "roundNotFinished" });

  const ended = finishSingleDiscardHuRound();
  const finished = finishGame(ended, "p4");
  assert.equal(finished.ok, true);
  if (!finished.ok) return;
  assert.equal(finished.room.gameStatus, "finished");
  assert.equal(finished.room.gameEnd?.finishedByPlayerId, "p4");
  assert.equal(finished.room.gameEnd?.completedRoundCount, 1);

  const repeated = finishGame(finished.room, "p1");
  assert.equal(repeated.ok, true);
  if (!repeated.ok) return;
  assert.deepEqual(repeated.room.gameEnd, finished.room.gameEnd);
  assert.deepEqual(repeated.room.scores, finished.room.scores);
});

test("redacts other players' hands in client-visible room state", () => {
  const room = startReadyRoom();
  const visible = toClientVisibleRoomState(room, "p2");

  assert.equal(visible.localSeatId, 1);
  assert.equal(visible.round?.players[1].hand?.length, 13);
  assert.equal(visible.round?.players[0].hand, null);
  assert.equal(visible.round?.players[0].handCount, 14);
  assert.equal(visible.round === null ? false : "seed" in visible.round, false);
  assert.equal(visible.round === null ? false : "wall" in visible.round, false);
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

test("moves from dingque to the dealer discard phase after the final choice", () => {
  const { room } = readyRoomForDealerDiscard();
  const dealerView = toClientVisibleRoomState(room, "p1");
  const nextPlayerView = toClientVisibleRoomState(room, "p2");

  assert.equal(room.status, "playing");
  assert.equal(room.phase, "discard");
  assert.deepEqual(dealerView.legalActions.includes("discardTile"), true);
  assert.deepEqual(nextPlayerView.legalActions, []);
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
  assert.equal(room.phase, "draw");
  assert.equal(result.room.phase, "discard");
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

  assert.deepEqual(drawRoomTile({ ...ready, phase: "discard", round: { ...ready.round!, currentPlayer: 0 } }, "p1"), {
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
    pendingResponderCount: 3,
  });
  assert.equal(result.room.claimWindow?.nextPlayer, 1);
  assert.equal(result.room.phase, "claim");

  const visibleToP1 = toClientVisibleRoomState(result.room, "p1");
  const visibleToP2 = toClientVisibleRoomState(result.room, "p2");

  assert.equal(visibleToP1.round?.players[0].hand?.length, 13);
  assert.equal(visibleToP2.round?.players[0].hand, null);
  assert.equal(visibleToP2.round?.players[0].handCount, 13);
  assert.deepEqual(visibleToP2.round?.players[0].discards, [{ suit: discard.suit, rank: discard.rank }]);
  assert.equal(visibleToP2.claimWindow?.pendingResponderCount, 3);
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

  assert.deepEqual(discardRoomTile({ ...room, phase: "draw", round: { ...room.round!, currentPlayer: 1 } }, "p2", discard), {
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
  assert.equal(playerFourPassed.room.phase, "draw");
  assert.deepEqual(toClientVisibleRoomState(playerFourPassed.room, "p2").legalActions, ["drawTile"]);
  assert.deepEqual(playerFourPassed.room.eventLog.at(-1), {
    type: "claimWindowClosed",
    reason: "allPassed",
    nextPlayer: 1,
  });
});

test("expires an unanswered discard window at the injected deadline and remains idempotent", () => {
  const { room, discard } = readyRoomForDealerDiscard();
  const discarded = discardRoomTile(room, "p1", discard, { now: 100_000, timeoutMs: 8_000 });
  assert.equal(discarded.ok, true);
  if (!discarded.ok) return;

  const windowId = discarded.room.claimWindow?.windowId;
  assert.ok(windowId);
  assert.equal(discarded.room.claimWindow?.deadlineAt, 108_000);
  assert.deepEqual(toClientVisibleRoomState(discarded.room, "p2", 100_500).responseWindow, {
    windowId,
    kind: "discardClaim",
    deadlineAt: 108_000,
    remainingMs: 7_500,
    status: "open",
    pendingResponderCount: 3,
    hasRespondedByMe: false,
    responseByMe: null,
  });

  const early = tickRoomStateDeadlines(discarded.room, 107_999);
  assert.equal(early.changed, false);
  assert.equal(early.room, discarded.room);
  assert.deepEqual(expireClaimWindow(discarded.room, "stale-window", 108_000), {
    ok: false,
    reason: "windowMismatch",
  });

  const expired = tickRoomStateDeadlines(discarded.room, 108_000);
  assert.equal(expired.changed, true);
  assert.equal(expired.expiredWindowId, windowId);
  assert.equal(expired.room.claimWindow, null);
  assert.equal(expired.room.phase, "draw");
  assert.equal(expired.room.round?.currentPlayer, 1);
  assert.deepEqual(expired.room.settlementLedger, []);
  assert.equal(expired.room.resolvedWindowIds.includes(windowId), true);
  assert.deepEqual(expired.room.eventLog.at(-2), {
    type: "responseWindowExpired",
    windowId,
    kind: "discardClaim",
    timedOutPlayerIds: [1, 2, 3],
    outcome: "allPassed",
  });

  const repeated = tickRoomStateDeadlines(expired.room, 200_000);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.room, expired.room);
});

test("keeps single and multiple discard hu claims when the remaining players time out", () => {
  for (const winners of [["p2"], ["p2", "p3"]] as const) {
    const prepared = winners.length === 1 ? readyRoomForClaimHu() : readyRoomForMultiHu();
    const discarded = discardRoomTile(prepared.room, "p1", prepared.discard, {
      now: 1_000,
      timeoutMs: 5_000,
    });
    assert.equal(discarded.ok, true);
    if (!discarded.ok) continue;

    const claimed = winners.reduce((nextRoom, winner) => {
      const result = claimHu(nextRoom, winner);
      assert.equal(result.ok, true);
      return result.ok ? result.room : nextRoom;
    }, discarded.room);
    assert.equal(claimed.round?.players.slice(1).every((player) => !player.hasWon), true);
    assert.equal(claimed.eventLog.some((event) => event.type === "huClaimed"), false);
    assert.equal(toClientVisibleRoomState(claimed, "p2").claimWindow?.responseByMe, "hu");
    assert.equal(toClientVisibleRoomState(claimed, "p4").claimWindow?.responseByMe, null);
    const expired = tickRoomStateDeadlines(claimed, 6_000);

    assert.equal(expired.changed, true);
    assert.deepEqual(
      expired.room.scores.map((score) => score.points),
      winners.length === 1 ? [-16, 16, 0, 0] : [-32, 16, 16, 0],
    );
    assert.equal(expired.room.settlementLedger.length, winners.length);
    assert.equal(new Set(expired.room.settlementLedger.map((entry) => entry.batchId)).size, 1);
    assert.equal(expired.room.eventLog.some((event) => event.type === "responseWindowExpired"), true);
  }
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

  assert.equal(claimed.room.round?.players[1].hasWon, false);
  assert.equal(claimed.room.round?.players[1].claimedWinningTile, null);
  assert.equal(claimed.room.claimWindow?.huClaims[0].seatId, 1);
  assert.deepEqual(claimed.room.settlementLedger, []);
  assert.equal(claimed.room.eventLog.some((event) => event.type === "huClaimed"), false);

  const winnerView = toClientVisibleRoomState(claimed.room, "p2");
  const thirdPartyView = toClientVisibleRoomState(claimed.room, "p3");
  assert.deepEqual(winnerView.claimWindow, {
    windowId: discarded.room.claimWindow?.windowId,
    deadlineAt: discarded.room.claimWindow?.deadlineAt,
    status: "open",
    discardedBySeatId: 0,
    discardedByPlayerId: "p1",
    tile: discard,
    pendingResponderCount: 2,
    hasRespondedByMe: true,
    responseByMe: "hu",
  });
  assert.equal(thirdPartyView.claimWindow?.pendingResponderCount, 2);
  assert.equal(thirdPartyView.claimWindow?.hasRespondedByMe, false);
  assert.equal(thirdPartyView.claimWindow?.responseByMe, null);
  assert.equal(thirdPartyView.round?.players[1].hasWon, false);
  assert.equal(JSON.stringify(thirdPartyView).includes("huClaims"), false);
  assert.equal(JSON.stringify(thirdPartyView).includes("passedPlayerIds"), false);
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
  assert.equal(playerFourPassed.room.phase, "draw");
  assert.deepEqual(playerFourPassed.room.scores.map((score) => score.points), [-16, 16, 0, 0]);
  assert.deepEqual(
    playerFourPassed.room.settlementLedger.map((entry) => ({
      winner: entry.winnerSeatId,
      loser: entry.loserSeatId,
      reason: entry.reason,
      base: entry.basePoints,
      raw: entry.rawPoints,
      final: entry.finalPoints,
      event: entry.relatedEvent,
    })),
    [
      {
        winner: 1,
        loser: 0,
        reason: "discardHu",
        base: 1,
        raw: 16,
        final: 16,
        event: { type: "huClaimed", seatId: 1 },
      },
    ],
  );
  const winnerView = toClientVisibleRoomState(playerFourPassed.room, "p2");
  assert.deepEqual(winnerView.scores, playerFourPassed.room.scores);
  assert.deepEqual(winnerView.settlementLedger, playerFourPassed.room.settlementLedger);
  assert.equal(winnerView.round?.players[0].hand, null);
});

test("keeps peng private while a hu-capable player is unresolved and resolves hu first", () => {
  const { room, discard } = readyRoomForHuPriority();
  const discarded = discardRoomTile(room, "p1", discard);

  assert.equal(discarded.ok, true);

  if (!discarded.ok) {
    return;
  }

  const peng = claimPeng(discarded.room, "p3");
  assert.equal(peng.ok, true);
  if (!peng.ok) return;

  assert.equal(peng.room.round?.players[2].melds.length, 0);
  assert.equal(peng.room.eventLog.some((event) => event.type === "pengClaimed"), false);
  assert.equal(toClientVisibleRoomState(peng.room, "p3").claimWindow?.responseByMe, "peng");
  assert.equal(toClientVisibleRoomState(peng.room, "p2").claimWindow?.responseByMe, null);
  assert.equal(toClientVisibleRoomState(peng.room, "p2").legalActions.includes("claimHu"), true);

  const hu = claimHu(peng.room, "p2");
  assert.equal(hu.ok, true);
  if (!hu.ok) return;
  assert.equal(hu.room.claimWindow, null);
  assert.equal(hu.room.round?.players[1].hasWon, true);
  assert.equal(hu.room.round?.players[2].melds.length, 0);
  assert.equal(hu.room.eventLog.some((event) => event.type === "pengClaimed"), false);
  assert.equal(hu.room.eventLog.some((event) => event.type === "huClaimed"), true);
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
  assert.deepEqual(playerFourPassed.room.scores.map((score) => score.points), [-32, 16, 16, 0]);
  assert.equal(new Set(playerFourPassed.room.settlementLedger.map((entry) => entry.batchId)).size, 1);
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
  assert.equal(claimed.room.phase, "draw");
  assert.deepEqual(claimed.room.scores.map((score) => score.points), [6, -2, -2, -2]);
  assert.deepEqual(
    claimed.room.settlementLedger.map((entry) => [entry.winnerSeatId, entry.loserSeatId, entry.finalPoints]),
    [[0, 1, 2], [0, 2, 2], [0, 3, 2]],
  );
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "selfDrawHuClaimed",
    seatId: 0,
    playerId: "p1",
    patterns: ["pingHu"],
    genCount: 0,
    points: 2,
  });
});

test("offers exposed-hand self-draw only after a real draw", () => {
  const room = readyRoomForSelfDrawHu();
  const exposedHand = [
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
  const roomAfterDraw: RoomState = {
    ...room,
    selfDrawEligible: true,
    round: {
      ...room.round!,
      players: room.round!.players.map((player) =>
        player.id === 0
          ? {
              ...player,
              hand: exposedHand,
              melds: [
                {
                  type: "peng",
                  tile: tile("characters", 6),
                  tiles: [tile("characters", 6), tile("characters", 6), tile("characters", 6)],
                  fromPlayer: 1,
                },
              ],
            }
          : player,
      ),
    },
  };

  assert.equal(toClientVisibleRoomState(roomAfterDraw, "p1").legalActions.includes("claimSelfDrawHu"), true);

  const roomAfterPeng = { ...roomAfterDraw, selfDrawEligible: false };
  assert.equal(toClientVisibleRoomState(roomAfterPeng, "p1").legalActions.includes("claimSelfDrawHu"), false);
  assert.deepEqual(claimSelfDrawHu(roomAfterPeng, "p1"), { ok: false, reason: "notDiscardPhase" });
});

test("offers seven-pairs hu without forcing the player to leave the round", () => {
  const baseRoom = readyRoomForSelfDrawHu();
  const winningHand = sevenPairsWinningHand();
  const room: RoomState = {
    ...baseRoom,
    selfDrawEligible: true,
    round: {
      ...baseRoom.round!,
      players: baseRoom.round!.players.map((player) =>
        player.id === 0 ? { ...player, hand: winningHand, missingSuit: "bamboos" } : player,
      ),
    },
  };
  const view = toClientVisibleRoomState(room, "p1");

  assert.equal(view.legalActions.includes("claimSelfDrawHu"), true);
  assert.equal(view.legalActions.includes("discardTile"), true);
  assert.equal(view.round?.players[0].hasWon, false);
  assert.equal(JSON.stringify(view).includes("decomposition"), false);

  const claimed = claimSelfDrawHu(room, "p1");
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "selfDrawHuClaimed",
    seatId: 0,
    playerId: "p1",
    patterns: ["xiaoQiDui", "wuJi", "qingYiSe"],
    genCount: 0,
    points: 64,
  });

  const continued = discardRoomTile(room, "p1", winningHand[0]);
  assert.equal(continued.ok, true);
  if (!continued.ok) return;
  assert.equal(continued.room.round?.players[0].hasWon, false);
  assert.equal(continued.room.phase, "claim");
});

test("lets a seven-pairs discard winner pass and keep playing", () => {
  const baseRoom = readyRoomForSelfDrawHu();
  const room: RoomState = {
    ...baseRoom,
    selfDrawEligible: false,
    round: {
      ...baseRoom.round!,
      players: baseRoom.round!.players.map((player) =>
        player.id === 1
          ? { ...player, hand: sevenPairsListeningHand(), missingSuit: "bamboos" }
          : player,
      ),
    },
  };
  const discarded = discardRoomTile(room, "p1", tile("characters", 7));
  assert.equal(discarded.ok, true);
  if (!discarded.ok) return;

  const responderView = toClientVisibleRoomState(discarded.room, "p2");
  assert.equal(responderView.legalActions.includes("claimHu"), true);
  assert.equal(responderView.legalActions.includes("passClaim"), true);

  const passed = passClaim(discarded.room, "p2");
  assert.equal(passed.ok, true);
  if (!passed.ok) return;
  assert.equal(passed.room.round?.players[1].hasWon, false);
  assert.equal(passed.room.claimWindow?.passedPlayerIds.includes(1), true);
  const responderViewAfterPass = toClientVisibleRoomState(passed.room, "p2");
  const observerViewAfterPass = toClientVisibleRoomState(passed.room, "p3");
  assert.equal(responderViewAfterPass.claimWindow?.responseByMe, "pass");
  assert.equal(observerViewAfterPass.claimWindow?.responseByMe, null);
  assert.equal(observerViewAfterPass.claimWindow?.pendingResponderCount, 2);
});

test("marks wall-empty round end with authoritative cha jiao results", () => {
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
  assert.equal(claimed.room.status, "ended");
  assert.equal(claimed.room.phase, "ended");
  assert.equal(claimed.room.chaJiao?.reason, "wallEmpty");
  assert.deepEqual(claimed.room.chaJiao?.players.map((player) => player.seatId), [1, 2, 3]);
  assert.equal(claimed.room.chaJiao?.players.every((player) => typeof player.isListening === "boolean"), true);
  assert.deepEqual(toClientVisibleRoomState(claimed.room, "p2").legalActions, [
    "readyNextRound",
    "finishGame",
  ]);
});

test("settles one listener against one non-listener at wall empty", () => {
  const ended = endedRoomForChaJiao([
    { hand: notListeningHand() },
    { hand: listeningSixteenHand() },
    { hand: [], hasWon: true },
    { hand: [], hasWon: true },
  ]);
  const entries = chaJiaoEntries(ended);

  assert.deepEqual(ended.scores.map((score) => score.points), [-16, 16, 0, 0]);
  assert.deepEqual(
    entries.map((entry) => [entry.winnerSeatId, entry.loserSeatId, entry.rawPoints, entry.finalPoints]),
    [[1, 0, 16, 16]],
  );
  assert.deepEqual(ended.chaJiao?.players.map((player) => [player.seatId, player.isListening]), [
    [0, false],
    [1, true],
  ]);
});

test("settles every non-listener against every listener", () => {
  const ended = endedRoomForChaJiao([
    { hand: notListeningHand() },
    { hand: notListeningHand() },
    { hand: listeningSixteenHand() },
    { hand: listeningSixteenHand() },
  ]);
  const entries = chaJiaoEntries(ended);

  assert.deepEqual(ended.scores.map((score) => score.points), [-32, -32, 32, 32]);
  assert.deepEqual(
    entries.map((entry) => [entry.winnerSeatId, entry.loserSeatId, entry.finalPoints]),
    [[2, 0, 16], [2, 1, 16], [3, 0, 16], [3, 1, 16]],
  );
  assert.equal(new Set(entries.map((entry) => entry.batchId)).size, 1);
});

test("writes no cha jiao transfers when everyone or no one is listening", () => {
  for (const handFactory of [listeningSixteenHand, notListeningHand]) {
    const ended = endedRoomForChaJiao(
      [0, 1, 2, 3].map(() => ({ hand: handFactory() })),
    );

    assert.deepEqual(ended.scores.map((score) => score.points), [0, 0, 0, 0]);
    assert.deepEqual(chaJiaoEntries(ended), []);
    assert.equal(
      ended.resolvedSettlementIds.filter((value) => value.endsWith(":chaJiao")).length,
      1,
    );
  }
});

test("excludes winners from cha jiao while preserving their earlier hu ledger", () => {
  const won = claimSelfDrawHu(readyRoomForSelfDrawHu(), "p1");
  assert.equal(won.ok, true);
  if (!won.ok) return;
  const originalLedger = won.room.settlementLedger;
  const originalWinnerScore = won.room.scores[0].points;
  const ended = endedRoomForChaJiao([
    {},
    { hand: notListeningHand() },
    { hand: listeningSixteenHand() },
    { hand: notListeningHand() },
  ], won.room);

  assert.equal(ended.scores[0].points, originalWinnerScore);
  assert.deepEqual(ended.settlementLedger.slice(0, originalLedger.length), originalLedger);
  assert.equal(chaJiaoEntries(ended).some((entry) => entry.winnerSeatId === 0 || entry.loserSeatId === 0), false);
  assert.deepEqual(ended.chaJiao?.players.map((player) => player.seatId), [1, 2, 3]);
});

test("caps cha jiao at 64 and keeps the uncapped discard score", () => {
  const ended = endedRoomForChaJiao([
    { hand: notListeningHand() },
    { hand: [tile("characters", 9)], melds: cappedChaJiaoMelds() },
    { hand: [], hasWon: true },
    { hand: [], hasWon: true },
  ]);
  const entry = chaJiaoEntries(ended)[0];

  assert.ok(entry.rawPoints > 64);
  assert.equal(entry.finalPoints, 64);
  assert.deepEqual(ended.scores.map((score) => score.points), [-64, 64, 0, 0]);
  assert.equal(ended.chaJiao?.players.find((player) => player.seatId === 1)?.maxHuPoints, 64);
});

test("uses the highest laizi-assisted discard score for cha jiao", () => {
  const ended = endedRoomForChaJiao([
    { hand: notListeningHand() },
    {
      hand: [
        tile("characters", 2),
        tile("characters", 3),
        tile("characters", 4),
        tile("bamboos", 1),
      ],
      melds: [
        makeTestMeld("peng", tile("characters", 2), 3),
        makeTestMeld("peng", tile("characters", 5), 3),
        makeTestMeld("peng", tile("characters", 8), 3),
      ],
    },
    { hand: [], hasWon: true },
    { hand: [], hasWon: true },
  ]);
  const listener = ended.chaJiao?.players.find((player) => player.seatId === 1);

  assert.equal(listener?.maxHuPoints, 16);
  assert.equal(chaJiaoEntries(ended)[0].finalPoints, 16);
});

test("uses the highest seven-pairs result for cha jiao", () => {
  const ended = endedRoomForChaJiao([
    { hand: notListeningHand() },
    { hand: sevenPairsListeningHand() },
    { hand: [], hasWon: true },
    { hand: [], hasWon: true },
  ]);
  const listener = ended.chaJiao?.players.find((player) => player.seatId === 1);
  const entry = chaJiaoEntries(ended)[0];

  assert.deepEqual(listener?.patterns, ["xiaoQiDui", "wuJi", "qingYiSe"]);
  assert.equal(listener?.genCount, 0);
  assert.equal(listener?.maxHuPoints, 64);
  assert.deepEqual([entry.rawPoints, entry.finalPoints], [64, 64]);
});

test("keeps cha jiao settlement idempotent and private until wall empty", () => {
  const playing = readyRoomForChaJiao([
    { hand: notListeningHand() },
    { hand: listeningSixteenHand() },
    { hand: [], hasWon: true },
    { hand: [], hasWon: true },
  ]);
  const playingView = toClientVisibleRoomState(playing, "p1");
  const serializedPlaying = JSON.stringify(playingView);

  assert.equal(playingView.chaJiao, null);
  assert.equal(playingView.settlementLedger.some((entry) => entry.reason === "chaJiao"), false);
  assert.equal(serializedPlaying.includes("maxHuPoints"), false);
  assert.equal(serializedPlaying.includes("chaJiaoSettlementFacts"), false);

  const ended = settleRoundChaJiaoPayments({
    ...playing,
    status: "ended",
    phase: "ended",
    roundEnd: { reason: "wallEmpty", remainingPlayerIds: [0, 1] },
  });
  const repeated = settleRoundChaJiaoPayments(ended);
  const ticked = tickRoomStateDeadlines(repeated, 999_999);
  const endedView = toClientVisibleRoomState(ended, "p1");
  const serializedEnded = JSON.stringify(endedView);

  assert.equal(repeated, ended);
  assert.equal(ticked.changed, false);
  assert.equal(ticked.room, ended);
  assert.equal(serializedEnded.includes("chaJiaoId"), false);
  assert.equal(serializedEnded.includes("winningTile"), false);
  assert.equal(serializedEnded.includes("decomposition"), false);
  assert.equal(endedView.settlementLedger.filter((entry) => entry.reason === "chaJiao").length, 1);
});

test("settles san ji, si ji, stacked suits, and mixed two-plus-two at round end", () => {
  const bambooYaoJi = tile("bamboos", 1);
  const dotYaoJi = tile("dots", 1);
  const cases = [
    {
      hand: [bambooYaoJi, bambooYaoJi, bambooYaoJi],
      scores: [48, -16, -16, -16],
      reasons: [["sanJi", "bamboos", 16]],
      entryCount: 3,
    },
    {
      hand: [dotYaoJi, dotYaoJi, dotYaoJi, dotYaoJi],
      scores: [96, -32, -32, -32],
      reasons: [["siJi", "dots", 32]],
      entryCount: 3,
    },
    {
      hand: [bambooYaoJi, bambooYaoJi, bambooYaoJi, dotYaoJi, dotYaoJi, dotYaoJi],
      scores: [96, -32, -32, -32],
      reasons: [["sanJi", "bamboos", 16], ["sanJi", "dots", 16]],
      entryCount: 6,
    },
    {
      hand: [bambooYaoJi, bambooYaoJi, dotYaoJi, dotYaoJi],
      scores: [0, 0, 0, 0],
      reasons: [],
      entryCount: 0,
    },
  ] as const;

  for (const value of cases) {
    const ended = finishChickenRound([{ hand: [...value.hand] }]);
    const chickenEntries = ended.settlementLedger.filter(
      (entry): entry is ChickenSettlementEntry => entry.reason === "sanJi" || entry.reason === "siJi",
    );
    const distinctPayments = [...new Set(chickenEntries.map((entry) =>
      `${entry.reason}:${entry.chickenSuit}:${entry.finalPoints}`,
    ))].map((value) => {
      const [reason, suit, points] = value.split(":");
      return [reason, suit, Number(points)];
    });

    assert.deepEqual(ended.scores.map((score) => score.points), value.scores);
    assert.equal(chickenEntries.length, value.entryCount);
    assert.deepEqual(distinctPayments, value.reasons);
    assert.equal(new Set(chickenEntries.map((entry) => entry.batchId)).size, value.entryCount === 0 ? 0 : 1);
  }
});

test("counts physical yao ji sources in melds and claimed winning tiles while already-won players still pay", () => {
  const bambooYaoJi = tile("bamboos", 1);
  const dotYaoJi = tile("dots", 1);
  const target = tile("characters", 5);
  const ended = finishChickenRound([
    {
      hand: [bambooYaoJi, bambooYaoJi],
      melds: [{ type: "peng", tile: target, tiles: [target, target, bambooYaoJi], fromPlayer: 1 }],
    },
    {
      hand: [dotYaoJi, dotYaoJi],
      hasWon: true,
      claimedWinningTile: {
        tile: dotYaoJi,
        source: "discard",
        sourceWindowId: "discard-chicken-source",
        responsibleSeatId: 2,
        responsiblePlayerId: "p3",
      },
    },
    {},
    { hasWon: true },
  ]);
  const chickenEntries = ended.settlementLedger.filter(
    (entry): entry is ChickenSettlementEntry => entry.reason === "sanJi" || entry.reason === "siJi",
  );

  assert.deepEqual(ended.scores.map((score) => score.points), [32, 32, -32, -32]);
  assert.equal(chickenEntries.length, 6);
  assert.deepEqual(
    chickenEntries.map((entry) => [entry.winnerSeatId, entry.chickenSuit, entry.loserSeatId, entry.finalPoints]),
    [
      [0, "bamboos", 1, 16],
      [0, "bamboos", 2, 16],
      [0, "bamboos", 3, 16],
      [1, "dots", 0, 16],
      [1, "dots", 2, 16],
      [1, "dots", 3, 16],
    ],
  );
});

test("keeps round-end chicken settlement idempotent across repeated settlement and deadline ticks", () => {
  const bambooYaoJi = tile("bamboos", 1);
  const ended = finishChickenRound([{ hand: [bambooYaoJi, bambooYaoJi, bambooYaoJi] }]);
  const repeated = settleRoundChickenPayments(ended);
  const ticked = tickRoomStateDeadlines(repeated, 999_999);

  assert.equal(repeated, ended);
  assert.equal(ticked.changed, false);
  assert.equal(ticked.room, ended);
  assert.deepEqual(ticked.room.scores, ended.scores);
  assert.deepEqual(ticked.room.settlementLedger, ended.settlementLedger);
  assert.equal(ended.resolvedSettlementIds.length, 1);
});

test("does not expose opponents' concealed chicken counts before round end", () => {
  const dotYaoJi = tile("dots", 1);
  const room = readyRoomForChickenSettlement([
    {},
    { hand: [dotYaoJi, dotYaoJi, dotYaoJi] },
  ]);
  const view = toClientVisibleRoomState(room, "p1");
  const serialized = JSON.stringify(view);

  assert.equal(view.round?.players[1].hand, null);
  assert.deepEqual(view.settlementLedger, []);
  assert.equal(serialized.includes("claimedWinningTile"), false);
  assert.equal(serialized.includes("chickenCount"), false);
  assert.equal(serialized.includes("bambooCount"), false);
  assert.equal(serialized.includes("dotCount"), false);
  assert.equal(serialized.includes("resolvedSettlementIds"), false);
});

test("replaces ordinary san ji with qiang gang liability when either yao ji goes from two to three", () => {
  for (const chickenSuit of ["bamboos", "dots"] as const) {
    const yaoJi = tile(chickenSuit, 1);
    const ended = finishChickenRound([
      {},
      {
        hand: [yaoJi, yaoJi],
        hasWon: true,
        claimedWinningTile: qiangGangWinningTile(yaoJi),
      },
    ]);
    const liabilityEntries = ended.settlementLedger.filter(
      (entry): entry is QiangGangSanJiLiabilityEntry =>
        entry.reason === "qiangGangSanJiLiability",
    );

    assert.deepEqual(ended.scores.map((score) => score.points), [-48, 48, 0, 0]);
    assert.deepEqual(
      liabilityEntries.map((entry) => [
        entry.reason,
        entry.chickenSuit,
        entry.winnerSeatId,
        entry.loserSeatId,
        entry.finalPoints,
      ]),
      [["qiangGangSanJiLiability", chickenSuit, 1, 0, 48]],
    );
    assert.equal(
      ended.settlementLedger.some(
        (entry) =>
          entry.reason === "sanJi" &&
          entry.winnerSeatId === 1 &&
          entry.chickenSuit === chickenSuit,
      ),
      false,
    );
    assert.deepEqual(liabilityEntries[0].relatedEvent, {
      type: "qiangGangHuClaimed",
      windowId: "qiang-gang-chicken-window",
      seatId: 1,
      responsibleSeatId: 0,
      responsiblePlayerId: "p1",
    });
  }
});

test("carries the robbed physical yao ji through the ba gang claim flow", () => {
  const { room, gangTile } = readyRoomForQiangGangHu([1], [2, 3]);
  const bambooYaoJi = tile("bamboos", 1);
  const roomWithYaoJiBaGang: RoomState = {
    ...room,
    round: {
      ...room.round!,
      players: room.round!.players.map((player) => {
        if (player.id === 0) {
          return {
            ...player,
            hand: player.hand.map((value) =>
              value.suit === gangTile.suit && value.rank === gangTile.rank
                ? bambooYaoJi
                : value,
            ),
          };
        }

        if (player.id === 1) {
          return {
            ...player,
            hand: [...player.hand.slice(0, -2), bambooYaoJi, bambooYaoJi],
          };
        }

        return player;
      }),
    },
  };
  const declared = claimBaGang(roomWithYaoJiBaGang, "p1", gangTile);

  assert.equal(declared.ok, true);
  if (!declared.ok) return;
  assert.deepEqual(declared.room.baGangClaimWindow?.targetTile, gangTile);
  assert.deepEqual(declared.room.baGangClaimWindow?.tile, bambooYaoJi);

  const claimed = claimQiangGangHu(declared.room, "p2");
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;

  assert.equal(claimed.room.status, "ended");
  assert.equal(
    claimed.room.settlementLedger.filter(
      (entry) => entry.reason === "qiangGangSanJiLiability",
    ).length,
    1,
  );
  assert.deepEqual(claimed.room.round?.players[1].claimedWinningTile, {
    tile: bambooYaoJi,
    source: "qiangGang",
    sourceWindowId: declared.room.baGangClaimWindow?.windowId,
    responsibleSeatId: 0,
    responsiblePlayerId: "p1",
  });
});

test("keeps other chicken suits ordinary while one suit uses qiang gang liability", () => {
  const bambooYaoJi = tile("bamboos", 1);
  const dotYaoJi = tile("dots", 1);
  const ended = finishChickenRound([
    {},
    {
      hand: [bambooYaoJi, bambooYaoJi, dotYaoJi, dotYaoJi, dotYaoJi],
      hasWon: true,
      claimedWinningTile: qiangGangWinningTile(bambooYaoJi),
    },
  ]);
  const chickenEntries = ended.settlementLedger.filter(
    (entry): entry is ChickenSettlementEntry =>
      entry.reason === "sanJi" ||
      entry.reason === "siJi" ||
      entry.reason === "qiangGangSanJiLiability",
  );

  assert.deepEqual(ended.scores.map((score) => score.points), [-64, 96, -16, -16]);
  assert.deepEqual(
    chickenEntries.map((entry) => [entry.reason, entry.chickenSuit, entry.loserSeatId, entry.finalPoints]),
    [
      ["qiangGangSanJiLiability", "bamboos", 0, 48],
      ["sanJi", "dots", 0, 16],
      ["sanJi", "dots", 2, 16],
      ["sanJi", "dots", 3, 16],
    ],
  );
});

test("does not use qiang gang liability unless the robbed yao ji changes exactly two into three", () => {
  const bambooYaoJi = tile("bamboos", 1);
  const cases = [
    {
      hand: [bambooYaoJi, bambooYaoJi, bambooYaoJi],
      expectedReason: "siJi",
      expectedEntries: 3,
    },
    {
      hand: [bambooYaoJi],
      expectedReason: null,
      expectedEntries: 0,
    },
  ] as const;

  for (const value of cases) {
    const ended = finishChickenRound([
      {},
      {
        hand: [...value.hand],
        hasWon: true,
        claimedWinningTile: qiangGangWinningTile(bambooYaoJi),
      },
    ]);
    const chickenEntries = ended.settlementLedger.filter(
      (entry): entry is ChickenSettlementEntry =>
        entry.reason === "sanJi" ||
        entry.reason === "siJi" ||
        entry.reason === "qiangGangSanJiLiability",
    );

    assert.equal(chickenEntries.some((entry) => entry.reason === "qiangGangSanJiLiability"), false);
    assert.equal(chickenEntries.length, value.expectedEntries);
    assert.equal(chickenEntries[0]?.reason ?? null, value.expectedReason);
  }
});

test("settles each eligible winner separately when multiple players rob the same yao ji", () => {
  const bambooYaoJi = tile("bamboos", 1);
  const claimedWinningTile = qiangGangWinningTile(bambooYaoJi);
  const ended = finishChickenRound([
    {},
    { hand: [bambooYaoJi, bambooYaoJi], hasWon: true, claimedWinningTile },
    { hand: [bambooYaoJi, bambooYaoJi], hasWon: true, claimedWinningTile },
  ]);
  const liabilityEntries = ended.settlementLedger.filter(
    (entry): entry is QiangGangSanJiLiabilityEntry =>
      entry.reason === "qiangGangSanJiLiability",
  );

  assert.deepEqual(ended.scores.map((score) => score.points), [-96, 48, 48, 0]);
  assert.deepEqual(
    liabilityEntries.map((entry) => [entry.winnerSeatId, entry.loserSeatId, entry.finalPoints]),
    [[1, 0, 48], [2, 0, 48]],
  );
  assert.equal(
    ended.settlementLedger.some((entry) => entry.reason === "sanJi" && [1, 2].includes(entry.winnerSeatId)),
    false,
  );
});

test("keeps qiang gang san ji liability idempotent and hidden until round end", () => {
  const dotYaoJi = tile("dots", 1);
  const playing = readyRoomForChickenSettlement([
    {},
    {
      hand: [dotYaoJi, dotYaoJi],
      hasWon: true,
      claimedWinningTile: qiangGangWinningTile(dotYaoJi),
    },
  ]);
  const playingView = toClientVisibleRoomState(playing, "p1");
  const serialized = JSON.stringify(playingView);

  assert.equal(playingView.round?.players[1].hand, null);
  assert.deepEqual(playingView.settlementLedger, []);
  assert.equal(serialized.includes("claimedWinningTile"), false);
  assert.equal(serialized.includes("sourceWindowId"), false);
  assert.equal(serialized.includes("qiangGangSanJiLiability"), false);

  const ended = finishChickenRound([
    {},
    {
      hand: [dotYaoJi, dotYaoJi],
      hasWon: true,
      claimedWinningTile: qiangGangWinningTile(dotYaoJi),
    },
  ]);
  const repeated = settleRoundChickenPayments(ended);
  const ticked = tickRoomStateDeadlines(repeated, 999_999);
  const endedView = toClientVisibleRoomState(ended, "p1");

  assert.equal(repeated, ended);
  assert.equal(ticked.changed, false);
  assert.equal(ticked.room, ended);
  assert.equal(
    ended.settlementLedger.filter((entry) => entry.reason === "qiangGangSanJiLiability").length,
    1,
  );
  assert.equal(
    endedView.settlementLedger.filter((entry) => entry.reason === "qiangGangSanJiLiability").length,
    1,
  );
  assert.equal(JSON.stringify(endedView).includes("claimedWinningTile"), false);
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
  assert.equal(claimed.room.phase, "discard");
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
  assert.equal(claimed.room.phase, "gangDraw");
  assert.equal(claimed.room.round?.players[0].discards.length, 0);
  assert.equal(claimed.room.round?.players[1].hand.length, 10);
  assert.deepEqual(claimed.room.round?.players[1].melds, [
    {
      type: "mingGang",
      tile: discard,
      tiles: [tile("characters", 9), tile("characters", 9), tile("characters", 9), discard],
      fromPlayer: 0,
      gangId: claimed.room.gangSettlementFacts[0]?.gangId,
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
  assert.deepEqual(
    claimed.room.gangSettlementFacts.map((fact) => ({
      gangType: fact.gangType,
      winner: fact.gangSeatId,
      payers: fact.payers.map((payer) => payer.seatId),
      points: fact.pointsPerPayer,
      usesLaizi: fact.usesLaizi,
    })),
    [{ gangType: "mingGang", winner: 1, payers: [0], points: 4, usesLaizi: false }],
  );

  const ended = finishGangSettlement(claimed.room);
  assert.deepEqual(ended.scores.map((score) => score.points), [-4, 4, 0, 0]);
  assert.deepEqual(
    ended.settlementLedger.map((entry) => [entry.reason, entry.winnerSeatId, entry.loserSeatId, entry.finalPoints]),
    [["mingGang", 1, 0, 4]],
  );
});

test("uses physical yao ji sources to reduce ming gang payment", () => {
  const prepared = readyRoomForPengOnly();
  const yaoJi = tile("bamboos", 1);
  let replaced = false;
  const room: RoomState = {
    ...prepared.room,
    round: {
      ...prepared.room.round!,
      players: prepared.room.round!.players.map((player) =>
        player.id === 1
          ? {
              ...player,
              hand: player.hand.map((value) => {
                if (!replaced && value.suit === "characters" && value.rank === 2) {
                  replaced = true;
                  return yaoJi;
                }

                return value;
              }),
            }
          : player,
      ),
    },
  };
  const discarded = discardRoomTile(room, "p1", prepared.discard);
  assert.equal(discarded.ok, true);
  if (!discarded.ok) return;
  const claimed = claimMingGang(discarded.room, "p2");
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;

  const fact = claimed.room.gangSettlementFacts[0];
  assert.equal(fact.usesLaizi, true);
  assert.equal(fact.pointsPerPayer, 2);
  assert.equal(fact.physicalTiles.some((value) => value.suit === "bamboos" && value.rank === 1), true);
  assert.deepEqual(finishGangSettlement(claimed.room).scores.map((score) => score.points), [-2, 2, 0, 0]);
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

  const ownerBefore = toClientVisibleRoomState(room, "p1");
  const opponentBefore = toClientVisibleRoomState(room, "p2");
  const anGangDescriptor = ownerBefore.actionDescriptors.find(
    (descriptor) => descriptor.action === "claimAnGang",
  );
  assert.ok(anGangDescriptor !== undefined && "tiles" in anGangDescriptor);
  assert.deepEqual(anGangDescriptor.tiles, [gangTile]);
  assert.equal(opponentBefore.actionDescriptors.some((descriptor) => descriptor.action === "claimAnGang"), false);

  const claimed = claimAnGang(room, "p1", gangTile);
  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  assert.equal(claimed.room.round?.players[0].hand.length, 10);
  assert.equal(claimed.room.phase, "gangDraw");
  assert.deepEqual(claimed.room.round?.players[0].melds, [
    {
      type: "anGang",
      tile: gangTile,
      tiles: [gangTile, gangTile, gangTile, gangTile],
      fromPlayer: null,
      gangId: claimed.room.gangSettlementFacts[0]?.gangId,
    },
  ]);
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "anGangClaimed",
    seatId: 0,
    playerId: "p1",
    tile: gangTile,
    usedTiles: [gangTile, gangTile, gangTile, gangTile],
  });

  const ownerView = toClientVisibleRoomState(claimed.room, "p1");
  const opponentView = toClientVisibleRoomState(claimed.room, "p2");

  assert.deepEqual(ownerView.gangDraw?.tile, gangTile);
  assert.equal(opponentView.gangDraw?.tile, null);
  assert.deepEqual(opponentView.round?.players[0].melds, [
    { type: "anGang", tile: null, tiles: [], fromPlayer: null },
  ]);
  assert.deepEqual(opponentView.eventLog.at(-1), {
    type: "anGangClaimed",
    seatId: 0,
    playerId: "p1",
    usesLaizi: false,
  });
  assert.equal(opponentView.gangSettlements[0].targetTile, null);
  assert.equal(JSON.stringify(opponentView).includes("gangId"), false);
  assert.equal(JSON.stringify(opponentView).includes("physicalTiles"), false);
});

test("freezes active an gang payers and settles ordinary or laizi points at round end", () => {
  for (const usesLaizi of [false, true]) {
    const gangTile = tile("characters", 9);
    const yaoJi = tile("dots", 1);
    const room = readyRoomForActiveGang({
      hand: [gangTile, gangTile, gangTile, usesLaizi ? yaoJi : gangTile],
      melds: [],
    });
    const claimed = claimAnGang(room, "p1", gangTile);
    assert.equal(claimed.ok, true);
    if (!claimed.ok) continue;

    const fact = claimed.room.gangSettlementFacts[0];
    assert.equal(fact.usesLaizi, usesLaizi);
    assert.equal(fact.pointsPerPayer, usesLaizi ? 2 : 4);
    assert.deepEqual(fact.payers.map((payer) => payer.seatId), [1, 2, 3]);

    const roomAfterLaterHu: RoomState = {
      ...claimed.room,
      round: {
        ...claimed.room.round!,
        players: claimed.room.round!.players.map((player) =>
          player.id === 0 || player.id === 1 ? { ...player, hasWon: true } : player,
        ),
      },
    };
    const ended = finishGangSettlement(roomAfterLaterHu);
    const points = usesLaizi ? 2 : 4;
    const gangEntries = ended.settlementLedger.filter(
      (entry): entry is GangSettlementEntry => entry.reason === "anGang",
    );
    const opponentView = toClientVisibleRoomState(ended, "p3");
    const visibleGangEntries = opponentView.settlementLedger.filter(
      (entry) => "targetTile" in entry && entry.reason === "anGang",
    );

    assert.deepEqual(ended.scores.map((score) => score.points), [points * 3, -points, -points, -points]);
    assert.equal(gangEntries.length, 3);
    assert.equal(gangEntries.every((entry) => entry.physicalTiles.length === 4), true);
    assert.equal(visibleGangEntries.length, 3);
    assert.equal(
      visibleGangEntries.every((entry) => "targetTile" in entry && entry.targetTile === null),
      true,
    );
    assert.equal(JSON.stringify(opponentView).includes("physicalTiles"), false);
    assert.equal(JSON.stringify(opponentView).includes("gangId"), false);
  }
});

test("excludes already-won players from a newly established an gang", () => {
  const gangTile = tile("characters", 9);
  const base = readyRoomForActiveGang({ hand: [gangTile, gangTile, gangTile, gangTile], melds: [] });
  const room: RoomState = {
    ...base,
    round: {
      ...base.round!,
      players: base.round!.players.map((player) => (player.id === 3 ? { ...player, hasWon: true } : player)),
    },
  };
  const claimed = claimAnGang(room, "p1", gangTile);
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;

  assert.deepEqual(claimed.room.gangSettlementFacts[0].payers.map((payer) => payer.seatId), [1, 2]);
  assert.deepEqual(finishGangSettlement(claimed.room).scores.map((score) => score.points), [8, -4, -4, 0]);
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
  assert.equal(drawn.room.phase, "discard");
  assert.equal(drawn.room.round?.players[0].hand.length, beforeHandCount + 1);
  assert.equal(drawn.room.round?.wall.length, beforeWallCount - 1);
  assert.deepEqual(drawn.room.eventLog.at(-1), {
    type: "gangTileDrawn",
    seatId: 0,
    playerId: "p1",
    gangType: "anGang",
  });
});

test("declares ba gang, keeps peng pending, and commits after every player passes", () => {
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
      tile("characters", 8),
    ],
    melds: [{ type: "peng", tile: gangTile, tiles: [gangTile, gangTile, gangTile], fromPlayer: 2 }],
  });

  const ownerBefore = toClientVisibleRoomState(room, "p1");
  const opponentBefore = toClientVisibleRoomState(room, "p2");
  const baGangDescriptor = ownerBefore.actionDescriptors.find(
    (descriptor) => descriptor.action === "claimBaGang",
  );
  assert.ok(baGangDescriptor !== undefined && "candidates" in baGangDescriptor);
  assert.deepEqual(baGangDescriptor.candidates.map((candidate) => ({
    targetTile: candidate.targetTile,
    addedTile: { suit: candidate.addedTile.suit, rank: candidate.addedTile.rank },
    paymentEligibility: candidate.paymentEligibility,
    pointsPerPayer: candidate.pointsPerPayer,
  })), [{
    targetTile: gangTile,
    addedTile: gangTile,
    paymentEligibility: "normal",
    pointsPerPayer: 2,
  }]);
  assert.equal(opponentBefore.actionDescriptors.some((descriptor) => descriptor.action === "claimBaGang"), false);

  const claimed = claimBaGang(room, "p1", gangTile, { now: 1_000, timeoutMs: 5_000 });
  assert.equal(claimed.ok, true);

  if (!claimed.ok) {
    return;
  }

  assert.equal(claimed.room.round?.players[0].hand.length, 11);
  assert.deepEqual(claimed.room.round?.players[0].melds, [
    {
      type: "peng",
      tile: gangTile,
      tiles: [gangTile, gangTile, gangTile],
      fromPlayer: 2,
    },
  ]);
  assert.deepEqual(claimed.room.baGangClaimWindow, {
    windowId: `${room.id}:qiangGang:${room.eventLog.length + 1}`,
    deadlineAt: 6_000,
    status: "open",
    upgradedBySeatId: 0,
    upgradedByPlayerId: "p1",
    targetTile: gangTile,
    tile: gangTile,
    pengMeldIndex: 0,
    candidateId: baGangDescriptor.candidates[0].candidateId,
    paymentEligibility: "normal",
    pointsPerPayer: 2,
    pendingPlayerIds: [1, 2, 3],
    passedPlayerIds: [],
    huClaims: [],
  });
  assert.equal(claimed.room.phase, "qiangGang");
  assert.deepEqual(claimed.room.eventLog.at(-1), {
    type: "baGangDeclared",
    seatId: 0,
    playerId: "p1",
    tile: gangTile,
    addedTile: gangTile,
  });

  const p2Passed = passQiangGang(claimed.room, "p2");
  assert.equal(p2Passed.ok, true);
  if (!p2Passed.ok) return;
  const p3Passed = passQiangGang(p2Passed.room, "p3");
  assert.equal(p3Passed.ok, true);
  if (!p3Passed.ok) return;
  const p4Passed = passQiangGang(p3Passed.room, "p4");
  assert.equal(p4Passed.ok, true);
  if (!p4Passed.ok) return;

  assert.equal(p4Passed.room.phase, "gangDraw");
  assert.equal(p4Passed.room.baGangClaimWindow, null);
  assert.equal(p4Passed.room.round?.players[0].hand.length, 10);
  assert.equal(p4Passed.room.round?.players[0].melds[0].type, "baGang");
  assert.deepEqual(p4Passed.room.gangDraw, {
    seatId: 0,
    playerId: "p1",
    gangType: "baGang",
    tile: gangTile,
  });
  assert.deepEqual(
    p4Passed.room.gangSettlementFacts.map((fact) => ({
      gangType: fact.gangType,
      payers: fact.payers.map((payer) => payer.seatId),
      points: fact.pointsPerPayer,
    })),
    [{ gangType: "baGang", payers: [1, 2, 3], points: 2 }],
  );

  const beforeWallCount = p4Passed.room.round?.wall.length ?? 0;
  const drawn = drawGangTile(p4Passed.room, "p1");
  assert.equal(drawn.ok, true);
  if (!drawn.ok) return;
  assert.equal(drawn.room.phase, "discard");
  assert.equal(drawn.room.round?.wall.length, beforeWallCount - 1);
  assert.equal(drawn.room.round?.players[0].hand.length, 11);
});

test("freezes normal, delayed-zero, and yao-ji ba gang candidates by physical tile", () => {
  const target = physicalTile("characters", 9, "peng-target");
  const oldNatural = physicalTile("characters", 9, "old-natural");
  const freshNatural = physicalTile("characters", 9, "fresh-natural");
  const yaoJi = physicalTile("bamboos", 1, "yao-ji");
  const base = readyRoomForActiveGang({
    hand: [
      oldNatural,
      freshNatural,
      yaoJi,
      ...[2, 3, 4, 5, 6, 7, 8, 2].map((rank, index) =>
        physicalTile(index === 7 ? "dots" : "characters", rank as Tile["rank"], `filler-${index}`)),
    ],
    melds: [{
      type: "peng",
      tile: target,
      tiles: [
        physicalTile("characters", 9, "peng-1"),
        physicalTile("characters", 9, "peng-2"),
        physicalTile("characters", 9, "peng-3"),
      ],
      fromPlayer: 2,
    }],
  });
  const room = { ...base, selfDrawEligible: true, lastDrawnTileId: freshNatural.instanceId ?? null };
  const descriptor = toClientVisibleRoomState(room, "p1").actionDescriptors.find(
    (entry) => entry.action === "claimBaGang",
  );
  assert.ok(descriptor?.action === "claimBaGang");
  assert.equal(descriptor.candidates.length, 3);

  const stale = handleRoomAction(serviceForRoom(room), "test-session", {
    type: "claimBaGang",
    candidateId: "stale-candidate",
    expectedActionId: descriptor.actionId,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.ok ? null : stale.reason, "staleAction");

  const candidateByTileId = new Map(descriptor.candidates.map((candidate) => [candidate.addedTile.tileId, candidate]));
  assert.deepEqual(
    {
      old: candidateByTileId.get("old-natural")?.paymentEligibility,
      oldPoints: candidateByTileId.get("old-natural")?.pointsPerPayer,
      fresh: candidateByTileId.get("fresh-natural")?.paymentEligibility,
      freshPoints: candidateByTileId.get("fresh-natural")?.pointsPerPayer,
      yaoJi: candidateByTileId.get("yao-ji")?.paymentEligibility,
      yaoJiPoints: candidateByTileId.get("yao-ji")?.pointsPerPayer,
    },
    {
      old: "zeroDelayedNatural",
      oldPoints: 0,
      fresh: "normal",
      freshPoints: 2,
      yaoJi: "normal",
      yaoJiPoints: 1,
    },
  );

  const zeroCommitted = commitBaGangCandidate(room, candidateByTileId.get("old-natural")!.candidateId);
  assert.equal(zeroCommitted.gangSettlementFacts.at(-1)?.pointsPerPayer, 0);
  assert.equal(zeroCommitted.gangSettlementFacts.at(-1)?.paymentEligibility, "zeroDelayedNatural");
  assert.equal(
    finishGangSettlement(zeroCommitted).settlementLedger.some((entry) => entry.reason === "baGang"),
    false,
  );

  const freshCommitted = commitBaGangCandidate(room, candidateByTileId.get("fresh-natural")!.candidateId);
  assert.equal(freshCommitted.gangSettlementFacts.at(-1)?.pointsPerPayer, 2);
  assert.equal(freshCommitted.gangSettlementFacts.at(-1)?.physicalTiles.at(-1)?.instanceId, "fresh-natural");

  const yaoJiCommitted = commitBaGangCandidate(room, candidateByTileId.get("yao-ji")!.candidateId);
  assert.equal(yaoJiCommitted.gangSettlementFacts.at(-1)?.usesLaizi, true);
  assert.equal(yaoJiCommitted.gangSettlementFacts.at(-1)?.pointsPerPayer, 1);
});

test("exchanges yao ji from all gang types without changing frozen gang facts", () => {
  const gangTargets = [
    physicalTile("characters", 2, "target-ming"),
    physicalTile("characters", 3, "target-an"),
    physicalTile("characters", 4, "target-ba"),
  ];
  const melds: Meld[] = [
    {
      type: "mingGang",
      tile: gangTargets[0],
      tiles: [
        physicalTile("characters", 2, "m-1"),
        physicalTile("characters", 2, "m-2"),
        physicalTile("characters", 2, "m-3"),
        physicalTile("bamboos", 1, "m-yj"),
      ],
      fromPlayer: 1,
      gangId: "gang-ming",
    },
    {
      type: "anGang",
      tile: gangTargets[1],
      tiles: [
        physicalTile("characters", 3, "a-1"),
        physicalTile("characters", 3, "a-2"),
        physicalTile("dots", 1, "a-yj-1"),
        physicalTile("bamboos", 1, "a-yj-2"),
      ],
      fromPlayer: null,
      gangId: "gang-an",
    },
    {
      type: "baGang",
      tile: gangTargets[2],
      tiles: [
        physicalTile("characters", 4, "b-1"),
        physicalTile("characters", 4, "b-2"),
        physicalTile("characters", 4, "b-3"),
        physicalTile("dots", 1, "b-yj"),
      ],
      fromPlayer: 2,
      gangId: "gang-ba",
    },
  ];
  const facts: RoomState["gangSettlementFacts"] = melds.map((meld, index) => ({
    gangId: meld.gangId!,
    gangType: meld.type as "mingGang" | "anGang" | "baGang",
    gangSeatId: 0,
    gangPlayerId: "p1",
    targetTile: meld.tile,
    physicalTiles: [...meld.tiles],
    usesLaizi: true,
    payers: [{ seatId: 1, playerId: "p2" }],
    pointsPerPayer: index === 2 ? 1 : 2,
    paymentEligibility: "normal",
    sourceWindowId: null,
    relatedEventType: index === 0 ? "mingGangClaimed" : index === 1 ? "anGangClaimed" : "baGangClaimed",
  }));
  const base = readyRoomForActiveGang({
    hand: [
      physicalTile("characters", 2, "hand-ming"),
      physicalTile("characters", 3, "hand-an-1"),
      physicalTile("characters", 3, "hand-an-2"),
      physicalTile("characters", 4, "hand-ba"),
      physicalTile("dots", 2, "safe-1"),
      physicalTile("dots", 3, "safe-2"),
      physicalTile("dots", 5, "safe-3"),
    ],
    melds,
  });
  let room: RoomState = {
    ...base,
    selfDrawEligible: false,
    lastDrawnTileId: null,
    gangSettlementFacts: facts,
  };
  const frozenFacts = structuredClone(room.gangSettlementFacts);

  for (const gangType of ["mingGang", "anGang", "anGang", "baGang"] as const) {
    const descriptor = toClientVisibleRoomState(room, "p1").actionDescriptors.find(
      (entry) => entry.action === "exchangeGangYaoJi",
    );
    assert.ok(descriptor?.action === "exchangeGangYaoJi");
    const candidate = descriptor.candidates.find((entry) => entry.gangType === gangType);
    assert.notEqual(candidate, undefined);
    const result = exchangeGangYaoJi(room, "p1", candidate!.candidateId);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    room = result.room;
    assert.equal(room.phase, "discard");
    assert.equal(room.gangDraw, null);
    assert.deepEqual(room.gangSettlementFacts, frozenFacts);
  }

  assert.equal(room.round?.players[0].melds.flatMap((meld) => meld.tiles).some(isYaoJiFace), false);
  assert.equal(room.round?.players[0].hand.filter(isYaoJiFace).length, 4);
  assert.equal(room.eventLog.filter((event) => event.type === "gangYaoJiExchanged").length, 4);
  const opponentView = toClientVisibleRoomState(room, "p2");
  assert.deepEqual(opponentView.round?.players[0].melds.find((meld) => meld.type === "anGang"), {
    type: "anGang",
    tile: null,
    tiles: [],
    fromPlayer: null,
  });
  const publicAnGangExchange = opponentView.eventLog.findLast(
    (event) => event.type === "gangYaoJiExchanged" && event.gangType === "anGang",
  );
  assert.equal(publicAnGangExchange?.type === "gangYaoJiExchanged" && publicAnGangExchange.targetTile, null);
  assert.equal(JSON.stringify(opponentView).includes("hand-an-1"), false);
  assert.equal(JSON.stringify(opponentView).includes("a-yj-1"), false);
});

test("exchange-created hu is offered as self draw but never claimed automatically", () => {
  const target = physicalTile("characters", 9, "hu-target");
  const meld: Meld = {
    type: "anGang",
    tile: target,
    tiles: [
      physicalTile("characters", 9, "hu-gang-1"),
      physicalTile("characters", 9, "hu-gang-2"),
      physicalTile("characters", 9, "hu-gang-3"),
      physicalTile("bamboos", 1, "hu-returned-yj"),
    ],
    fromPlayer: null,
    gangId: "hu-gang",
  };
  const room = readyRoomForActiveGang({
    hand: [
      physicalTile("characters", 2, "hu-2"),
      physicalTile("characters", 3, "hu-3a"),
      physicalTile("characters", 4, "hu-4a"),
      physicalTile("characters", 3, "hu-3b"),
      physicalTile("characters", 4, "hu-4b"),
      physicalTile("characters", 5, "hu-5"),
      physicalTile("characters", 6, "hu-6"),
      physicalTile("characters", 7, "hu-7"),
      physicalTile("characters", 8, "hu-8"),
      physicalTile("dots", 5, "hu-pair"),
      physicalTile("characters", 9, "hu-exchange-natural"),
    ],
    melds: [meld],
  });
  const prepared: RoomState = {
    ...room,
    selfDrawEligible: false,
    lastDrawnTileId: null,
    gangSettlementFacts: [{
      gangId: "hu-gang",
      gangType: "anGang",
      gangSeatId: 0,
      gangPlayerId: "p1",
      targetTile: target,
      physicalTiles: [...meld.tiles],
      usesLaizi: true,
      payers: [],
      pointsPerPayer: 2,
      paymentEligibility: "normal",
      sourceWindowId: null,
      relatedEventType: "anGangClaimed",
    }],
  };
  const descriptor = toClientVisibleRoomState(prepared, "p1").actionDescriptors.find(
    (entry) => entry.action === "exchangeGangYaoJi",
  );
  assert.ok(descriptor?.action === "exchangeGangYaoJi");
  const result = exchangeGangYaoJi(prepared, "p1", descriptor.candidates[0].candidateId);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.room.round?.players[0].hasWon, false);
  assert.equal(result.room.selfDrawEligible, true);
  assert.equal(toClientVisibleRoomState(result.room, "p1").legalActions.includes("claimSelfDrawHu"), true);
});

test("keeps the original peng when one player claims qiang gang hu", () => {
  const { room, gangTile } = readyRoomForQiangGangHu([1]);
  const declared = claimBaGang(room, "p1", gangTile);
  assert.equal(declared.ok, true);
  if (!declared.ok) return;

  const responderView = toClientVisibleRoomState(declared.room, "p2");
  assert.deepEqual(responderView.legalActions, ["passQiangGang", "claimQiangGangHu"]);
  assert.equal("pengMeldIndex" in responderView.baGangClaimWindow!, false);

  const hu = claimQiangGangHu(declared.room, "p2");
  assert.equal(hu.ok, true);
  if (!hu.ok) return;
  assert.equal(hu.room.round?.players[1].hasWon, false);
  assert.deepEqual(hu.room.settlementLedger, []);
  assert.equal(hu.room.eventLog.some((event) => event.type === "qiangGangHuClaimed"), false);
  const huResponderView = toClientVisibleRoomState(hu.room, "p2");
  const huObserverView = toClientVisibleRoomState(hu.room, "p3");
  assert.equal(huResponderView.baGangClaimWindow?.responseByMe, "hu");
  assert.equal(huObserverView.baGangClaimWindow?.responseByMe, null);
  assert.equal(huObserverView.round?.players[1].hasWon, false);
  assert.equal(JSON.stringify(huObserverView).includes("huClaims"), false);
  assert.equal(JSON.stringify(huObserverView).includes("passedPlayerIds"), false);
  const p3Passed = passQiangGang(hu.room, "p3");
  assert.equal(p3Passed.ok, true);
  if (!p3Passed.ok) return;
  const resolved = passQiangGang(p3Passed.room, "p4");
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;

  assert.equal(resolved.room.baGangClaimWindow, null);
  assert.equal(resolved.room.gangDraw, null);
  assert.equal(resolved.room.phase, "draw");
  assert.equal(resolved.room.round?.players[1].hasWon, true);
  assert.deepEqual(resolved.room.round?.players[1].claimedWinningTile, {
    tile: gangTile,
    source: "qiangGang",
    sourceWindowId: declared.room.baGangClaimWindow?.windowId,
    responsibleSeatId: 0,
    responsiblePlayerId: "p1",
  });
  assert.equal(resolved.room.round?.players[0].melds[0].type, "peng");
  assert.deepEqual(resolved.room.gangSettlementFacts, []);
  assert.equal(resolved.room.settlementLedger.some((entry) => entry.reason === "baGang"), false);
  assert.equal(resolved.room.round?.players[0].hand.length, room.round!.players[0].hand.length - 1);
  assert.equal(resolved.room.round?.currentPlayer, 2);
  assert.deepEqual(resolved.room.scores.map((score) => score.points), [-16, 16, 0, 0]);
  assert.deepEqual(
    resolved.room.settlementLedger.map((entry) => [entry.reason, entry.winnerSeatId, entry.loserSeatId, entry.finalPoints]),
    [["qiangGangHu", 1, 0, 16]],
  );
  assert.deepEqual(
    resolved.room.eventLog.filter((event) => event.type === "qiangGangHuClaimed").map((event) => ({
      seatId: event.seatId,
      responsibleSeatId: event.responsibleSeatId,
      points: event.points,
    })),
    [{ seatId: 1, responsibleSeatId: 0, points: 16 }],
  );
});

test("records multiple qiang gang hu claims before blood battle continues", () => {
  const { room, gangTile } = readyRoomForQiangGangHu([1, 2]);
  const declared = claimBaGang(room, "p1", gangTile);
  assert.equal(declared.ok, true);
  if (!declared.ok) return;
  const p2Hu = claimQiangGangHu(declared.room, "p2");
  assert.equal(p2Hu.ok, true);
  if (!p2Hu.ok) return;
  const p3Hu = claimQiangGangHu(p2Hu.room, "p3");
  assert.equal(p3Hu.ok, true);
  if (!p3Hu.ok) return;
  const resolved = passQiangGang(p3Hu.room, "p4");
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;

  assert.deepEqual(resolved.room.round?.players.map((player) => player.hasWon), [false, true, true, false]);
  assert.equal(resolved.room.round?.players[0].melds[0].type, "peng");
  assert.equal(resolved.room.phase, "draw");
  assert.equal(resolved.room.round?.currentPlayer, 3);
  assert.equal(resolved.room.eventLog.filter((event) => event.type === "qiangGangHuClaimed").length, 2);
  assert.deepEqual(resolved.room.scores.map((score) => score.points), [-32, 16, 16, 0]);
  assert.equal(new Set(resolved.room.settlementLedger.map((entry) => entry.batchId)).size, 1);
});

test("commits ba gang when every unanswered qiang gang response times out", () => {
  const { room, gangTile } = readyRoomForQiangGangHu([]);
  const declared = claimBaGang(room, "p1", gangTile, { now: 10_000, timeoutMs: 4_000 });
  assert.equal(declared.ok, true);
  if (!declared.ok) return;
  const windowId = declared.room.baGangClaimWindow?.windowId;
  assert.ok(windowId);

  const expired = tickRoomStateDeadlines(declared.room, 14_000);
  assert.equal(expired.changed, true);
  assert.equal(expired.expiredWindowId, windowId);
  assert.equal(expired.room.baGangClaimWindow, null);
  assert.equal(expired.room.phase, "gangDraw");
  assert.equal(expired.room.round?.players[0].melds[0].type, "baGang");
  assert.deepEqual(expired.room.settlementLedger, []);
  assert.equal(expired.room.gangSettlementFacts.length, 1);
  assert.equal(expired.room.eventLog.at(-1)?.type, "qiangGangWindowClosed");
  assert.deepEqual(expired.room.eventLog.at(-1), {
    type: "qiangGangWindowClosed",
    reason: "timeoutAllPassed",
  });
  const repeated = tickRoomStateDeadlines(expired.room, 99_999);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.room.gangSettlementFacts.length, 1);
});

test("commits a laizi ba gang once and freezes only players still active", () => {
  const { room, gangTile } = readyRoomForQiangGangHu([], [3]);
  const yaoJi = tile("bamboos", 1);
  const roomWithLaizi: RoomState = {
    ...room,
    round: {
      ...room.round!,
      players: room.round!.players.map((player) =>
        player.id === 0 ? { ...player, hand: player.hand.map((value, index) => (index === 0 ? yaoJi : value)) } : player,
      ),
    },
  };
  const declared = claimBaGang(roomWithLaizi, "p1", gangTile);
  assert.equal(declared.ok, true);
  if (!declared.ok) return;
  const p2Passed = passQiangGang(declared.room, "p2");
  assert.equal(p2Passed.ok, true);
  if (!p2Passed.ok) return;
  const committed = passQiangGang(p2Passed.room, "p3");
  assert.equal(committed.ok, true);
  if (!committed.ok) return;

  const fact = committed.room.gangSettlementFacts[0];
  assert.equal(fact.gangType, "baGang");
  assert.equal(fact.usesLaizi, true);
  assert.equal(fact.pointsPerPayer, 1);
  assert.deepEqual(fact.payers.map((payer) => payer.seatId), [1, 2]);

  const ended = finishGangSettlement(committed.room);
  assert.deepEqual(ended.scores.map((score) => score.points), [2, -1, -1, 0]);
  const repeated = settleRoundGangPayments(ended);
  assert.equal(repeated, ended);
  assert.equal(ended.settlementLedger.filter((entry) => entry.reason === "baGang").length, 2);
});

test("keeps qiang gang hu claims when remaining responders time out", () => {
  for (const huSeats of [[1], [1, 2]] as const) {
    const { room, gangTile } = readyRoomForQiangGangHu([...huSeats]);
    const declared = claimBaGang(room, "p1", gangTile, { now: 20_000, timeoutMs: 3_000 });
    assert.equal(declared.ok, true);
    if (!declared.ok) continue;

    const claimed = huSeats.reduce((nextRoom, seatId) => {
      const result = claimQiangGangHu(nextRoom, `p${seatId + 1}`);
      assert.equal(result.ok, true);
      return result.ok ? result.room : nextRoom;
    }, declared.room);
    assert.equal(claimed.round?.players.slice(1).every((player) => !player.hasWon), true);
    assert.equal(claimed.eventLog.some((event) => event.type === "qiangGangHuClaimed"), false);
    assert.equal(toClientVisibleRoomState(claimed, "p2").baGangClaimWindow?.responseByMe, "hu");
    assert.equal(toClientVisibleRoomState(claimed, "p4").baGangClaimWindow?.responseByMe, null);
    const expired = tickRoomStateDeadlines(claimed, 23_000);

    assert.equal(expired.changed, true);
    assert.equal(expired.room.round?.players[0].melds[0].type, "peng");
    assert.equal(expired.room.settlementLedger.length, huSeats.length);
    assert.deepEqual(
      expired.room.scores.map((score) => score.points),
      huSeats.length === 1 ? [-16, 16, 0, 0] : [-32, 16, 16, 0],
    );
    assert.deepEqual(expired.room.eventLog.at(-1), {
      type: "qiangGangWindowClosed",
      reason: "timeoutRobbed",
    });
  }
});

test("settles multi-hu ledger identically regardless of claim response order", () => {
  function settle(order: Array<"p2" | "p3">): Pick<RoomState, "scores" | "settlementLedger"> {
    const { room, discard } = readyRoomForMultiHu();
    const discarded = discardRoomTile(room, "p1", discard);
    assert.equal(discarded.ok, true);
    if (!discarded.ok) throw new Error("Expected discard to succeed.");

    const claimed = order.reduce((nextRoom, playerId) => {
      const result = claimHu(nextRoom, playerId);
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("Expected hu claim to succeed.");
      return result.room;
    }, discarded.room);
    const resolved = passClaim(claimed, "p4");
    assert.equal(resolved.ok, true);
    if (!resolved.ok) throw new Error("Expected claim window to resolve.");

    return { scores: resolved.room.scores, settlementLedger: resolved.room.settlementLedger };
  }

  assert.deepEqual(settle(["p2", "p3"]), settle(["p3", "p2"]));
});

test("settles multi-winner qiang gang ledger identically regardless of response order", () => {
  function settle(order: Array<"p2" | "p3">): Pick<RoomState, "scores" | "settlementLedger"> {
    const { room, gangTile } = readyRoomForQiangGangHu([1, 2]);
    const declared = claimBaGang(room, "p1", gangTile);
    assert.equal(declared.ok, true);
    if (!declared.ok) throw new Error("Expected ba gang declaration to succeed.");

    const claimed = order.reduce((nextRoom, playerId) => {
      const result = claimQiangGangHu(nextRoom, playerId);
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("Expected qiang gang hu to succeed.");
      return result.room;
    }, declared.room);
    const resolved = passQiangGang(claimed, "p4");
    assert.equal(resolved.ok, true);
    if (!resolved.ok) throw new Error("Expected qiang gang window to resolve.");

    return { scores: resolved.room.scores, settlementLedger: resolved.room.settlementLedger };
  }

  assert.deepEqual(settle(["p2", "p3"]), settle(["p3", "p2"]));
});

test("caps each self-draw payer at 64 points while retaining raw score", () => {
  const room = readyRoomForSelfDrawHu();
  const makePeng = (rank: 2 | 3 | 4 | 5, fromPlayer: PlayerId) => {
    const pengTile = tile("characters", rank);
    return { type: "peng" as const, tile: pengTile, tiles: [pengTile, pengTile, pengTile], fromPlayer };
  };
  const cappedRoom: RoomState = {
    ...room,
    round: {
      ...room.round!,
      players: room.round!.players.map((player) =>
        player.id === 0
          ? {
              ...player,
              hand: [tile("characters", 9), tile("characters", 9)],
              melds: [makePeng(2, 1), makePeng(3, 2), makePeng(4, 3), makePeng(5, 1)],
              missingSuit: "dots",
            }
          : player,
      ),
    },
  };

  const claimed = claimSelfDrawHu(cappedRoom, "p1");
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;

  assert.deepEqual(claimed.room.scores.map((score) => score.points), [192, -64, -64, -64]);
  assert.deepEqual(
    claimed.room.settlementLedger.map((entry) => [entry.basePoints, entry.rawPoints, entry.finalPoints]),
    [[1, 128, 64], [1, 128, 64], [1, 128, 64]],
  );
});

test("ends blood battle when qiang gang hu leaves only one active player", () => {
  const { room, gangTile } = readyRoomForQiangGangHu([1, 2, 3]);
  const declared = claimBaGang(room, "p1", gangTile);
  assert.equal(declared.ok, true);
  if (!declared.ok) return;
  const p2Hu = claimQiangGangHu(declared.room, "p2");
  assert.equal(p2Hu.ok, true);
  if (!p2Hu.ok) return;
  const p3Hu = claimQiangGangHu(p2Hu.room, "p3");
  assert.equal(p3Hu.ok, true);
  if (!p3Hu.ok) return;
  const resolved = claimQiangGangHu(p3Hu.room, "p4");
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;

  assert.equal(resolved.room.status, "ended");
  assert.equal(resolved.room.phase, "ended");
  assert.deepEqual(resolved.room.roundEnd, { reason: "onePlayerLeft", remainingPlayerIds: [0] });
  assert.equal(resolved.room.baGangClaimWindow, null);
  assert.equal(resolved.room.round?.players[0].melds[0].type, "peng");
  assert.equal(resolved.room.chaJiao, null);
  assert.equal(resolved.room.settlementLedger.some((entry) => entry.reason === "chaJiao"), false);
  assert.equal(resolved.room.settlementLedger.length, 3);
  assert.deepEqual(resolved.room.scores.map((score) => score.points), [-48, 16, 16, 16]);
});

test("rejects illegal and already-won qiang gang responses", () => {
  const { room, gangTile } = readyRoomForQiangGangHu([], [3]);
  const declared = claimBaGang(room, "p1", gangTile);
  assert.equal(declared.ok, true);
  if (!declared.ok) return;

  assert.deepEqual(claimQiangGangHu(declared.room, "p1"), { ok: false, reason: "claimNotAllowed" });
  assert.deepEqual(passQiangGang(declared.room, "p4"), { ok: false, reason: "claimNotAllowed" });
  assert.deepEqual(claimQiangGangHu(declared.room, "p3"), { ok: false, reason: "cannotHu" });
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

type ChaJiaoPlayerFixture = {
  hand?: Tile[];
  melds?: Meld[];
  hasWon?: boolean;
};

function readyRoomForChaJiao(
  fixtures: ChaJiaoPlayerFixture[],
  baseRoom: RoomState = startReadyRoom(),
): RoomState {
  const firstActivePlayer = baseRoom.round?.players.find(
    (player) => !(fixtures[player.id]?.hasWon ?? player.hasWon),
  )?.id ?? 0;

  return {
    ...baseRoom,
    status: "playing",
    phase: "draw",
    selfDrawEligible: false,
    roundEnd: null,
    claimWindow: null,
    baGangClaimWindow: null,
    gangDraw: null,
    chaJiao: null,
    chaJiaoSettlementFacts: [],
    round: {
      ...baseRoom.round!,
      currentPlayer: firstActivePlayer,
      wall: [],
      players: baseRoom.round!.players.map((player) => {
        const fixture = fixtures[player.id] ?? {};

        return {
          ...player,
          hand: fixture.hand ?? player.hand,
          melds: fixture.melds ?? player.melds,
          hasWon: fixture.hasWon ?? player.hasWon,
          missingSuit: "bamboos",
        };
      }),
    },
  };
}

function endedRoomForChaJiao(
  fixtures: ChaJiaoPlayerFixture[],
  baseRoom?: RoomState,
): RoomState {
  const playing = readyRoomForChaJiao(fixtures, baseRoom);
  const remainingPlayerIds = playing.round!.players
    .filter((player) => !player.hasWon)
    .map((player) => player.id);

  return settleRoundChaJiaoPayments({
    ...playing,
    status: "ended",
    phase: "ended",
    roundEnd: { reason: "wallEmpty", remainingPlayerIds },
  });
}

function chaJiaoEntries(room: RoomState): ChaJiaoSettlementEntry[] {
  return room.settlementLedger.filter(
    (entry): entry is ChaJiaoSettlementEntry => entry.reason === "chaJiao",
  );
}

function notListeningHand(): Tile[] {
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
    tile("dots", 6),
    tile("dots", 7),
    tile("dots", 9),
    tile("characters", 5),
  ];
}

function listeningSixteenHand(): Tile[] {
  return [
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
  ];
}

function sevenPairsWinningHand(): Tile[] {
  return [1, 2, 3, 4, 5, 6, 7].flatMap((rank) =>
    Array.from(
      { length: 2 },
      () => tile("characters", rank as 1 | 2 | 3 | 4 | 5 | 6 | 7),
    ),
  );
}

function sevenPairsListeningHand(): Tile[] {
  return sevenPairsWinningHand().slice(0, -1);
}

function makeTestMeld(type: Meld["type"], targetTile: Tile, count: 3 | 4): Meld {
  return {
    type,
    tile: targetTile,
    tiles: Array.from({ length: count }, () => targetTile),
    fromPlayer: type === "peng" || type === "mingGang" ? 0 : null,
  };
}

function cappedChaJiaoMelds(): Meld[] {
  return [2, 3, 4, 5].map((rank) =>
    makeTestMeld("anGang", tile("characters", rank as 2 | 3 | 4 | 5), 4),
  );
}

type ChickenPlayerFixture = {
  hand?: Tile[];
  melds?: NonNullable<RoomState["round"]>["players"][number]["melds"];
  hasWon?: boolean;
  claimedWinningTile?: ClaimedWinningTile | null;
};

function readyRoomForChickenSettlement(fixtures: ChickenPlayerFixture[]): RoomState {
  const started = startReadyRoom();

  return {
    ...started,
    status: "playing",
    phase: "draw",
    selfDrawEligible: false,
    round: {
      ...started.round!,
      currentPlayer: 0,
      wall: [tile("characters", 9)],
      players: started.round!.players.map((player) => {
        const fixture = fixtures[player.id] ?? {};

        return {
          ...player,
          hand: fixture.hand ?? [],
          melds: fixture.melds ?? [],
          hasWon: fixture.hasWon ?? false,
          claimedWinningTile: fixture.claimedWinningTile ?? null,
          missingSuit: "bamboos",
        };
      }),
    },
  };
}

function finishChickenRound(fixtures: ChickenPlayerFixture[]): RoomState {
  const result = drawRoomTile(readyRoomForChickenSettlement(fixtures), "p1");

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return settleRoundChickenPayments({
    ...result.room,
    status: "ended",
    phase: "ended",
    selfDrawEligible: false,
    roundEnd: {
      reason: "wallEmpty",
      remainingPlayerIds: result.room.round!.players
        .filter((player) => !player.hasWon)
        .map((player) => player.id),
    },
    claimWindow: null,
    baGangClaimWindow: null,
    gangDraw: null,
  });
}

function finishGangSettlement(room: RoomState): RoomState {
  const remainingPlayerIds = room.round?.players.filter((player) => !player.hasWon).map((player) => player.id) ?? [];

  return settleRoundGangPayments({
    ...room,
    status: "ended",
    phase: "ended",
    selfDrawEligible: false,
    roundEnd: { reason: "onePlayerLeft", remainingPlayerIds },
    claimWindow: null,
    baGangClaimWindow: null,
    gangDraw: null,
  });
}

function qiangGangWinningTile(yaoJi: Tile): ClaimedWinningTile {
  return {
    tile: yaoJi,
    source: "qiangGang",
    sourceWindowId: "qiang-gang-chicken-window",
    responsibleSeatId: 0,
    responsiblePlayerId: "p1",
  };
}

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
    phase: "draw",
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
      status: "playing",
      phase: "discard",
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

function finishSingleDiscardHuRound(): RoomState {
  const prepared = readyRoomForClaimHu();
  const activeRoom: RoomState = {
    ...prepared.room,
    round: {
      ...prepared.room.round!,
      players: prepared.room.round!.players.map((player) =>
        player.id === 2 || player.id === 3 ? { ...player, hasWon: true } : player,
      ),
    },
  };
  const discarded = discardRoomTile(activeRoom, "p1", prepared.discard);
  assert.equal(discarded.ok, true);
  const claimed = claimHu(discarded.room, "p2");
  assert.equal(claimed.ok, true);
  return claimed.room;
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
    status: "playing",
    phase: "discard",
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
    status: "playing",
    phase: "discard",
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

function physicalTile(suit: Suit, rank: Tile["rank"], instanceId: string): PhysicalTile {
  return { suit, rank, instanceId };
}

function isYaoJiFace(value: Tile): boolean {
  return value.rank === 1 && (value.suit === "bamboos" || value.suit === "dots");
}

function commitBaGangCandidate(room: RoomState, candidateId: string): RoomState {
  const declared = claimBaGang(room, "p1", candidateId);
  if (!declared.ok) {
    throw new Error(declared.reason);
  }

  let nextRoom = declared.room;
  for (const playerId of ["p2", "p3", "p4"]) {
    const passed = passQiangGang(nextRoom, playerId);
    if (!passed.ok) {
      throw new Error(passed.reason);
    }
    nextRoom = passed.room;
  }
  return nextRoom;
}

function serviceForRoom(room: RoomState): RoomServiceState {
  return {
    room,
    sessions: [{
      sessionToken: "test-session",
      playerId: "p1",
      displayName: "P1",
      lastEventId: room.eventLog.length,
    }],
    lastEventId: room.eventLog.length,
    nextPlayerNumber: 5,
    sessionTokenFactory: () => "unused-session",
    nowFactory: () => 1_000,
    responseWindowTimeoutMs: 5_000,
  };
}

function readyRoomForQiangGangHu(
  huSeats: PlayerId[],
  alreadyWonSeats: PlayerId[] = [],
): { room: RoomState; gangTile: Tile } {
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
      tile("characters", 8),
    ],
    melds: [{ type: "peng", tile: gangTile, tiles: [gangTile, gangTile, gangTile], fromPlayer: 2 }],
  });
  const waitingHand = [
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
  ];
  const blockedHand = [
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
    tile("bamboos", 5),
    tile("bamboos", 7),
  ];

  return {
    gangTile,
    room: {
      ...room,
      round: {
        ...room.round!,
        players: room.round!.players.map((player) =>
          player.id === 0
            ? player
            : {
                ...player,
                hand: huSeats.includes(player.id) ? waitingHand : blockedHand,
                missingSuit: "bamboos",
                hasWon: alreadyWonSeats.includes(player.id),
              },
        ),
      },
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
