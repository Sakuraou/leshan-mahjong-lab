import test from "node:test";
import assert from "node:assert/strict";

import {
  createRoomSocketAdapterState as createRoomSocketAdapterStateBase,
  handleRoomSocketMessage,
  tickRoomSocketDeadlines,
  type RoomSocketAdapterState,
  type RoomSocketClientMessage,
  type RoomSocketServerMessage,
  type Suit,
  type Tile,
} from "../../src/game/index.ts";

function createRoomSocketAdapterState(): RoomSocketAdapterState {
  let nextSession = 1;

  return createRoomSocketAdapterStateBase({
    roomSeedFactory: () => "socket-seed",
    sessionTokenFactory: () => `session-${nextSession++}`,
  });
}

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
    assert.equal(message.payload.view.phase, "dingque");
    assert.deepEqual(message.payload.view.legalActions, ["chooseMissingSuit"]);
    assert.deepEqual(message.payload.view.scores.map((score) => score.points), [0, 0, 0, 0]);
    assert.deepEqual(message.payload.view.settlementLedger, []);

    const players = message.payload.view.round?.players;
    const visibleRound = message.payload.view.round;
    assert.ok(players);
    assert.ok(visibleRound);
    assert.equal("seed" in visibleRound, false);
    assert.equal("wall" in visibleRound, false);
    assert.equal(JSON.stringify(message.payload).includes("socket-seed"), false);
    assert.deepEqual(
      message.payload.events.find((event) => event.type === "roundStarted"),
      { type: "roundStarted", dealer: 0 },
    );
    assert.deepEqual(
      message.payload.view.eventLog.find((event) => event.type === "roundStarted"),
      { type: "roundStarted", dealer: 0 },
    );

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

test("maps chooseMissingSuit and broadcasts redacted snapshots to every session", () => {
  const filled = fillReadyAdapter("socket-room-dingque");
  const started = dispatch(filled.adapter, {
    protocolVersion: 1,
    clientMessageId: "m-start",
    roomId: "socket-room-dingque",
    sessionToken: filled.sessions[0],
    type: "startRound",
    payload: {},
  });
  const result = dispatch(started.adapter, {
    protocolVersion: 1,
    clientMessageId: "m-dingque",
    roomId: "socket-room-dingque",
    sessionToken: filled.sessions[1],
    type: "chooseMissingSuit",
    payload: { suit: "bamboos" },
  });
  const snapshots = snapshotMessages(result.messages);

  assert.equal(result.messages[0].type, "actionAccepted");
  assert.equal(result.messages[0].recipientSessionToken, filled.sessions[1]);
  assert.equal(snapshots.length, 4);

  snapshots.forEach((message, index) => {
    assert.equal(message.payload.view.round?.players[1].missingSuit, "bamboos");
    assert.equal(message.payload.view.round?.players[1].hand !== null, index === 1);
  });
  assert.deepEqual(snapshots[1].payload.events, [
    { type: "missingSuitChosen", seatId: 1, playerId: "player-2", suit: "bamboos" },
  ]);
});

test("maps drawTile and broadcasts redacted snapshots to every session", () => {
  const prepared = prepareAdapterForPlayerTwoDraw("socket-room-draw");
  const result = dispatch(prepared.adapter, {
    protocolVersion: 1,
    clientMessageId: "m-draw",
    roomId: "socket-room-draw",
    sessionToken: prepared.sessions[1],
    type: "drawTile",
    payload: {},
  });
  const snapshots = snapshotMessages(result.messages);

  assert.equal(result.messages[0].type, "actionAccepted");
  assert.equal(result.messages[0].recipientSessionToken, prepared.sessions[1]);
  assert.equal(snapshots.length, 4);

  snapshots.forEach((message, index) => {
    const playerTwo = message.payload.view.round?.players[1];
    assert.ok(playerTwo);
    assert.equal(playerTwo.handCount, 14);
    assert.equal(playerTwo.hand !== null, index === 1);
    assert.equal(message.payload.view.round?.wallCount, prepared.beforeWallCount - 1);
    assert.equal(message.payload.view.phase, "discard");
    assert.equal(message.payload.view.legalActions.includes("discardTile"), index === 1);
  });
  assert.deepEqual(snapshots[1].payload.events, [{ type: "tileDrawn", seatId: 1, playerId: "player-2" }]);
});

test("maps discardTile and broadcasts redacted snapshots to every session", () => {
  const prepared = prepareAdapterForDealerDiscard("socket-room-discard");
  const result = dispatch(prepared.adapter, {
    protocolVersion: 1,
    clientMessageId: "m-discard",
    roomId: "socket-room-discard",
    sessionToken: prepared.sessions[0],
    type: "discardTile",
    payload: { tile: prepared.discard },
  });
  const snapshots = snapshotMessages(result.messages);

  assert.equal(result.messages[0].type, "actionAccepted");
  assert.equal(result.messages[0].recipientSessionToken, prepared.sessions[0]);
  assert.equal(snapshots.length, 4);

  snapshots.forEach((message, index) => {
    const dealer = message.payload.view.round?.players[0];
    assert.ok(dealer);
    assert.equal(dealer.handCount, 13);
    assert.equal(dealer.hand !== null, index === 0);
    assert.deepEqual(dealer.discards, [prepared.discard]);
    assert.equal(message.payload.view.round?.currentPlayer, 1);
    assert.equal(message.payload.view.phase, "claim");
    assert.equal(message.payload.view.legalActions.includes("passClaim"), index !== 0);
  });
  assert.deepEqual(snapshots[0].payload.events, [
    { type: "tileDiscarded", seatId: 0, playerId: "player-1", tile: prepared.discard },
    { type: "claimWindowOpened", discardedBySeatId: 0, tile: prepared.discard, pendingPlayerIds: [1, 2, 3] },
  ]);
  assert.equal(snapshots[1].payload.view.claimWindow?.pendingPlayerIds.length, 3);
});

