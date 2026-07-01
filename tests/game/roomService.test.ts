import test from "node:test";
import assert from "node:assert/strict";

import {
  createRoomSession,
  getClientRoomView,
  handleRoomAction,
  joinRoomSession,
  resumeRoomSession,
  type RoomServiceState,
  type RoomSession,
  type Suit,
  type Tile,
} from "../../src/game/index.ts";

test("creates a server-authoritative room session for the host", () => {
  const result = createRoomSession({
    roomId: "svc-room-001",
    seed: "svc-seed",
    displayName: "Host",
  });

  assert.equal(result.ok, true);
  assert.equal(result.service.room.id, "svc-room-001");
  assert.equal(result.service.room.members.length, 1);
  assert.equal(result.session.sessionToken, "session-1");
  assert.equal(result.session.playerId, "player-1");
  assert.equal(result.lastEventId, 2);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["roomCreated", "playerJoined"],
  );
  assert.equal(result.view.localSeatId, null);
});

test("joins another player and creates an independent session", () => {
  const host = createRoomSession({ roomId: "svc-room-join", seed: "svc-seed", displayName: "Host" });
  const joined = joinRoomSession(host.service, { displayName: "Player Two" });

  assert.equal(joined.ok, true);

  if (!joined.ok) {
    return;
  }

  assert.equal(joined.session.sessionToken, "session-2");
  assert.equal(joined.session.playerId, "player-2");
  assert.equal(joined.service.room.members.length, 2);
  assert.equal(joined.lastEventId, 3);
  assert.deepEqual(joined.events, [{ type: "playerJoined", playerId: "player-2", displayName: "Player Two" }]);
});

test("lets a session take its own seat and returns a redacted client view", () => {
  const host = createRoomSession({ roomId: "svc-room-seat", seed: "svc-seed", displayName: "Host" });
  const seated = handleOk(host.service, host.session.sessionToken, { type: "takeSeat", seatId: 0 });

  assert.equal(seated.service.room.seats[0].playerId, "player-1");
  assert.equal(seated.view.localSeatId, 0);
  assert.deepEqual(seated.events, [{ type: "seatTaken", seatId: 0, playerId: "player-1" }]);
  assert.equal(seated.session.lastEventId, 3);
});

test("toggles ready through the authoritative service", () => {
  const host = createRoomSession({ roomId: "svc-room-ready", seed: "svc-seed", displayName: "Host" });
  const seated = handleOk(host.service, host.session.sessionToken, { type: "takeSeat", seatId: 0 });
  const ready = handleOk(seated.service, host.session.sessionToken, { type: "toggleReady" });

  assert.equal(ready.service.room.seats[0].ready, true);
  assert.deepEqual(ready.events, [
    { type: "readyChanged", seatId: 0, playerId: "player-1", ready: true },
  ]);
  assert.equal(ready.lastEventId, 4);
});

test("starts a round after four sessions are seated and ready", () => {
  const filled = fillReadyService("svc-room-start");
  const started = handleOk(filled.service, filled.sessions[0].sessionToken, { type: "startRound" });

  assert.equal(started.service.room.status, "dingque");
  assert.equal(started.service.room.round?.players[0].hand.length, 14);
  assert.equal(started.service.room.round?.players[1].hand.length, 13);
  assert.deepEqual(started.events, [{ type: "roundStarted", seed: "svc-seed", dealer: 0 }]);

  const playerTwoView = getClientRoomView(started.service, filled.sessions[1].sessionToken);

  assert.equal(playerTwoView.ok, true);

  if (!playerTwoView.ok) {
    return;
  }

  assert.equal(playerTwoView.view.localSeatId, 1);
  assert.equal(playerTwoView.view.round?.players[1].hand?.length, 13);
  assert.equal(playerTwoView.view.round?.players[0].hand, null);
  assert.equal(playerTwoView.view.round?.players[0].handCount, 14);
});

