import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

import {
  createMobileRoomTransport,
  legalTilesForAction,
  nextAutomaticDrawActionId,
  parseMobileRoomServerMessage,
  type MobileRoomTransport,
  type MobileWebSocketLike,
} from "@leshan-mahjong/client-core";
import {
  chooseMissingSuit,
  createRoom,
  discardRoomTile,
  joinRoom,
  passClaim,
  startRoomRound,
  takeSeat,
  tile,
  toClientVisibleRoomState,
  toggleReady,
  type ClientVisibleRoomState,
  type RoomState,
} from "../../src/game/index.ts";
import { createRoomSocketDevServer } from "../../src/server/devServer.ts";

test("strict mobile parser projects a safe snapshot and rejects hidden fields", () => {
  const room = startedRoom();
  const message = snapshotMessage(toClientVisibleRoomState(room, "p1"), "p1");
  const parsed = parseMobileRoomServerMessage(JSON.stringify(message));

  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.message.type !== "roomSnapshot") {
    return;
  }
  assert.equal("members" in parsed.message.payload.view, false);
  assert.equal("eventLog" in parsed.message.payload.view, false);
  assert.equal("seed" in parsed.message.payload.view, false);
  assert.equal("wall" in (parsed.message.payload.view.round ?? {}), false);
  assert.equal(parsed.message.payload.view.round?.players[1].hand, null);

  const withSeed = structuredClone(message) as typeof message & { payload: { view: ClientVisibleRoomState & { seed: string } } };
  withSeed.payload.view.seed = "leaked-seed";
  assert.deepEqual(parseMobileRoomServerMessage(withSeed), {
    ok: false,
    reason: "roomSnapshot 包含客户端禁止字段",
  });

  const withWall = structuredClone(message) as typeof message & { payload: { view: ClientVisibleRoomState & { wall: unknown[] } } };
  withWall.payload.view.wall = [];
  assert.equal(parseMobileRoomServerMessage(withWall).ok, false);

  const withPrivateResponses = structuredClone(message) as typeof message & {
    payload: { view: ClientVisibleRoomState & { pendingPlayerIds: number[] } };
  };
  withPrivateResponses.payload.view.pendingPlayerIds = [1, 2];
  assert.equal(parseMobileRoomServerMessage(withPrivateResponses).ok, false);

  const withOpponentHand = structuredClone(message);
  if (withOpponentHand.payload.view.round !== null) {
    withOpponentHand.payload.view.round.players[1].hand = [tile("characters", 9)];
  }
  assert.deepEqual(parseMobileRoomServerMessage(withOpponentHand), {
    ok: false,
    reason: "牌局公开视图结构不合法",
  });
});

test("strict mobile parser rejects malformed message envelopes", () => {
  assert.equal(parseMobileRoomServerMessage("not-json").ok, false);
  assert.equal(parseMobileRoomServerMessage({
    protocolVersion: 1,
    serverEventId: 1,
    roomId: "ROOM",
    type: "actionAccepted",
    recipientSessionToken: "token",
    payload: { clientMessageId: "m1", playerId: "p1", seed: "forbidden" },
  }).ok, false);
  assert.equal(parseMobileRoomServerMessage({
    protocolVersion: 1,
    type: "protocolError",
    payload: { code: "sessionNotBound", message: "Resume on this connection first." },
  }).ok, true);
  assert.equal(parseMobileRoomServerMessage({
    protocolVersion: 1,
    connectionId: "internal-connection",
    type: "protocolError",
    payload: { code: "sessionNotBound", message: "Resume on this connection first." },
  }).ok, false);
});

test("single-session mobile transport stores one snapshot and rejects another player view", async () => {
  const socket = new FakeSocket();
  const transportPromise = createMobileRoomTransport({
    url: "ws://example.test",
    roomId: "ROOM",
    socketFactory: () => socket,
  });
  socket.open();
  const transport = await transportPromise;
  const actionPromise = transport.createRoomSession({ displayName: "手机玩家" });
  const request = JSON.parse(socket.sent[0]) as { clientMessageId: string };
  socket.serverSend({
    protocolVersion: 1,
    serverEventId: 1,
    roomId: "ROOM",
    recipientSessionToken: "secure-token",
    type: "actionAccepted",
    payload: { clientMessageId: request.clientMessageId, playerId: "p1" },
  });
  const accepted = await actionPromise;
  assert.equal(accepted.ok, true);

  const room = createRoom({ id: "ROOM", seed: "server-only" });
  socket.serverSend(snapshotMessage(toClientVisibleRoomState(room, "p1"), "p1"));
  assert.equal(transport.getState().snapshot?.id, "ROOM");
  assert.equal("snapshotByPlayerId" in transport.getState(), false);
  assert.equal("messages" in transport.getState(), false);

  socket.serverSend(snapshotMessage(toClientVisibleRoomState(room, "p2"), "p2"));
  assert.equal(transport.getState().status, "error");
  assert.match(transport.getState().lastError ?? "", /其他玩家/);
});

