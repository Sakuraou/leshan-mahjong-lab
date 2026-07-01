import test from "node:test";
import assert from "node:assert/strict";

import { createRoomSocketDevServer } from "../../src/server/devServer.ts";
import { runRoomSocketSmokeClient } from "../../src/server/smokeClient.ts";

test("dev WebSocket server handles createRoom and joinRoom over real sockets", async () => {
  const server = await createRoomSocketDevServer({ port: 0 });

  try {
    const result = await runRoomSocketSmokeClient({
      url: server.url,
      roomId: "real-ws-smoke-room",
    });

    assert.deepEqual(
      result.hostMessages.map((message) => message.type),
      ["actionAccepted", "roomSnapshot", "roomSnapshot"],
    );
    assert.deepEqual(
      result.guestMessages.map((message) => message.type),
      ["actionAccepted", "roomSnapshot"],
    );

    const guestSnapshot = result.guestMessages.find((message) => message.type === "roomSnapshot");
    assert.ok(guestSnapshot);
    assert.equal(guestSnapshot.payload.playerId, "player-2");
    assert.equal(guestSnapshot.payload.view.seats.length, 4);
    assert.equal(guestSnapshot.payload.view.eventLog.at(-1)?.type, "playerJoined");
  } finally {
    await server.close();
  }
});