test("broadcasts identical redacted snapshots when a server deadline tick expires a window", () => {
  const prepared = prepareAdapterForDealerDiscard("socket-room-deadline");
  const adapter: RoomSocketAdapterState = {
    ...prepared.adapter,
    nowFactory: () => 100_000,
    responseWindowTimeoutMs: 8_000,
    rooms: prepared.adapter.rooms.map((room) => ({
      ...room,
      service: {
        ...room.service,
        nowFactory: () => 100_000,
        responseWindowTimeoutMs: 8_000,
      },
    })),
  };
  const discarded = dispatch(adapter, {
    protocolVersion: 1,
    clientMessageId: "m-deadline-discard",
    roomId: "socket-room-deadline",
    sessionToken: prepared.sessions[0],
    type: "discardTile",
    payload: { tile: prepared.discard },
  });
  const openedSnapshots = snapshotMessages(discarded.messages);
  const windowId = openedSnapshots[0].payload.view.responseWindow?.windowId;
  assert.ok(windowId);
  openedSnapshots.forEach((message) => {
    assert.equal(message.payload.serverNow, 100_000);
    assert.equal(message.payload.view.responseWindow?.windowId, windowId);
    assert.equal(message.payload.view.responseWindow?.remainingMs, 8_000);
  });

  assert.equal(tickRoomSocketDeadlines(discarded.adapter, 107_999).messages.length, 0);
  const expired = tickRoomSocketDeadlines(discarded.adapter, 108_000);
  const expiredSnapshots = snapshotMessages(expired.messages);
  assert.deepEqual(expired.expiredWindowIds, [windowId]);
  assert.equal(expiredSnapshots.length, 4);
  expiredSnapshots.forEach((message, index) => {
    assert.equal(message.payload.serverNow, 108_000);
    assert.equal(message.payload.view.responseWindow, null);
    assert.equal(message.payload.view.localSeatId, index);
    assert.equal(message.payload.view.round?.players[index].hand !== null, true);
    message.payload.view.round?.players.forEach((player, playerIndex) => {
      if (playerIndex !== index) assert.equal(player.hand, null);
    });
  });
  assert.equal(tickRoomSocketDeadlines(expired.adapter, 108_001).messages.length, 0);
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

function prepareAdapterForPlayerTwoDraw(roomId: string): {
  adapter: RoomSocketAdapterState;
  sessions: string[];
  beforeWallCount: number;
} {
  const filled = fillReadyAdapter(roomId);
  let adapter = dispatch(filled.adapter, {
    protocolVersion: 1,
    clientMessageId: "m-start-draw",
    roomId,
    sessionToken: filled.sessions[0],
    type: "startRound",
    payload: {},
  }).adapter;
  const suits = ["bamboos", "dots", "characters", "bamboos"] as const;

  filled.sessions.forEach((sessionToken, index) => {
    adapter = dispatch(adapter, {
      protocolVersion: 1,
      clientMessageId: `m-dingque-${index + 1}`,
      roomId,
      sessionToken,
      type: "chooseMissingSuit",
      payload: { suit: suits[index] },
    }).adapter;
  });

  const service = adapter.rooms[0].service;
  const beforeWallCount = service.room.round?.wall.length ?? 0;

  return {
    sessions: filled.sessions,
    beforeWallCount,
    adapter: {
      ...adapter,
      rooms: [
        {
          ...adapter.rooms[0],
          service: {
            ...service,
            room: {
              ...service.room,
              phase: "draw",
              round: {
                ...service.room.round!,
                currentPlayer: 1,
              },
            },
          },
        },
      ],
    },
  };
}

function prepareAdapterForDealerDiscard(roomId: string): {
  adapter: RoomSocketAdapterState;
  sessions: string[];
  discard: Tile;
} {
  const filled = fillReadyAdapter(roomId);
  let adapter = dispatch(filled.adapter, {
    protocolVersion: 1,
    clientMessageId: "m-start-discard",
    roomId,
    sessionToken: filled.sessions[0],
    type: "startRound",
    payload: {},
  }).adapter;
  const service = adapter.rooms[0].service;
  const discard = findDiscardCandidate(service.room.round!.players[0].hand);
  const suits: Suit[] = [discard.suit, "dots", "characters", "bamboos"];

  filled.sessions.forEach((sessionToken, index) => {
    adapter = dispatch(adapter, {
      protocolVersion: 1,
      clientMessageId: `m-dingque-discard-${index + 1}`,
      roomId,
      sessionToken,
      type: "chooseMissingSuit",
      payload: { suit: suits[index] },
    }).adapter;
  });

  return { adapter, sessions: filled.sessions, discard };
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

function createRoomMessage(clientMessageId: string, roomId: string, displayName: string): RoomSocketClientMessage {
  return {
    protocolVersion: 1,
    clientMessageId,
    type: "createRoom",
    payload: { roomId, displayName },
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