test("single-session mobile transport consumes real WebSocket server snapshots", async () => {
  const server = await createRoomSocketDevServer({ port: 0 });
  const host = await createMobileRoomTransport({
    url: server.url,
    roomId: "mobile-real-room",
    socketFactory: (url) => new WebSocket(url) as unknown as MobileWebSocketLike,
  });
  const guest = await createMobileRoomTransport({
    url: server.url,
    roomId: "mobile-real-room",
    socketFactory: (url) => new WebSocket(url) as unknown as MobileWebSocketLike,
  });
  try {
    assert.equal((await host.createRoomSession({ displayName: "Host" })).ok, true);
    assert.equal((await guest.joinRoomSession({ displayName: "Guest" })).ok, true);
    const hostView = await host.waitForSnapshot();
    const guestView = await guest.waitForSnapshot();
    assert.equal(hostView.id, "mobile-real-room");
    assert.equal(guestView.id, "mobile-real-room");
    assert.equal(host.getState().playerId, "player-1");
    assert.equal(guest.getState().playerId, "player-2");
    assert.equal("messages" in host.getState(), false);
  } finally {
    host.close();
    guest.close();
    await server.close();
  }
});

test("mobile transports complete a real authoritative draw and discard turn", async () => {
  const server = await createRoomSocketDevServer({ port: 0, responseWindowTimeoutMs: 500 });
  const transports: MobileRoomTransport[] = [];
  try {
    for (let index = 0; index < 4; index += 1) {
      transports.push(await createMobileRoomTransport({
        url: server.url,
        roomId: "mobile-turn-room",
        socketFactory: (url) => new WebSocket(url) as unknown as MobileWebSocketLike,
      }));
    }
    assert.equal((await transports[0].createRoomSession({ displayName: "P1" })).ok, true);
    for (let index = 1; index < 4; index += 1) {
      assert.equal((await transports[index].joinRoomSession({ displayName: `P${index + 1}` })).ok, true);
    }
    for (let index = 0; index < 4; index += 1) {
      assert.equal((await transports[index].takeSeat(index as 0 | 1 | 2 | 3)).ok, true);
      assert.equal((await transports[index].toggleReady()).ok, true);
    }
    assert.equal((await transports[0].startRound(0)).ok, true);
    for (const transport of transports) {
      assert.equal((await transport.chooseMissingSuit("characters")).ok, true);
    }

    const hostDiscardView = await waitForTransport(transports[0], (state) =>
      state.snapshot?.phase === "discard" ? state.snapshot : null);
    const hostDiscard = legalTilesForAction(hostDiscardView, "discardTile")[0];
    assert.notEqual(hostDiscard, undefined);
    assert.equal((await transports[0].discardTile(hostDiscard)).ok, true);

    for (const transport of transports.slice(1)) {
      await waitForTransport(transport, (state) => state.snapshot?.legalActions.includes("passClaim") ? true : null);
      assert.equal((await transport.passClaim()).ok, true);
    }

    const drawView = await waitForTransport(transports[1], (state) =>
      state.snapshot?.legalActions.includes("drawTile") ? state.snapshot : null);
    const wallBefore = drawView.round?.wallCount ?? 0;
    const drawActionId = nextAutomaticDrawActionId(drawView, null, null);
    assert.notEqual(drawActionId, null);
    assert.equal((await transports[1].drawTile()).ok, true);
    const discardView = await waitForTransport(transports[1], (state) =>
      state.snapshot?.phase === "discard" ? state.snapshot : null);
    assert.equal(discardView.round?.wallCount, wallBefore - 1);
    assert.equal(nextAutomaticDrawActionId(discardView, null, drawActionId), null);

    const discard = legalTilesForAction(discardView, "discardTile")[0];
    assert.notEqual(discard, undefined);
    assert.equal((await transports[1].discardTile(discard)).ok, true);
  } finally {
    transports.forEach((transport) => transport.close());
    await server.close();
  }
});