test("lets a seated session choose its own missing suit after start", () => {
  const filled = fillReadyService("svc-room-dingque");
  const started = handleOk(filled.service, filled.sessions[0].sessionToken, { type: "startRound" });
  const chosen = handleOk(started.service, filled.sessions[1].sessionToken, {
    type: "chooseMissingSuit",
    suit: "characters",
  });

  assert.equal(chosen.service.room.round?.players[1].missingSuit, "characters");
  assert.equal(chosen.view.localSeatId, 1);
  assert.equal(chosen.view.round?.players[1].missingSuit, "characters");
  assert.equal(chosen.view.round?.players[0].hand, null);
  assert.deepEqual(chosen.events, [
    { type: "missingSuitChosen", seatId: 1, playerId: "player-2", suit: "characters" },
  ]);
});

test("draws through the authoritative service and returns a redacted view", () => {
  const prepared = prepareServiceForPlayerTwoDraw("svc-room-draw");
  const beforeWallCount = prepared.service.room.round?.wall.length;
  const drawn = handleOk(prepared.service, prepared.sessions[1].sessionToken, { type: "drawTile" });

  assert.equal(drawn.service.room.round?.players[1].hand.length, 14);
  assert.equal(drawn.service.room.round?.wall.length, (beforeWallCount ?? 0) - 1);
  assert.equal(drawn.view.localSeatId, 1);
  assert.equal(drawn.view.round?.players[1].hand?.length, 14);
  assert.equal(drawn.view.round?.players[0].hand, null);
  assert.deepEqual(drawn.events, [{ type: "tileDrawn", seatId: 1, playerId: "player-2" }]);
});

test("discards through the authoritative service and returns a redacted view", () => {
  const prepared = prepareServiceForDealerDiscard("svc-room-discard");
  const beforeHandCount = prepared.service.room.round?.players[0].hand.length;
  const discarded = handleOk(prepared.service, prepared.sessions[0].sessionToken, {
    type: "discardTile",
    tile: prepared.discard,
  });

  assert.equal(discarded.service.room.round?.players[0].hand.length, (beforeHandCount ?? 0) - 1);
  assert.deepEqual(discarded.service.room.round?.players[0].discards, [prepared.discard]);
  assert.equal(discarded.service.room.round?.currentPlayer, 1);
  assert.equal(discarded.view.localSeatId, 0);
  assert.equal(discarded.view.round?.players[0].hand?.length, 13);
  assert.equal(discarded.view.round?.players[1].hand, null);
  assert.equal(discarded.view.round?.players[0].discards.length, 1);
  assert.deepEqual(discarded.events, [
    { type: "tileDiscarded", seatId: 0, playerId: "player-1", tile: prepared.discard },
  ]);
});

test("rejects service draw when dingque is missing, out of turn, or outside draw phase", () => {
  const filled = fillReadyService("svc-room-draw-reject");
  const started = handleOk(filled.service, filled.sessions[0].sessionToken, { type: "startRound" });

  assert.deepEqual(handleRoomAction(started.service, filled.sessions[0].sessionToken, { type: "drawTile" }), {
    ok: false,
    reason: "missingSuitNotSet",
    service: started.service,
  });

  const prepared = prepareServiceForPlayerTwoDraw("svc-room-draw-reject-ready");

  assert.deepEqual(handleRoomAction(prepared.service, prepared.sessions[2].sessionToken, { type: "drawTile" }), {
    ok: false,
    reason: "notCurrentPlayer",
    service: prepared.service,
  });

  const dealerTurnService = {
    ...prepared.service,
    room: {
      ...prepared.service.room,
      round: {
        ...prepared.service.room.round!,
        currentPlayer: 0 as const,
      },
    },
  };

  assert.deepEqual(handleRoomAction(dealerTurnService, prepared.sessions[0].sessionToken, { type: "drawTile" }), {
    ok: false,
    reason: "notDrawPhase",
    service: dealerTurnService,
  });
});

