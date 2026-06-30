import test from "node:test";
import assert from "node:assert/strict";

import {
  createRoomSocketAdapterState,
  handleRoomSocketMessage,
  type RoomSocketAdapterState,
  type RoomSocketClientMessage,
  type RoomSocketServerMessage,
} from "../../src/game/index.ts";

test("maps createRoom to room service and returns a host snapshot", () => {
  const result = dispatch(createRoomSocketAdapterState(), createRoomMessage("m-create", "socket-room-create", "Host"));

  assert.equal(result.adapter.rooms.length, 1);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].type, "actionAccepted");
  assert.equal(result.messages[0].recipientSessionToken, "session-1");

  const snapshot = snapshotMessages(result.messages)[0];
  assert.equal(snapshot.roomId, "socket-room-create");
  assert.equal(snapshot.recipientSessionToken, "session-1");
  assert.equal(snapshot.payload.sessionToken, "session-1");
  assert.equal(snapshot.payload.playerId, "player-1");
  assert.equal(snapshot.payload.lastEventId, 2);
  assert.deepEqual(
    snapshot.payload.events.map((event) => event.type),
    ["roomCreated", "playerJoined"],
  );
});

test("maps joinRoom to room service and broadcasts snapshots to sessions", () => {
  let adapter = createRoomSocketAdapterState();
  adapter = dispatch(adapter, createRoomMessage("m-create", "socket-room-join", "Host")).adapter;

  const result = dispatch(adapter, {
    protocolVersion: 1,
    clientMessageId: "m-join",
    roomId: "socket-room-join",
    type: "joinRoom",
    payload: { displayName: "Player Two" },
  });
  const snapshots = snapshotMessages(result.messages);

  assert.equal(result.adapter.rooms[0].service.room.members.length, 2);
  assert.equal(result.messages[0].type, "actionAccepted");
  assert.equal(result.messages[0].recipientSessionToken, "session-2");
  assert.deepEqual(
    snapshots.map((message) => message.recipientSessionToken),
    ["session-1", "session-2"],
  );
  assert.equal(snapshots[1].payload.playerId, "player-2");
  assert.deepEqual(snapshots[1].payload.events, [{ type: "playerJoined", playerId: "player-2", displayName: "Player Two" }]);
});

test("returns actionRejected when a room action uses an invalid session", () => {
  let adapter = createRoomSocketAdapterState();
  adapter = dispatch(adapter, createRoomMessage("m-create", "socket-room-reject", "Host")).adapter;

  const result = dispatch(adapter, {
    protocolVersion: 1,
    clientMessageId: "m-seat",
    roomId: "socket-room-reject",
    sessionToken: "missing-session",
    type: "takeSeat",
    payload: { seatId: 0 },
  });

  assert.equal(result.adapter, adapter);
  assert.deepEqual(result.messages, [
    {
      protocolVersion: 1,
      serverEventId: 0,
      roomId: "socket-room-reject",
      recipientSessionToken: "missing-session",
      type: "actionRejected",
      payload: {
        clientMessageId: "m-seat",
        code: "invalidSession",
        message: "Session is invalid.",
      },
    },
  ]);
});

test("maps resumeSession to missed events and a client snapshot", () => {
  let adapter = createRoomSocketAdapterState();
  adapter = dispatch(adapter, createRoomMessage("m-create", "socket-room-resume", "Host")).adapter;
  const clientCursor = adapter.rooms[0].service.lastEventId;
  adapter = dispatch(adapter, takeSeatMessage("m-seat", "socket-room-resume", "session-1", 0)).adapter;
  adapter = dispatch(adapter, toggleReadyMessage("m-ready", "socket-room-resume", "session-1")).adapter;

  const result = dispatch(adapter, {
    protocolVersion: 1,
    clientMessageId: "m-resume",
    roomId: "socket-room-resume",
    sessionToken: "session-1",
    type: "resumeSession",
    payload: { lastSeenEventId: clientCursor },
  });
  const snapshot = snapshotMessages(result.messages)[0];

  assert.equal(result.messages[0].type, "actionAccepted");
  assert.equal(snapshot.recipientSessionToken, "session-1");
  assert.deepEqual(
    snapshot.payload.events.map((event) => event.type),
    ["seatTaken", "readyChanged"],
  );
  assert.equal(snapshot.payload.view.localSeatId, 0);
});

test("broadcasts each session its own redacted view after startRound", () => {
  const filled = fillReadyAdapter("socket-room-redacted");
  const result = dispatch(filled.adapter, {
    protocolVersion: 1,
    clientMessageId: "m-start",
    roomId: "socket-room-redacted",
    sessionToken: filled.sessions[0],
    type: "startRound",
    payload: {},
  });
  const snapshots = snapshotMessages(result.messages);

  assert.equal(result.messages[0].type, "actionAccepted");
  assert.equal(snapshots.length, 4);

  snapshots.forEach((message, index) => {
    assert.equal(message.recipientSessionToken, filled.sessions[index]);
    assert.equal(message.payload.view.localSeatId, index);

    const players = message.payload.view.round?.players;
    assert.ok(players);

    players.forEach((player, playerIndex) => {
      if (playerIndex === index) {
        assert.equal(player.hand?.length, index === 0 ? 14 : 13);
      } else {
        assert.equal(player.hand, null);
        assert.equal(player.handCount, playerIndex === 0 ? 14 : 13);
      }
    });
  });
});

function fillReadyAdapter(roomId: string): { adapter: RoomSocketAdapterState; sessions: string[] } {
  let adapter = createRoomSocketAdapterState();
  adapter = dispatch(adapter, createRoomMessage("m-create", roomId, "Player One")).adapter;

  for (const [index, displayName] of ["Player Two", "Player Three", "Player Four"].entries()) {
    adapter = dispatch(adapter, {
      protocolVersion: 1,
      clientMessageId: `m-join-${index + 2}`,
      roomId,
      type: "joinRoom",
      payload: { displayName },
    }).adapter;
  }

  const sessions = ["session-1", "session-2", "session-3", "session-4"];

  sessions.forEach((sessionToken, index) => {
    adapter = dispatch(adapter, takeSeatMessage(`m-seat-${index + 1}`, roomId, sessionToken, index as 0 | 1 | 2 | 3)).adapter;
    adapter = dispatch(adapter, toggleReadyMessage(`m-ready-${index + 1}`, roomId, sessionToken)).adapter;
  });

  return { adapter, sessions };
}

function createRoomMessage(clientMessageId: string, roomId: string, displayName: string): RoomSocketClientMessage {
  return {
    protocolVersion: 1,
    clientMessageId,
    type: "createRoom",
    payload: { roomId, seed: "socket-seed", displayName },
  };
}

function takeSeatMessage(
  clientMessageId: string,
  roomId: string,
  sessionToken: string,
  seatId: 0 | 1 | 2 | 3,
): RoomSocketClientMessage {
  return {
    protocolVersion: 1,
    clientMessageId,
    roomId,
    sessionToken,
    type: "takeSeat",
    payload: { seatId },
  };
}

function toggleReadyMessage(
  clientMessageId: string,
  roomId: string,
  sessionToken: string,
): RoomSocketClientMessage {
  return {
    protocolVersion: 1,
    clientMessageId,
    roomId,
    sessionToken,
    type: "toggleReady",
    payload: {},
  };
}

function dispatch(adapter: RoomSocketAdapterState, message: RoomSocketClientMessage) {
  return handleRoomSocketMessage(adapter, message);
}

function snapshotMessages(messages: RoomSocketServerMessage[]) {
  return messages.filter((message) => message.type === "roomSnapshot");
}
