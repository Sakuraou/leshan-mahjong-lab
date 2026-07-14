import test from "node:test";
import assert from "node:assert/strict";

import {
  createRoomSocketServerCoreState,
  handleRoomSocketConnectionClosed,
  handleRoomSocketRawMessage,
  markRoomSocketConnectionAlive,
  registerRoomSocketConnection,
  tickRoomSocketConnectionHealth,
  type RoomSocketServerCoreState,
} from "../../src/server/index.ts";
import type { PlayerId, RoomSocketClientMessage, RoomSocketServerMessage } from "../../src/game/index.ts";

test("routes adapter messages to registered session connections", () => {
  let server = createConnectedServer(["conn-host", "conn-guest"]);

  const created = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(createRoomMessage("m-create", "server-room-route", "Host")),
  );
  server = created.state;

  assert.equal(created.errors.length, 0);
  assert.equal(created.undelivered.length, 0);
  assert.deepEqual(
    created.outgoing.map((message) => message.connectionId),
    ["conn-host", "conn-host"],
  );
  assert.equal(sessionFor(server, "conn-host"), "session-1");

  const joined = handleRoomSocketRawMessage(
    server,
    "conn-guest",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-join",
      roomId: "server-room-route",
      type: "joinRoom",
      payload: { displayName: "Guest" },
    } satisfies RoomSocketClientMessage),
  );
  server = joined.state;

  assert.equal(joined.errors.length, 0);
  assert.equal(joined.undelivered.length, 0);
  assert.equal(sessionFor(server, "conn-guest"), "session-2");
  assert.deepEqual(
    joined.outgoing.map((message) => [message.connectionId, message.message.type]),
    [
      ["conn-guest", "actionAccepted"],
      ["conn-host", "roomSnapshot"],
      ["conn-guest", "roomSnapshot"],
    ],
  );
});

test("rejects invalid JSON before calling the room adapter", () => {
  const server = createConnectedServer(["conn-host"]);
  const result = handleRoomSocketRawMessage(server, "conn-host", "{not-json");

  assert.equal(result.state, server);
  assert.equal(result.outgoing.length, 0);
  assert.equal(result.undelivered.length, 0);
  assert.deepEqual(result.errors, [
    {
      connectionId: "conn-host",
      type: "protocolError",
      payload: {
        code: "invalidJson",
        message: "Message must be valid JSON.",
      },
    },
  ]);
});

test("returns action rejections to the requesting connection", () => {
  let server = createConnectedServer(["conn-host", "conn-guest"]);
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(createRoomMessage("m-create", "server-room-missing-session", "Host")),
  ).state;

  const result = handleRoomSocketRawMessage(
    server,
    "conn-guest",
    JSON.stringify(takeSeatMessage("m-seat", "server-room-missing-session", "missing-session", 0)),
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.undelivered.length, 0);
  assert.deepEqual(
    result.outgoing.map((message) => [message.connectionId, message.message.type]),
    [["conn-guest", "actionRejected"]],
  );
  assert.equal(actionRejected(result.outgoing[0].message).payload.code, "invalidSession");
});

test("accepts chooseMissingSuit protocol messages and routes snapshots", () => {
  let server = createConnectedServer(["conn-host"]);
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(createRoomMessage("m-create", "server-room-dingque", "Host")),
  ).state;

  const result = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-dingque",
      roomId: "server-room-dingque",
      sessionToken: "session-1",
      type: "chooseMissingSuit",
      payload: { suit: "dots" },
    } satisfies RoomSocketClientMessage),
  );

  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    result.outgoing.map((message) => [message.connectionId, message.message.type]),
    [["conn-host", "actionRejected"]],
  );
  assert.equal(actionRejected(result.outgoing[0].message).payload.code, "roundNotStarted");
});

test("accepts drawTile protocol messages and routes adapter rejections", () => {
  let server = createConnectedServer(["conn-host"]);
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(createRoomMessage("m-create", "server-room-draw", "Host")),
  ).state;

  const result = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-draw",
      roomId: "server-room-draw",
      sessionToken: "session-1",
      type: "drawTile",
      payload: {},
    } satisfies RoomSocketClientMessage),
  );

  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    result.outgoing.map((message) => [message.connectionId, message.message.type]),
    [["conn-host", "actionRejected"]],
  );
  assert.equal(actionRejected(result.outgoing[0].message).payload.code, "roundNotStarted");
});