test("rejects service discard before dingque, out of turn, outside discard phase, and with illegal tiles", () => {
  const filled = fillReadyService("svc-room-discard-reject");
  const started = handleOk(filled.service, filled.sessions[0].sessionToken, { type: "startRound" });
  const initialDiscard = findDiscardCandidate(started.service.room.round!.players[0].hand);

  assert.deepEqual(
    handleRoomAction(started.service, filled.sessions[0].sessionToken, {
      type: "discardTile",
      tile: initialDiscard,
    }),
    {
      ok: false,
      reason: "missingSuitNotSet",
      service: started.service,
    },
  );

  const prepared = prepareServiceForDealerDiscard("svc-room-discard-reject-ready");

  assert.deepEqual(
    handleRoomAction(prepared.service, prepared.sessions[1].sessionToken, {
      type: "discardTile",
      tile: prepared.discard,
    }),
    {
      ok: false,
      reason: "notCurrentPlayer",
      service: prepared.service,
    },
  );

  const playerTwoTurnService = {
    ...prepared.service,
    room: {
      ...prepared.service.room,
      round: {
        ...prepared.service.room.round!,
        currentPlayer: 1 as const,
      },
    },
  };

  assert.deepEqual(
    handleRoomAction(playerTwoTurnService, prepared.sessions[1].sessionToken, {
      type: "discardTile",
      tile: prepared.service.room.round!.players[1].hand[0],
    }),
    {
      ok: false,
      reason: "notDiscardPhase",
      service: playerTwoTurnService,
    },
  );

  assert.deepEqual(
    handleRoomAction(prepared.service, prepared.sessions[0].sessionToken, {
      type: "discardTile",
      tile: { suit: "characters", rank: 9 },
    }),
    {
      ok: false,
      reason: "tileNotInHand",
      service: prepared.service,
    },
  );
});

test("rejects missing suit choice before the round starts, without a seat, and after choosing once", () => {
  const host = createRoomSession({ roomId: "svc-room-dingque-reject", seed: "svc-seed", displayName: "Host" });

  assert.deepEqual(handleRoomAction(host.service, host.session.sessionToken, { type: "chooseMissingSuit", suit: "dots" }), {
    ok: false,
    reason: "roundNotStarted",
    service: host.service,
  });

  const filledWithObserver = fillReadyService("svc-room-dingque-observer");
  const observer = joinRoomSession(filledWithObserver.service, { displayName: "Observer" });

  assert.equal(observer.ok, true);

  if (!observer.ok) {
    return;
  }

  const observerStarted = handleOk(observer.service, filledWithObserver.sessions[0].sessionToken, { type: "startRound" });

  assert.deepEqual(handleRoomAction(observerStarted.service, observer.session.sessionToken, { type: "chooseMissingSuit", suit: "dots" }), {
    ok: false,
    reason: "playerNotSeated",
    service: observerStarted.service,
  });

  const filled = fillReadyService("svc-room-dingque-repeat");
  const started = handleOk(filled.service, filled.sessions[0].sessionToken, { type: "startRound" });
  const chosen = handleOk(started.service, filled.sessions[0].sessionToken, {
    type: "chooseMissingSuit",
    suit: "dots",
  });

  assert.deepEqual(handleRoomAction(chosen.service, filled.sessions[0].sessionToken, { type: "chooseMissingSuit", suit: "bamboos" }), {
    ok: false,
    reason: "missingSuitAlreadyChosen",
    service: chosen.service,
  });
});

test("rejects actions and views for invalid sessions", () => {
  const host = createRoomSession({ roomId: "svc-room-invalid", seed: "svc-seed", displayName: "Host" });

  assert.deepEqual(handleRoomAction(host.service, "missing-session", { type: "takeSeat", seatId: 0 }), {
    ok: false,
    reason: "invalidSession",
    service: host.service,
  });
  assert.deepEqual(getClientRoomView(host.service, "missing-session"), {
    ok: false,
    reason: "invalidSession",
  });
  assert.deepEqual(resumeRoomSession(host.service, { sessionToken: "missing-session" }), {
    ok: false,
    reason: "invalidSession",
    service: host.service,
  });
});