test("automatic draw guard emits once and stays quiet after resume", () => {
  const room = startedRoom();
  let nextRoom = room;
  for (const [playerId, suit] of [["p1", "characters"], ["p2", "dots"], ["p3", "dots"], ["p4", "dots"]] as const) {
    const result = chooseMissingSuit(nextRoom, playerId, suit);
    assert.equal(result.ok, true);
    if (result.ok) nextRoom = result.room;
  }
  const dealerDiscard = legalTilesForAction(toClientVisibleRoomState(nextRoom, "p1"), "discardTile")[0];
  assert.notEqual(dealerDiscard, undefined);
  const discarded = discardRoomTile(nextRoom, "p1", dealerDiscard!);
  assert.equal(discarded.ok, true);
  if (!discarded.ok) return;
  let afterPass = discarded.room;
  for (const playerId of ["p2", "p3", "p4"]) {
    const pass = passClaim(afterPass, playerId);
    assert.equal(pass.ok, true);
    if (pass.ok) afterPass = pass.room;
  }
  const view = toClientVisibleRoomState(afterPass, "p2");
  const first = nextAutomaticDrawActionId(view, null, null);
  assert.notEqual(first, null);
  assert.equal(nextAutomaticDrawActionId(view, first, null), null);
  assert.equal(nextAutomaticDrawActionId(view, null, first), null);
});

test("authoritative discard descriptor exposes only actually legal tiles", () => {
  let room = startedRoom();
  for (const [playerId, suit] of [["p1", "characters"], ["p2", "dots"], ["p3", "dots"], ["p4", "dots"]] as const) {
    const result = chooseMissingSuit(room, playerId, suit);
    assert.equal(result.ok, true);
    if (result.ok) room = result.room;
  }
  assert.notEqual(room.round, null);
  room = {
    ...room,
    round: {
      ...room.round!,
      players: room.round!.players.map((player) => player.id === 0
        ? { ...player, hand: [tile("characters", 3), tile("dots", 5), tile("bamboos", 1)] }
        : player),
    },
  };

  const view = toClientVisibleRoomState(room, "p1");
  assert.deepEqual(legalTilesForAction(view, "discardTile"), [tile("characters", 3)]);
  assert.equal(discardRoomTile(room, "p1", tile("characters", 3)).ok, true);
  assert.equal(discardRoomTile(room, "p1", tile("dots", 5)).ok, false);
  assert.equal(discardRoomTile(room, "p1", tile("bamboos", 1)).ok, false);
});

function startedRoom(): RoomState {
  let room = createRoom({ id: "ROOM", seed: "server-only-seed" });
  for (const [index, playerId] of ["p1", "p2", "p3", "p4"].entries()) {
    const joined = joinRoom(room, { playerId, displayName: playerId });
    if (!joined.ok) throw new Error(`join failed: ${joined.reason}`);
    const seated = takeSeat(joined.room, playerId, index as 0 | 1 | 2 | 3);
    if (!seated.ok) throw new Error(`seat failed: ${seated.reason}`);
    const ready = toggleReady(seated.room, playerId);
    if (!ready.ok) throw new Error(`ready failed: ${ready.reason}`);
    room = ready.room;
  }
  const started = startRoomRound(room, 0);
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  return started.room;
}

function snapshotMessage(view: ReturnType<typeof toClientVisibleRoomState>, playerId: string) {
  return {
    protocolVersion: 1 as const,
    serverEventId: 1,
    roomId: view.id,
    type: "roomSnapshot" as const,
    payload: { view, playerId, lastEventId: 1, serverNow: 1_000, events: [] },
  };
}

class FakeSocket implements MobileWebSocketLike {
  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();

  addEventListener(type: "open" | "close" | "error" | "message", listener: (event: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.emit("close", {});
  }
  open() {
    this.readyState = 1;
    this.emit("open", {});
  }
  serverSend(value: unknown) {
    this.emit("message", { data: JSON.stringify(value) });
  }
  private emit(type: string, event: { data?: unknown }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function waitForTransport<T>(
  transport: MobileRoomTransport,
  select: (state: ReturnType<MobileRoomTransport["getState"]>) => T | null,
  timeoutMs = 3_000,
): Promise<T> {
  const current = select(transport.getState());
  if (current !== null) {
    return Promise.resolve(current);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for mobile transport state."));
    }, timeoutMs);
    const unsubscribe = transport.subscribe((state) => {
      const selected = select(state);
      if (selected !== null) {
        clearTimeout(timer);
        unsubscribe();
        resolve(selected);
      }
    });
  });
}