test("accepts discardTile protocol messages and routes adapter rejections", () => {
  let server = createConnectedServer(["conn-host"]);
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(createRoomMessage("m-create", "server-room-discard", "Host")),
  ).state;

  const result = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-discard",
      roomId: "server-room-discard",
      sessionToken: "session-1",
      type: "discardTile",
      payload: { tile: { suit: "characters", rank: 5 } },
    } satisfies RoomSocketClientMessage),
  );

  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    result.outgoing.map((message) => [message.connectionId, message.message.type]),
    [["conn-host", "actionRejected"]],
  );
  assert.equal(actionRejected(result.outgoing[0].message).payload.code, "roundNotStarted");
});

test("accepts qiang gang protocol messages and routes adapter rejections", () => {
  for (const type of ["passQiangGang", "claimQiangGangHu"] as const) {
    let server = createConnectedServer(["conn-host"]);
    server = handleRoomSocketRawMessage(
      server,
      "conn-host",
      JSON.stringify(createRoomMessage(`m-create-${type}`, `server-room-${type}`, "Host")),
    ).state;

    const result = handleRoomSocketRawMessage(
      server,
      "conn-host",
      JSON.stringify({
        protocolVersion: 1,
        clientMessageId: `m-${type}`,
        roomId: `server-room-${type}`,
        sessionToken: "session-1",
        type,
        payload: {},
      } satisfies RoomSocketClientMessage),
    );

    assert.equal(result.errors.length, 0);
    assert.deepEqual(
      result.outgoing.map((message) => [message.connectionId, message.message.type]),
      [["conn-host", "actionRejected"]],
    );
    assert.equal(actionRejected(result.outgoing[0].message).payload.code, "roundNotStarted");
  }
});

test("rebinds a resumed session to the newest connection", () => {
  let server = createConnectedServer(["conn-host", "conn-resumed"]);
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(createRoomMessage("m-create", "server-room-resume-route", "Host")),
  ).state;

  const result = handleRoomSocketRawMessage(
    server,
    "conn-resumed",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-resume",
      roomId: "server-room-resume-route",
      sessionToken: "session-1",
      type: "resumeSession",
      payload: { lastSeenEventId: 0 },
    } satisfies RoomSocketClientMessage),
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.undelivered.length, 0);
  assert.deepEqual(
    result.outgoing.map((message) => [message.connectionId, message.message.type]),
    [
      ["conn-resumed", "actionAccepted"],
      ["conn-resumed", "roomSnapshot"],
    ],
  );
  assert.equal(sessionFor(result.state, "conn-host"), undefined);
  assert.equal(sessionFor(result.state, "conn-resumed"), "session-1");
  assert.equal(playerFor(result.state, "conn-resumed"), "player-1");

  const staleAction = handleRoomSocketRawMessage(
    result.state,
    "conn-host",
    JSON.stringify(takeSeatMessage("m-stale-seat", "server-room-resume-route", "session-1", 0)),
  );
  assert.deepEqual(staleAction.errors, [
    {
      connectionId: "conn-host",
      type: "protocolError",
      payload: {
        code: "sessionNotBound",
        message: "Session is bound to another connection; resume it on this connection first.",
      },
    },
  ]);
  assert.equal(staleAction.state, result.state);

  const staleResume = handleRoomSocketRawMessage(
    result.state,
    "conn-host",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-stale-resume",
      roomId: "server-room-resume-route",
      sessionToken: "session-1",
      type: "resumeSession",
      payload: { lastSeenEventId: 0 },
    } satisfies RoomSocketClientMessage),
  );
  assert.equal(staleResume.state, result.state);
  assert.equal(staleResume.outgoing.length, 0);
  assert.deepEqual(staleResume.errors.map((error) => error.payload.code), ["sessionNotBound"]);
  assert.equal(sessionFor(staleResume.state, "conn-host"), undefined);
  assert.equal(sessionFor(staleResume.state, "conn-resumed"), "session-1");
});