test("resumes a session and returns missed events after the client cursor", () => {
  const host = createRoomSession({ roomId: "svc-room-resume", seed: "svc-seed", displayName: "Host" });
  const clientCursor = host.lastEventId;
  const seated = handleOk(host.service, host.session.sessionToken, { type: "takeSeat", seatId: 0 });
  const ready = handleOk(seated.service, host.session.sessionToken, { type: "toggleReady" });
  const resumed = resumeRoomSession(ready.service, {
    sessionToken: host.session.sessionToken,
    lastSeenEventId: clientCursor,
  });

  assert.equal(resumed.ok, true);

  if (!resumed.ok) {
    return;
  }

  assert.equal(resumed.lastEventId, 4);
  assert.equal(resumed.session.lastEventId, 4);
  assert.deepEqual(
    resumed.missedEvents.map((event) => event.type),
    ["seatTaken", "readyChanged"],
  );
  assert.equal(resumed.view.localSeatId, 0);
});

function fillReadyService(roomId: string): { service: RoomServiceState; sessions: RoomSession[] } {
  const host = createRoomSession({ roomId, seed: "svc-seed", displayName: "Player One" });
  const sessions = [host.session];
  let service = host.service;

  for (const displayName of ["Player Two", "Player Three", "Player Four"]) {
    const joined = joinRoomSession(service, { displayName });

    if (!joined.ok) {
      throw new Error(joined.reason);
    }

    service = joined.service;
    sessions.push(joined.session);
  }

  sessions.forEach((session, index) => {
    const seated = handleOk(service, session.sessionToken, { type: "takeSeat", seatId: index as 0 | 1 | 2 | 3 });
    service = seated.service;
    const ready = handleOk(service, session.sessionToken, { type: "toggleReady" });
    service = ready.service;
  });

  return { service, sessions };
}

function prepareServiceForPlayerTwoDraw(roomId: string): { service: RoomServiceState; sessions: RoomSession[] } {
  const filled = fillReadyService(roomId);
  let service = handleOk(filled.service, filled.sessions[0].sessionToken, { type: "startRound" }).service;
  const suits = ["bamboos", "dots", "characters", "bamboos"] as const;

  filled.sessions.forEach((session, index) => {
    service = handleOk(service, session.sessionToken, { type: "chooseMissingSuit", suit: suits[index] }).service;
  });

  return {
    sessions: filled.sessions,
    service: {
      ...service,
      room: {
        ...service.room,
        round: {
          ...service.room.round!,
          currentPlayer: 1,
        },
      },
    },
  };
}

function prepareServiceForDealerDiscard(roomId: string): { service: RoomServiceState; sessions: RoomSession[]; discard: Tile } {
  const filled = fillReadyService(roomId);
  let service = handleOk(filled.service, filled.sessions[0].sessionToken, { type: "startRound" }).service;
  const discard = findDiscardCandidate(service.room.round!.players[0].hand);
  const suits: Suit[] = [discard.suit, "dots", "characters", "bamboos"];

  filled.sessions.forEach((session, index) => {
    service = handleOk(service, session.sessionToken, { type: "chooseMissingSuit", suit: suits[index] }).service;
  });

  return { service, sessions: filled.sessions, discard };
}

function findDiscardCandidate(hand: Tile[]): Tile {
  const candidate = hand.find((value) => !isYaoJi(value));

  if (candidate === undefined) {
    throw new Error("Expected a non-yao-ji discard candidate.");
  }

  return candidate;
}

function isYaoJi(tile: Tile): boolean {
  return tile.rank === 1 && (tile.suit === "bamboos" || tile.suit === "dots");
}

function handleOk(
  service: RoomServiceState,
  sessionToken: string,
  action: Parameters<typeof handleRoomAction>[2],
) {
  const result = handleRoomAction(service, sessionToken, action);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result;
}
