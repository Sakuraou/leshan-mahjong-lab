import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import type { WebSocketLike, WebSocketRoomTransport } from "../../src/webSocketRoomTransport.ts";
import { createWebSocketRoomTransport } from "../../src/webSocketRoomTransport.ts";
import { createRoomSocketDevServer } from "../../src/server/devServer.ts";
import type { PlayerId } from "../../src/game/index.ts";

test("websocket room transport tracks session snapshots over a real dev server", async () => {
  const server = await createRoomSocketDevServer({ port: 0 });
  const roomId = "transport-real-ws-room";
  const transports: WebSocketRoomTransport[] = [];

  try {
    for (let index = 0; index < 4; index += 1) {
      transports.push(
        await createWebSocketRoomTransport({
          url: server.url,
          roomId,
          seed: "transport-real-ws-seed",
          webSocketFactory: createNodeWebSocket,
        }),
      );
    }

    assert.equal((await transports[0].createRoomSession({ displayName: "Player One" })).ok, true);
    assert.equal(transports[0].getSessionToken("player-1"), "session-1");

    for (const [index, transport] of transports.slice(1).entries()) {
      assert.equal((await transport.joinRoomSession({ displayName: `Player ${index + 2}` })).ok, true);
      assert.equal(transport.getSessionToken(`player-${index + 2}`), `session-${index + 2}`);
    }

    await transports[0].waitForMessageCount(5);
    assert.deepEqual(transports[0].getClientView("player-1")?.eventLog.at(-1), {
      type: "playerJoined",
      playerId: "player-4",
      displayName: "Player 4",
    });

    for (const [index, transport] of transports.entries()) {
      const playerId = `player-${index + 1}`;
      assert.equal((await transport.takeSeat(playerId, index as PlayerId)).ok, true);
      assert.equal((await transport.toggleReady(playerId)).ok, true);
    }

    await transports[0].waitForMessageCount(13);
    assert.equal(transports[0].getClientView("player-1")?.seats[1].displayName, "Player 2");

    const started = await transports[0].startRound("player-1", 0);
    assert.equal(started.ok, true);

    await waitForRoundSnapshots(transports);

    const chosen = await transports[1].chooseMissingSuit("player-2", "characters");
    assert.equal(chosen.ok, true);
    await waitForMissingSuitSnapshots(transports, 1, "characters");

    for (const [index, suit] of ["bamboos", "dots", "characters", "bamboos"].entries()) {
      const playerId = `player-${index + 1}`;
      const view = transports[index].getClientView(playerId);

      if (view?.round?.players[index].missingSuit !== null) {
        continue;
      }

      assert.equal((await transports[index].chooseMissingSuit(playerId, suit as "bamboos" | "dots" | "characters")).ok, true);
    }

    await waitForMissingSuitSnapshots(transports, 0, "bamboos");
    await waitForMissingSuitSnapshots(transports, 2, "characters");
    await waitForMissingSuitSnapshots(transports, 3, "bamboos");

    const dealerDraw = await transports[0].drawTile("player-1");
    assert.equal(dealerDraw.ok, false);
    assert.equal(dealerDraw.reason, "actionRejected");
    assert.equal(dealerDraw.rejectedMessage?.payload.code, "notDrawPhase");

    transports.forEach((transport, index) => {
      const view = transport.getClientView(`player-${index + 1}`);
      assert.ok(view?.round);
      assert.equal(view.localSeatId, index);
      assert.equal(view.round.players[1].missingSuit, "characters");

      view.round.players.forEach((player, playerIndex) => {
        if (playerIndex === index) {
          assert.equal(player.hand?.length, index === 0 ? 14 : 13);
        } else {
          assert.equal(player.hand, null);
          assert.equal(player.handCount, playerIndex === 0 ? 14 : 13);
        }
      });
    });
  } finally {
    transports.forEach((transport) => transport.close());
    await server.close();
  }
});