test("only closing the latest session connection broadcasts offline presence", () => {
  let server = createConnectedServer(["conn-host", "conn-guest", "conn-resumed"]);
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(createRoomMessage("m-create", "server-room-presence", "Host")),
  ).state;
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(takeSeatMessage("m-host-seat", "server-room-presence", "session-1", 0)),
  ).state;
  server = handleRoomSocketRawMessage(
    server,
    "conn-guest",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-guest-join",
      roomId: "server-room-presence",
      type: "joinRoom",
      payload: { displayName: "Guest" },
    } satisfies RoomSocketClientMessage),
  ).state;
  server = handleRoomSocketRawMessage(
    server,
    "conn-resumed",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-resume",
      roomId: "server-room-presence",
      sessionToken: "session-1",
      type: "resumeSession",
      payload: { lastSeenEventId: 0 },
    } satisfies RoomSocketClientMessage),
  ).state;

  const roomBeforeStaleClose = server.adapter.rooms[0].service.room;
  const staleClosed = handleRoomSocketConnectionClosed(server, "conn-host");
  assert.equal(staleClosed.outgoing.length, 0);
  assert.equal(staleClosed.undelivered.length, 0);
  assert.equal(staleClosed.state.adapter.rooms[0].service.room, roomBeforeStaleClose);
  assert.equal(staleClosed.state.adapter.rooms[0].service.room.members[0].connected, true);

  const latestClosed = handleRoomSocketConnectionClosed(staleClosed.state, "conn-resumed");
  const guestSnapshot = latestClosed.outgoing.find(
    (outgoing) => outgoing.connectionId === "conn-guest" && outgoing.message.type === "roomSnapshot",
  )?.message;

  assert.equal(latestClosed.state.adapter.rooms[0].service.room.members[0].connected, false);
  assert.equal(latestClosed.state.adapter.rooms[0].service.room.seats[0].connected, false);
  assert.equal(latestClosed.outgoing.some((outgoing) => outgoing.connectionId === "conn-host"), false);
  assert.equal(latestClosed.undelivered.length, 1);
  assert.equal(guestSnapshot?.type, "roomSnapshot");
  if (guestSnapshot?.type !== "roomSnapshot") return;
  assert.equal(guestSnapshot.payload.view.members[0].connected, false);
  assert.deepEqual(guestSnapshot.payload.events, [
    {
      type: "presenceChanged",
      playerId: "player-1",
      seatId: 0,
      connected: false,
      reason: "connectionClosed",
    },
  ]);
});

test("refreshes only the target connection heartbeat with an injected clock", () => {
  let server = createConnectedServerAt(["conn-a", "conn-b"], 1_000);
  const adapter = server.adapter;

  server = markRoomSocketConnectionAlive(server, "conn-a", 2_000);

  assert.equal(connectionFor(server, "conn-a")?.lastSeenAt, 2_000);
  assert.equal(connectionFor(server, "conn-b")?.lastSeenAt, 1_000);
  assert.equal(server.adapter, adapter);
  assert.equal(markRoomSocketConnectionAlive(server, "missing", 3_000), server);
  assert.equal(markRoomSocketConnectionAlive(server, "conn-a", 2_000), server);
  assert.equal(markRoomSocketConnectionAlive(server, "conn-a", 1_500), server);
});

test("expires a bound connection at the timeout boundary and remains idempotent", () => {
  let server = createConnectedServerAt(["conn-host", "conn-guest"], 1_000);
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(createRoomMessage("m-create", "server-room-heartbeat", "Host")),
  ).state;
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify(takeSeatMessage("m-seat", "server-room-heartbeat", "session-1", 0)),
  ).state;
  server = handleRoomSocketRawMessage(
    server,
    "conn-host",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-ready",
      roomId: "server-room-heartbeat",
      sessionToken: "session-1",
      type: "toggleReady",
      payload: {},
    } satisfies RoomSocketClientMessage),
  ).state;
  server = handleRoomSocketRawMessage(
    server,
    "conn-guest",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-join",
      roomId: "server-room-heartbeat",
      type: "joinRoom",
      payload: { displayName: "Guest" },
    } satisfies RoomSocketClientMessage),
  ).state;
  server = markRoomSocketConnectionAlive(server, "conn-guest", 5_900);

  const beforeBoundary = tickRoomSocketConnectionHealth(server, 5_999, 5_000);
  assert.deepEqual(beforeBoundary.expiredConnectionIds, []);
  assert.equal(beforeBoundary.state, server);

  const expired = tickRoomSocketConnectionHealth(server, 6_000, 5_000);
  const room = expired.state.adapter.rooms[0].service.room;
  const guestSnapshot = expired.outgoing.find((message) => message.connectionId === "conn-guest")?.message;

  assert.deepEqual(expired.expiredConnectionIds, ["conn-host"]);
  assert.equal(connectionFor(expired.state, "conn-host"), undefined);
  assert.equal(room.members[0].connected, false);
  assert.equal(room.seats[0].connected, false);
  assert.equal(room.seats[0].playerId, "player-1");
  assert.equal(room.seats[0].ready, true);
  assert.equal(expired.state.adapter.rooms[0].service.sessions[0].sessionToken, "session-1");
  assert.deepEqual(room.settlementLedger, []);
  assert.equal(guestSnapshot?.type, "roomSnapshot");
  assert.doesNotMatch(
    JSON.stringify(guestSnapshot),
    /"connectionId"|"lastSeenAt"|"heartbeat"|"sessionToken"|session-1/,
  );

  const repeated = tickRoomSocketConnectionHealth(expired.state, 6_001, 5_000);
  assert.deepEqual(repeated.expiredConnectionIds, []);
  assert.equal(repeated.state, expired.state);
  assert.deepEqual(repeated.outgoing, []);
});

