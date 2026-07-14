import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseAction,
  toClientRoomViewModel,
  type ClientVisibleRoomState,
} from "@leshan-mahjong/client-core";
import {
  createRoom,
  joinRoom,
  startRoomRound,
  takeSeat,
  toClientVisibleRoomState,
  toggleReady,
  type RoomState,
} from "../../src/game/room.ts";
import type { PlayerId } from "../../src/game/types.ts";

test("publishes lobby actions from the authoritative room state", () => {
  let room = createRoom({ id: "mobile-lobby-actions", seed: "mobile-lobby-seed" });
  room = join(room, "p1", "玩家一");

  const unseatedView = toClientVisibleRoomState(room, "p1");
  assert.deepEqual(unseatedView.legalActions, ["takeSeat"]);

  room = seat(room, "p1", 0);
  assert.deepEqual(toClientVisibleRoomState(room, "p1").legalActions, ["toggleReady"]);

  for (const [index, playerId] of ["p2", "p3", "p4"].entries()) {
    room = join(room, playerId, `玩家${index + 2}`);
    room = seat(room, playerId, (index + 1) as PlayerId);
  }

  for (const playerId of ["p1", "p2", "p3", "p4"]) {
    room = ready(room, playerId);
  }

  const readyView = toClientVisibleRoomState(room, "p1");
  assert.deepEqual(readyView.legalActions, ["toggleReady", "startRound"]);
  assert.equal(canUseAction(readyView, "startRound"), true);
});

test("mobile-safe view model keeps only the local hand and whitelisted response summary", () => {
  let room = readyFourPlayerRoom();
  const started = startRoomRound(room, 0);
  assert.equal(started.ok, true);
  room = started.room;

  const playerOneView = toClientVisibleRoomState(room, "p1");
  const playerTwoView = toClientVisibleRoomState(room, "p2");
  const poisonedView = {
    ...playerOneView,
    seed: "must-not-cross-client-boundary",
    wall: [{ suit: "characters", rank: 9 }],
    pendingPlayerIds: [1, 2, 3],
    passedPlayerIds: [2],
    huClaims: [{ seatId: 3 }],
    sessionToken: "must-not-be-rendered",
  } as unknown as ClientVisibleRoomState;
  const playerOneModel = toClientRoomViewModel(poisonedView);
  const playerTwoModel = toClientRoomViewModel(playerTwoView);

  assert.equal(playerOneModel.seats[0].hand?.length, 14);
  assert.equal(playerOneModel.seats[1].hand, null);
  assert.equal(playerTwoModel.seats[0].hand, null);
  assert.equal(playerTwoModel.seats[1].hand?.length, 13);
  assert.equal(playerOneModel.seats[1].handCount, 13);

  const serialized = JSON.stringify(playerOneModel);
  for (const privateKey of [
    "seed",
    "wall",
    "sessionToken",
    "pendingPlayerIds",
    "passedPlayerIds",
    "huClaims",
    "meldClaims",
    "usedTiles",
    "pengMeldIndex",
  ]) {
    assert.equal(serialized.includes(`\"${privateKey}\"`), false, privateKey);
  }

  assert.equal(serialized.includes("wallCount"), true);
  assert.deepEqual(playerOneModel.legalActions, ["chooseMissingSuit"]);
});

function readyFourPlayerRoom(): RoomState {
  let room = createRoom({ id: "mobile-safe-view", seed: "mobile-safe-seed" });

  for (const [index, playerId] of ["p1", "p2", "p3", "p4"].entries()) {
    room = join(room, playerId, `玩家${index + 1}`);
    room = seat(room, playerId, index as PlayerId);
    room = ready(room, playerId);
  }

  return room;
}

function join(room: RoomState, playerId: string, displayName: string): RoomState {
  const result = joinRoom(room, { playerId, displayName });
  assert.equal(result.ok, true);
  return result.room;
}

function seat(room: RoomState, playerId: string, seatId: PlayerId): RoomState {
  const result = takeSeat(room, playerId, seatId);
  assert.equal(result.ok, true);
  return result.room;
}

function ready(room: RoomState, playerId: string): RoomState {
  const result = toggleReady(room, playerId);
  assert.equal(result.ok, true);
  return result.room;
}