test("websocket room transport resumes a stored session over a real dev server", async () => {
  const server = await createRoomSocketDevServer({ port: 0 });
  const roomId = "transport-resume-ws-room";
  const transports: WebSocketRoomTransport[] = [];

  try {
    const host = await createWebSocketRoomTransport({
      url: server.url,
      roomId,
      seed: "transport-resume-ws-seed",
      webSocketFactory: createNodeWebSocket,
    });
    transports.push(host);

    assert.equal((await host.createRoomSession({ displayName: "Player One" })).ok, true);
    const sessionToken = host.getSessionToken("player-1");
    assert.equal(sessionToken, "session-1");

    const initialLastEventId = host.getState().messages.find((message) => message.type === "roomSnapshot")?.payload.lastEventId;
    assert.equal(initialLastEventId, 2);

    assert.equal((await host.takeSeat("player-1", 0)).ok, true);
    assert.equal((await host.toggleReady("player-1")).ok, true);

    const resumed = await createWebSocketRoomTransport({
      url: server.url,
      roomId,
      seed: "transport-resume-ws-seed",
      webSocketFactory: createNodeWebSocket,
    });
    transports.push(resumed);

    const resumeResult = await resumed.resumeSession({ sessionToken, lastSeenEventId: initialLastEventId });
    assert.equal(resumeResult.ok, true);

    const resumeSnapshot = resumed.getState().messages.findLast((message) => message.type === "roomSnapshot");
    assert.equal(resumeSnapshot?.payload.playerId, "player-1");
    assert.equal(resumeSnapshot?.payload.lastEventId, 4);
    assert.deepEqual(
      resumeSnapshot?.payload.events.map((event) => event.type),
      ["seatTaken", "readyChanged"],
    );
    assert.equal(resumed.getSessionToken("player-1"), "session-1");
    assert.equal(resumed.getClientView("player-1")?.seats[0].ready, true);
  } finally {
    transports.forEach((transport) => transport.close());
    await server.close();
  }
});

test("websocket room transport reports failed resume reasons over a real dev server", async () => {
  const server = await createRoomSocketDevServer({ port: 0 });
  const roomId = "transport-failed-resume-ws-room";
  const transports: WebSocketRoomTransport[] = [];

  try {
    const missingRoom = await createWebSocketRoomTransport({
      url: server.url,
      roomId: "missing-resume-room",
      seed: "transport-failed-resume-ws-seed",
      webSocketFactory: createNodeWebSocket,
    });
    transports.push(missingRoom);

    const missingRoomResult = await missingRoom.resumeSession({ sessionToken: "session-missing-room", lastSeenEventId: 0 });
    assert.equal(missingRoomResult.ok, false);
    assert.equal(missingRoomResult.reason, "actionRejected");
    assert.equal(missingRoomResult.rejectedMessage?.payload.code, "roomNotFound");

    const host = await createWebSocketRoomTransport({
      url: server.url,
      roomId,
      seed: "transport-failed-resume-ws-seed",
      webSocketFactory: createNodeWebSocket,
    });
    transports.push(host);
    assert.equal((await host.createRoomSession({ displayName: "Player One" })).ok, true);

    const invalidSession = await createWebSocketRoomTransport({
      url: server.url,
      roomId,
      seed: "transport-failed-resume-ws-seed",
      webSocketFactory: createNodeWebSocket,
    });
    transports.push(invalidSession);

    const invalidSessionResult = await invalidSession.resumeSession({ sessionToken: "session-invalid", lastSeenEventId: 0 });
    assert.equal(invalidSessionResult.ok, false);
    assert.equal(invalidSessionResult.reason, "actionRejected");
    assert.equal(invalidSessionResult.rejectedMessage?.payload.code, "invalidSession");
  } finally {
    transports.forEach((transport) => transport.close());
    await server.close();
  }
});

async function waitForRoundSnapshots(transports: WebSocketRoomTransport[]): Promise<void> {
  const deadline = Date.now() + 3_000;

  while (transports.some((transport, index) => transport.getClientView(`player-${index + 1}`)?.round == null)) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for WebSocket round snapshots.");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForMissingSuitSnapshots(
  transports: WebSocketRoomTransport[],
  playerIndex: number,
  suit: "characters" | "dots" | "bamboos",
): Promise<void> {
  const deadline = Date.now() + 3_000;

  while (
    transports.some(
      (transport, index) =>
        transport.getClientView(`player-${index + 1}`)?.round?.players[playerIndex].missingSuit !== suit,
    )
  ) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for WebSocket missing suit snapshots.");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createNodeWebSocket(url: string): WebSocketLike {
  const socket = new WebSocket(url);

  return {
    get readyState() {
      return socket.readyState;
    },
    send: (data) => socket.send(data),
    close: () => socket.close(),
    addEventListener: (type, listener) => {
      if (type === "message") {
        socket.on("message", (data) => listener({ data }));
        return;
      }

      socket.on(type, () => listener({}));
    },
  };
}