test("an old heartbeat timeout cannot override a resumed connection", () => {
  let server = createConnectedServerAt(["conn-old", "conn-guest", "conn-new"], 1_000);
  server = handleRoomSocketRawMessage(
    server,
    "conn-old",
    JSON.stringify(createRoomMessage("m-create", "server-room-heartbeat-resume", "Host")),
  ).state;
  server = handleRoomSocketRawMessage(
    server,
    "conn-guest",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-join",
      roomId: "server-room-heartbeat-resume",
      type: "joinRoom",
      payload: { displayName: "Guest" },
    } satisfies RoomSocketClientMessage),
  ).state;
  server = handleRoomSocketRawMessage(
    server,
    "conn-new",
    JSON.stringify({
      protocolVersion: 1,
      clientMessageId: "m-resume",
      roomId: "server-room-heartbeat-resume",
      sessionToken: "session-1",
      type: "resumeSession",
      payload: { lastSeenEventId: 0 },
    } satisfies RoomSocketClientMessage),
  ).state;

  server = markRoomSocketConnectionAlive(server, "conn-old", 5_000);
  server = markRoomSocketConnectionAlive(server, "conn-new", 5_900);
  server = markRoomSocketConnectionAlive(server, "conn-guest", 5_900);
  assert.equal(sessionFor(server, "conn-old"), undefined);
  assert.equal(sessionFor(server, "conn-new"), "session-1");

  const expired = tickRoomSocketConnectionHealth(server, 6_000, 1_000);
  assert.deepEqual(expired.expiredConnectionIds, ["conn-old"]);
  assert.equal(expired.state.adapter.rooms[0].service.room.members[0].connected, true);
  assert.equal(sessionFor(expired.state, "conn-new"), "session-1");
  assert.deepEqual(expired.outgoing, []);
  assert.equal(
    handleRoomSocketConnectionClosed(expired.state, "conn-old").state,
    expired.state,
  );
});

function createConnectedServer(connectionIds: string[]): RoomSocketServerCoreState {
  return createConnectedServerAt(connectionIds, Date.now());
}

function createConnectedServerAt(connectionIds: string[], now: number): RoomSocketServerCoreState {
  let nextSession = 1;

  return connectionIds.reduce(
    (server, connectionId) => registerRoomSocketConnection(server, connectionId, now),
    createRoomSocketServerCoreState({
      roomSeedFactory: () => "server-seed",
      sessionTokenFactory: () => `session-${nextSession++}`,
    }),
  );
}

function connectionFor(server: RoomSocketServerCoreState, connectionId: string) {
  return server.connections.find((connection) => connection.connectionId === connectionId);
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
  seatId: PlayerId,
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

function sessionFor(server: RoomSocketServerCoreState, connectionId: string): string | undefined {
  return server.connections.find((connection) => connection.connectionId === connectionId)?.sessionToken;
}

function playerFor(server: RoomSocketServerCoreState, connectionId: string): string | undefined {
  return server.connections.find((connection) => connection.connectionId === connectionId)?.playerId;
}

function actionRejected(
  message: RoomSocketServerMessage,
): Extract<RoomSocketServerMessage, { type: "actionRejected" }> {
  assert.equal(message.type, "actionRejected");
  return message;
}
