import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WebSocket } from "ws";

import { createRoomSocketProductionServer } from "../../src/server/productionServer.ts";
import { loadProductionServerConfig } from "../../src/server/serverConfig.ts";
import { runRoomSocketSmokeClient } from "../../src/server/smokeClient.ts";

const productionEnv = {
  HOST: "127.0.0.1",
  PORT: "0",
  WS_PATH: "/ws",
  ALLOWED_ORIGINS: "https://allowed.example",
  ALLOW_MISSING_ORIGIN: "false",
  SHUTDOWN_GRACE_MS: "50",
};

test("production config validates port, origins, and native missing-origin policy", () => {
  assert.throws(() => loadProductionServerConfig({ ...productionEnv, PORT: "nope" }), /PORT/);
  assert.throws(() => loadProductionServerConfig({ ...productionEnv, ALLOWED_ORIGINS: "*" }), /cannot contain/);
  assert.throws(() => loadProductionServerConfig({ ...productionEnv, ALLOWED_ORIGINS: "", ALLOW_MISSING_ORIGIN: "false" }), /ALLOWED_ORIGINS/);
  assert.equal(loadProductionServerConfig({ ...productionEnv, ALLOW_MISSING_ORIGIN: "true" }).allowMissingOrigin, true);
});

test("Render allows the default Origin sent by React Native Android", async () => {
  const blueprint = await readFile(new URL("../../render.yaml", import.meta.url), "utf8");
  assert.match(
    blueprint,
    /ALLOWED_ORIGINS\s+value: https:\/\/leshan-mahjong-room-server\.onrender\.com/,
  );
});

test("production server exposes health, rejects an untrusted Origin, and closes idempotently", async () => {
  const server = await createRoomSocketProductionServer({ env: productionEnv, onStructuredLog: () => undefined });

  try {
    assert.equal((await fetch(server.liveUrl)).status, 200);
    assert.equal((await fetch(server.readyUrl)).status, 200);
    await expectUpgradeRejected(server.wsUrl, "https://evil.example");

    server.beginDraining();
    assert.equal((await fetch(server.readyUrl)).status, 503);
    const firstClose = server.close();
    const secondClose = server.close();
    assert.equal(firstClose, secondClose);
    await firstClose;
  } finally {
    await server.close();
  }
});

test("production WebSocket flow works and structured logs never contain session tokens", async () => {
  const secret = "secret-session-token-for-log-test";
  const logs: string[] = [];
  let tokenNumber = 0;
  const server = await createRoomSocketProductionServer({
    env: productionEnv,
    sessionTokenFactory: () => {
      tokenNumber += 1;
      return tokenNumber === 1 ? secret : `guest-token-${tokenNumber}`;
    },
    onStructuredLog: (entry) => logs.push(JSON.stringify(entry)),
  });

  try {
    const result = await runRoomSocketSmokeClient({
      url: server.wsUrl,
      origin: "https://allowed.example",
      roomId: "production-log-test",
    });
    assert.equal(result.hostMessages[0]?.type, "actionAccepted");
    assert.equal(logs.join("\n").includes(secret), false);
  } finally {
    await server.close();
  }
});

function expectUpgradeRejected(url: string, origin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { origin });
    const timer = setTimeout(() => reject(new Error("Timed out waiting for Origin rejection.")), 2_000);
    socket.once("open", () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error("Untrusted Origin unexpectedly connected."));
    });
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      assert.equal(response.statusCode, 403);
      resolve();
    });
    socket.once("error", () => undefined);
  });
}
