import test from "node:test";
import assert from "node:assert/strict";

import {
  createRoom,
  joinRoom,
  startRoomRound,
  takeSeat,
  toggleReady,
  toClientVisibleRoomState,
  type RoomState,
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
