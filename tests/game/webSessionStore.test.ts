import assert from "node:assert/strict";
import test from "node:test";

import type { PersistedRoomSession } from "@leshan-mahjong/client-core";
import {
  createWebRoomSessionStore,
  type BrowserSessionStorage,
} from "../../apps/mobile/src/webSessionStore.ts";

test("browser room sessions stay isolated per tab and survive a same-tab reload", async () => {
  const firstTab = createStorage();
  const secondTab = createStorage();
  const firstStore = createWebRoomSessionStore(firstTab);
  const reloadedFirstStore = createWebRoomSessionStore(firstTab);
  const secondStore = createWebRoomSessionStore(secondTab);
  const session = persistedSession("session-one");

  await firstStore.save(session);

  assert.deepEqual(await reloadedFirstStore.load(), session);
  assert.equal(await secondStore.load(), null);
  await firstStore.clear();
  assert.equal(await reloadedFirstStore.load(), null);
});

test("browser room session parsing drops fields outside the public recovery contract", async () => {
  const storage = createStorage();
  storage.setItem("leshan-mahjong.room-session.v1", JSON.stringify({
    ...persistedSession("safe-session"),
    seed: "hidden-seed",
    wall: [{ suit: "dots", rank: 9 }],
    otherPlayerHands: [[{ suit: "characters", rank: 1 }]],
    pendingResponses: [{ playerId: "player-2", action: "claimHu" }],
  }));

  const loaded = await createWebRoomSessionStore(storage).load();

  assert.deepEqual(loaded, persistedSession("safe-session"));
  assert.equal("seed" in (loaded ?? {}), false);
  assert.equal("wall" in (loaded ?? {}), false);
  assert.equal("otherPlayerHands" in (loaded ?? {}), false);
  assert.equal("pendingResponses" in (loaded ?? {}), false);
});

function createStorage(): BrowserSessionStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
}

function persistedSession(sessionToken: string): PersistedRoomSession {
  return {
    serverUrl: "wss://rooms.example.test/ws",
    roomId: "browser-room",
    playerId: "player-1",
    sessionToken,
    lastEventId: 7,
    lastCompletedAutoDrawActionId: "round-1:draw:1",
    handOrderRoundNumber: 1,
    handOrderTileIds: ["tile-2", "tile-1"],
  };
}
