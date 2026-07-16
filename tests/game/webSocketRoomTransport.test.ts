import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import type { WebSocketLike, WebSocketRoomTransport } from "../../src/webSocketRoomTransport.ts";
import { createWebSocketRoomTransport } from "../../src/webSocketRoomTransport.ts";
import { createRoomSocketDevServer } from "../../src/server/devServer.ts";
import type { PlayerId, Suit, Tile } from "../../src/game/index.ts";

test("websocket room transport tracks session snapshots over a real dev server", async () => {
  const server = await createRoomSocketDevServer({
    port: 0,
    responseWindowTimeoutMs: 50,
    deadlinePollIntervalMs: 10,
  });
  const roomId = "transport-real-ws-room";
  const transports: WebSocketRoomTransport[] = [];

  try {
    for (let index = 0; index < 4; index += 1) {
      transports.push(
        await createWebSocketRoomTransport({
          url: server.url,
          roomId,
          webSocketFactory: createNodeWebSocket,
        }),
      );
    }

    assert.equal((await transports[0].createRoomSession({ displayName: "Player One" })).ok, true);
    assert.doesNotMatch(transports[0].getSessionToken("player-1") ?? "", /^session-\d+$/);

    for (const [index, transport] of transports.slice(1).entries()) {
      assert.equal((await transport.joinRoomSession({ displayName: `Player ${index + 2}` })).ok, true);
      assert.ok(transport.getSessionToken(`player-${index + 2}`));
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

    const hostHand = transports[0].getClientView("player-1")?.round?.players[0].hand;
    assert.ok(hostHand);
    const hostDiscard = findDiscardCandidate(hostHand);

    const requestedSuits: Suit[] = [hostDiscard.suit, "characters", "dots", "bamboos"];
    const expectedSuits: Suit[] = [];

    for (const [index, suit] of requestedSuits.entries()) {
      const playerId = `player-${index + 1}`;
      const view = transports[index].getClientView(playerId);
      const automaticMissingSuit = view?.round?.players[index].missingSuit ?? null;

      if (automaticMissingSuit === null) {
        assert.equal((await transports[index].chooseMissingSuit(playerId, suit)).ok, true);
      }

      expectedSuits.push(automaticMissingSuit ?? suit);
    }

    for (const [index, suit] of expectedSuits.entries()) {
      await waitForMissingSuitSnapshots(transports, index, suit);
    }

    const dealerDraw = await transports[0].drawTile("player-1");
    assert.equal(dealerDraw.ok, false);
    assert.equal(dealerDraw.reason, "actionRejected");
    assert.equal(dealerDraw.rejectedMessage?.payload.code, "notDrawPhase");

    const discarded = await transports[0].discardTile("player-1", hostDiscard);
    assert.equal(discarded.ok, true);
    await waitForDiscardSnapshots(transports, hostDiscard);

    await waitForClaimWindowClosed(transports);
    assert.equal(
      transports[1]
        .getClientView("player-2")
        ?.eventLog.some((event) => event.type === "responseWindowExpired"),
      true,
    );

    const playerTwoDraw = await transports[1].drawTile("player-2");
    assert.equal(playerTwoDraw.ok, true);
    await waitForPlayerHandCount(transports, 1, 14);

    transports.forEach((transport, index) => {
      const view = transport.getClientView(`player-${index + 1}`);
      assert.ok(view?.round);
      assert.equal(view.localSeatId, index);
      assert.equal(view.round.players[1].missingSuit, "characters");

      view.round.players.forEach((player, playerIndex) => {
        const expectedHandCount = playerIndex === 0 || playerIndex === 1 ? 14 - Number(playerIndex === 0) : 13;

        if (playerIndex === index) {
          assert.equal(player.hand?.length, expectedHandCount);
        } else {
          assert.equal(player.hand, null);
          assert.equal(player.handCount, expectedHandCount);
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
      webSocketFactory: createNodeWebSocket,
    });
    transports.push(host);

    assert.equal((await host.createRoomSession({ displayName: "Player One" })).ok, true);
    const sessionToken = host.getSessionToken("player-1");
    assert.ok(sessionToken);

    const initialLastEventId = host.getState().messages.find((message) => message.type === "roomSnapshot")?.payload.lastEventId;
    assert.equal(initialLastEventId, 2);

    assert.equal((await host.takeSeat("player-1", 0)).ok, true);
    assert.equal((await host.toggleReady("player-1")).ok, true);

    const resumed = await createWebSocketRoomTransport({
      url: server.url,
      roomId,
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
    assert.equal(resumed.getSessionToken("player-1"), sessionToken);
    assert.equal(resumed.getClientView("player-1")?.seats[0].ready, true);
  } finally {
    transports.forEach((transport) => transport.close());
    await server.close();
  }
});

test("broadcasts offline presence and restores the same seat over real sockets", async () => {
  const server = await createRoomSocketDevServer({ port: 0 });
  const roomId = "transport-presence-ws-room";
  const transports: WebSocketRoomTransport[] = [];

  try {
    const host = await createWebSocketRoomTransport({
      url: server.url,
      roomId,
      webSocketFactory: createNodeWebSocket,
    });
    const guest = await createWebSocketRoomTransport({
      url: server.url,
      roomId,
      webSocketFactory: createNodeWebSocket,
    });
    transports.push(host, guest);

    assert.equal((await host.createRoomSession({ displayName: "Player One" })).ok, true);
    assert.equal((await host.takeSeat("player-1", 0)).ok, true);
    assert.equal((await host.toggleReady("player-1")).ok, true);
    assert.equal((await guest.joinRoomSession({ displayName: "Player Two" })).ok, true);
    const sessionToken = host.getSessionToken("player-1");
    assert.ok(sessionToken);

    host.close();
    await waitForSeatPresence(guest, "player-2", 0, false);
    assert.equal(guest.getClientView("player-2")?.seats[0].ready, true);

    const resumed = await createWebSocketRoomTransport({
      url: server.url,
      roomId,
      webSocketFactory: createNodeWebSocket,
    });
    transports.push(resumed);
    const resumeResult = await resumed.resumeSession({ sessionToken, lastSeenEventId: 4 });
    assert.equal(resumeResult.ok, true);

    await waitForSeatPresence(guest, "player-2", 0, true);
    await waitForSeatPresence(resumed, "player-1", 0, true);
    assert.equal(resumed.getClientView("player-1")?.seats[0].ready, true);
    assert.equal(resumed.getSessionToken("player-1"), sessionToken);
    assert.equal(
      resumed.getClientView("player-1")?.eventLog.findLast((event) => event.type === "presenceChanged")?.type,
      "presenceChanged",
    );
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
      webSocketFactory: createNodeWebSocket,
    });
    transports.push(host);
    assert.equal((await host.createRoomSession({ displayName: "Player One" })).ok, true);

    const invalidSession = await createWebSocketRoomTransport({
      url: server.url,
      roomId,
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

async function waitForSeatPresence(
  transport: WebSocketRoomTransport,
  playerId: string,
  seatId: 0 | 1 | 2 | 3,
  connected: boolean,
): Promise<void> {
  const deadline = Date.now() + 3_000;

  while (transport.getClientView(playerId)?.seats[seatId].connected !== connected) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for seat ${seatId} presence ${connected}.`);
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

async function waitForDiscardSnapshots(transports: WebSocketRoomTransport[], discard: Tile): Promise<void> {
  const deadline = Date.now() + 3_000;

  while (
    transports.some((transport, index) => {
      const dealer = transport.getClientView(`player-${index + 1}`)?.round?.players[0];
      return dealer?.handCount !== 13 || dealer.discards.length !== 1 || !sameTile(dealer.discards[0], discard);
    })
  ) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for WebSocket discard snapshots.");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForPlayerHandCount(
  transports: WebSocketRoomTransport[],
  playerIndex: number,
  handCount: number,
): Promise<void> {
  const deadline = Date.now() + 3_000;

  while (
    transports.some(
      (transport, index) =>
        transport.getClientView(`player-${index + 1}`)?.round?.players[playerIndex].handCount !== handCount,
    )
  ) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for WebSocket hand count snapshots.");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForClaimWindowClosed(transports: WebSocketRoomTransport[]): Promise<void> {
  const deadline = Date.now() + 3_000;

  while (transports.some((transport, index) => transport.getClientView(`player-${index + 1}`)?.claimWindow !== null)) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for WebSocket claim window to close.");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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

function sameTile(left: Tile | undefined, right: Tile): boolean {
  return left?.suit === right.suit && left.rank === right.rank;
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
