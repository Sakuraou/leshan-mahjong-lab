import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

import {
  createMobileRoomTransport,
  descriptorForAction,
  legalTilesForAction,
  mergeMobilePublicEvents,
  nextAutomaticDrawActionId,
  parseMobileRoomServerMessage,
  toMobileIntermissionViewModel,
  toMobileRoundResultViewModel,
  type MobilePublicEvent,
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

  const withSafeDeadline = structuredClone(message);
  withSafeDeadline.payload.view.turnDeadline = {
    windowId: "ROOM:turn:1:dingque:all:1",
    kind: "dingque",
    seatId: null,
    deadlineAt: 31_000,
    remainingMs: 30_000,
  };
  const deadlineParsed = parseMobileRoomServerMessage(withSafeDeadline);
  assert.equal(deadlineParsed.ok, true);
  if (deadlineParsed.ok && deadlineParsed.message.type === "roomSnapshot") {
    assert.deepEqual(deadlineParsed.message.payload.view.turnDeadline, withSafeDeadline.payload.view.turnDeadline);
  }

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
    (withOpponentHand.payload.view.round.players[1] as unknown as { hand: unknown[] }).hand = [tile("characters", 9)];
  }
  assert.deepEqual(parseMobileRoomServerMessage(withOpponentHand), {
    ok: false,
    reason: "牌局公开视图结构不合法",
  });

  const withPrivateMissedEvent = structuredClone(message) as unknown as {
    payload: { events: Array<{ type: string; pendingPlayerIds: number[] }> };
  };
  withPrivateMissedEvent.payload.events = [{ type: "claimResponse", pendingPlayerIds: [1, 2] }];
  assert.deepEqual(parseMobileRoomServerMessage(withPrivateMissedEvent), {
    ok: false,
    reason: "roomSnapshot 包含客户端禁止字段",
  });

  const withPublicMissedEvent = structuredClone(message) as unknown as {
    payload: { events: Array<{ type: string; playerId: string; seatId: number; connected: boolean; reason: string }> };
  };
  withPublicMissedEvent.payload.events = [{
    type: "presenceChanged",
    playerId: "p1",
    seatId: 0,
    connected: true,
    reason: "sessionResumed",
  }];
  const publicEventParsed = parseMobileRoomServerMessage(withPublicMissedEvent);
  assert.equal(publicEventParsed.ok, true);
  if (publicEventParsed.ok && publicEventParsed.message.type === "roomSnapshot") {
    assert.deepEqual(publicEventParsed.message.payload.events, [{
      eventId: 1,
      type: "presenceChanged",
      playerId: "p1",
      seatId: 0,
      connected: true,
      reason: "sessionResumed",
    }]);
  }
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

test("mobile terminal DTO exposes final scores and safe settlement summaries", () => {
  const room = startedRoom();
  const view = {
    ...toClientVisibleRoomState(room, "p1"),
    gameStatus: "betweenRounds" as const,
    status: "ended" as const,
    phase: "ended" as const,
    roundEnd: { reason: "wallEmpty" as const, remainingPlayerIds: [0 as const, 1 as const, 2 as const, 3 as const] },
    scores: [
      { seatId: 0 as const, playerId: "p1", points: 24 },
      { seatId: 1 as const, playerId: "p2", points: -8 },
      { seatId: 2 as const, playerId: "p3", points: -8 },
      { seatId: 3 as const, playerId: "p4", points: -8 },
    ],
    nextDealerDecision: {
      roundId: "ROOM:round:1",
      completedRoundNumber: 1,
      nextDealerSeatId: 0 as const,
      reason: "wallEmptyDealerKeeps" as const,
      firstWinnerSeatId: null,
      multipleHuDiscarderSeatId: null,
    },
    roundHistory: [{
      roundId: "ROOM:round:1",
      roundNumber: 1,
      dealerSeatId: 0 as const,
      roundEnd: { reason: "wallEmpty" as const, remainingPlayerIds: [0 as const, 1 as const, 2 as const, 3 as const] },
      nextDealerDecision: {
        roundId: "ROOM:round:1",
        completedRoundNumber: 1,
        nextDealerSeatId: 0 as const,
        reason: "wallEmptyDealerKeeps" as const,
        firstWinnerSeatId: null,
        multipleHuDiscarderSeatId: null,
      },
      scoreDeltas: [
        { seatId: 0 as const, playerId: "p1", beforePoints: 0, delta: 24, afterPoints: 24 },
        { seatId: 1 as const, playerId: "p2", beforePoints: 0, delta: -8, afterPoints: -8 },
        { seatId: 2 as const, playerId: "p3", beforePoints: 0, delta: -8, afterPoints: -8 },
        { seatId: 3 as const, playerId: "p4", beforePoints: 0, delta: -8, afterPoints: -8 },
      ],
    }],
    legalActions: ["readyNextRound" as const, "finishGame" as const],
    actionDescriptors: [
      { action: "readyNextRound" as const, actionId: "ROOM:between:p1:ready" },
      { action: "finishGame" as const, actionId: "ROOM:between:p1:finish" },
    ],
    settlementLedger: [
      {
        id: 1,
        batchId: 1,
        winnerSeatId: 0 as const,
        winnerPlayerId: "p1",
        loserSeatId: 1 as const,
        loserPlayerId: "p2",
        reason: "selfDrawHu" as const,
        sourceWindowId: null,
        basePoints: 1 as const,
        rawPoints: 8,
        finalPoints: 8,
        relatedEvent: { type: "selfDrawHuClaimed" as const, seatId: 0 as const },
      },
      {
        id: 2,
        batchId: 2,
        winnerSeatId: 0 as const,
        winnerPlayerId: "p1",
        loserSeatId: 2 as const,
        loserPlayerId: "p3",
        reason: "sanJi" as const,
        chickenSuit: "bamboos" as const,
        chickenCount: 3 as const,
        sourceWindowId: null,
        sourceSettlementId: "chicken:1",
        basePoints: 16 as const,
        rawPoints: 16 as const,
        finalPoints: 16 as const,
        relatedEvent: { type: "roundEnded" as const, reason: "wallEmpty" as const },
      },
      {
        id: 3,
        batchId: 3,
        winnerSeatId: 0 as const,
        winnerPlayerId: "p1",
        loserSeatId: 3 as const,
        loserPlayerId: "p4",
        reason: "anGang" as const,
        targetTile: null,
        usesLaizi: true,
        sourceWindowId: null,
        sourceSettlementId: "gang:1",
        basePoints: 4 as const,
        rawPoints: 2 as const,
        finalPoints: 2 as const,
        relatedEvent: { type: "anGangClaimed" as const, seatId: 0 as const },
      },
      {
        id: 4,
        batchId: 4,
        winnerSeatId: 1 as const,
        winnerPlayerId: "p2",
        loserSeatId: 3 as const,
        loserPlayerId: "p4",
        reason: "chaJiao" as const,
        patterns: ["qingYiSe" as const],
        genCount: 1,
        sourceWindowId: null,
        sourceSettlementId: "cha-jiao:1",
        basePoints: 1 as const,
        rawPoints: 8,
        finalPoints: 8,
        relatedEvent: { type: "roundEnded" as const, reason: "wallEmpty" as const },
      },
    ],
  };
  const parsed = parseMobileRoomServerMessage(snapshotMessage(view, "p1"));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.message.type !== "roomSnapshot") return;

  assert.deepEqual(parsed.message.payload.view.roundEnd, {
    reason: "wallEmpty",
    remainingPlayerIds: [0, 1, 2, 3],
  });
  assert.deepEqual(parsed.message.payload.view.settlementLedger[0], {
    winnerSeatId: 0,
    winnerPlayerId: "p1",
    loserSeatId: 1,
    loserPlayerId: "p2",
    reason: "selfDrawHu",
    basePoints: 1,
    rawPoints: 8,
    finalPoints: 8,
  });
  assert.deepEqual(
    parsed.message.payload.view.settlementLedger.map((entry) => entry.reason),
    ["selfDrawHu", "sanJi", "anGang", "chaJiao"],
  );
  const serialized = JSON.stringify(parsed.message.payload.view);
  assert.equal(serialized.includes("sourceWindowId"), false);
  assert.equal(serialized.includes("batchId"), false);
  assert.equal(serialized.includes("relatedEvent"), false);
  assert.equal("settlementLedger" in parsed.message.payload.view.roundHistory[0], false);

  const withInternalRoundLedger = structuredClone(snapshotMessage(view, "p1"));
  (withInternalRoundLedger.payload.view.roundHistory[0] as Record<string, unknown>).settlementLedger = [];
  assert.equal(parseMobileRoomServerMessage(withInternalRoundLedger).ok, false);

  const result = toMobileRoundResultViewModel(parsed.message.payload.view);
  assert.equal(result?.reasonLabel, "牌墙已空，流局并完成查叫");
  assert.equal(result?.scores[0].cumulativePoints, 24);
  assert.deepEqual(result?.settlements.map((entry) => entry.label), [
    "自摸",
    "一条三鸡",
    "暗杠（含幺鸡）",
    "查叫",
  ]);
  assert.deepEqual(toMobileIntermissionViewModel(parsed.message.payload.view)?.actions, [
    { action: "readyNextRound", actionId: "ROOM:between:p1:ready" },
    { action: "finishGame", actionId: "ROOM:between:p1:finish" },
  ]);
});

test("public event merging deduplicates, sorts, and keeps only the newest items", () => {
  const event = (eventId: number, connected: boolean): MobilePublicEvent => ({
    eventId,
    type: "presenceChanged",
    playerId: `p${eventId}`,
    seatId: (eventId % 4) as 0 | 1 | 2 | 3,
    connected,
    reason: connected ? "sessionResumed" : "connectionClosed",
  });
  const merged = mergeMobilePublicEvents(
    [event(3, true), event(1, true)],
    [event(2, false), event(3, true), event(4, true)],
    3,
  );
  assert.deepEqual(merged.map((entry) => entry.eventId), [2, 3, 4]);
  assert.throws(() => mergeMobilePublicEvents([event(3, true)], [event(3, false)]), /Conflicting/);
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

test("mobile transport merges filtered resume events without duplicates", async () => {
  const socket = new FakeSocket();
  const transportPromise = createMobileRoomTransport({
    url: "ws://example.test",
    roomId: "ROOM",
    eventLimit: 2,
    socketFactory: () => socket,
  });
  socket.open();
  const transport = await transportPromise;
  const createPromise = transport.createRoomSession({ displayName: "手机玩家" });
  const request = JSON.parse(socket.sent[0]) as { clientMessageId: string };
  socket.serverSend({
    protocolVersion: 1,
    serverEventId: 2,
    roomId: "ROOM",
    recipientSessionToken: "secure-token",
    type: "actionAccepted",
    payload: { clientMessageId: request.clientMessageId, playerId: "p1" },
  });
  assert.equal((await createPromise).ok, true);

  const view = toClientVisibleRoomState(createRoom({ id: "ROOM", seed: "server-only" }), "p1");
  const first = snapshotMessage(view, "p1");
  first.serverEventId = 2;
  first.payload.lastEventId = 2;
  first.payload.events = [
    { type: "roomCreated", roomId: "ROOM" },
    { type: "playerJoined", playerId: "p1", displayName: "手机玩家" },
  ];
  socket.serverSend(first);
  assert.deepEqual(transport.getState().events.map((event) => event.eventId), [2]);

  const resumed = snapshotMessage(view, "p1");
  resumed.serverEventId = 4;
  resumed.payload.lastEventId = 4;
  resumed.payload.events = [
    { type: "tileDrawn", seatId: 0, playerId: "p1" },
    { type: "readyChanged", seatId: 0, playerId: "p1", ready: true },
  ];
  socket.serverSend(resumed);
  socket.serverSend(resumed);
  assert.deepEqual(transport.getState().events.map((event) => event.eventId), [2, 4]);
  transport.close();
});

test("mobile transport always echoes the current action descriptor and blocks stale local choices", async () => {
  const socket = new FakeSocket();
  const transportPromise = createMobileRoomTransport({
    url: "ws://example.test",
    roomId: "ROOM",
    socketFactory: () => socket,
  });
  socket.open();
  const transport = await transportPromise;
  const createPromise = transport.createRoomSession({ displayName: "手机玩家" });
  const createRequest = JSON.parse(socket.sent[0]) as { clientMessageId: string };
  socket.serverSend({
    protocolVersion: 1,
    serverEventId: 1,
    roomId: "ROOM",
    recipientSessionToken: "secure-token",
    type: "actionAccepted",
    payload: { clientMessageId: createRequest.clientMessageId, playerId: "p1" },
  });
  assert.equal((await createPromise).ok, true);

  let room = startedRoom();
  const candidate = room.round?.players[0].hand.find((value) =>
    !(value.rank === 1 && (value.suit === "bamboos" || value.suit === "dots")));
  assert.notEqual(candidate, undefined);
  for (const [playerId, suit] of [
    ["p1", candidate!.suit],
    ["p2", "dots"],
    ["p3", "characters"],
    ["p4", "bamboos"],
  ] as const) {
    const chosen = chooseMissingSuit(room, playerId, suit);
    assert.equal(chosen.ok, true);
    if (chosen.ok) room = chosen.room;
  }
  const view = toClientVisibleRoomState(room, "p1");
  socket.serverSend(snapshotMessage(view, "p1"));
  const descriptor = descriptorForAction(view, "discardTile");
  const discard = legalTilesForAction(view, "discardTile")[0];
  assert.notEqual(descriptor, null);
  assert.notEqual(discard, undefined);

  const sentBeforeStale = socket.sent.length;
  const stale = await transport.discardTile(discard!, "old-action-id");
  assert.deepEqual(stale, {
    ok: false,
    kind: "action",
    code: "staleAction",
    reason: "staleAction",
  });
  assert.equal(socket.sent.length, sentBeforeStale);

  const discardPromise = transport.discardTile(discard!, descriptor!.actionId);
  const request = JSON.parse(socket.sent.at(-1)!) as {
    clientMessageId: string;
    payload: { expectedActionId: string };
  };
  assert.equal(request.payload.expectedActionId, descriptor!.actionId);
  socket.serverSend({
    protocolVersion: 1,
    serverEventId: 2,
    roomId: "ROOM",
    recipientSessionToken: "secure-token",
    type: "actionRejected",
    payload: { clientMessageId: request.clientMessageId, code: "staleAction", message: "stale" },
  });
  assert.equal((await discardPromise).ok, false);

  const activeGangView: ClientVisibleRoomState = {
    ...view,
    legalActions: ["claimAnGang", "claimBaGang", "exchangeGangYaoJi"],
    actionDescriptors: [
      {
        action: "claimAnGang",
        actionId: "an-gang-action",
        tiles: [{ suit: discard!.suit, rank: discard!.rank }],
      },
      {
        action: "claimBaGang",
        actionId: "ba-gang-action",
        candidates: [{
          candidateId: "ba-gang-candidate",
          targetTile: tile("characters", 3),
          addedTile: discard!,
          usesLaizi: false,
          paymentEligibility: "normal",
          payerSeatIds: [1, 2, 3],
          pointsPerPayer: 2,
        }],
      },
      {
        action: "exchangeGangYaoJi",
        actionId: "exchange-action",
        candidates: [{
          candidateId: "exchange-candidate",
          gangType: "baGang",
          targetTile: tile("characters", 3),
          naturalTile: discard!,
          returnedYaoJi: tile("dots", 1),
        }],
      },
    ],
  };
  socket.serverSend(snapshotMessage(activeGangView, "p1"));
  for (const [action, actionId] of [
    ["claimAnGang", "an-gang-action"],
    ["claimBaGang", "ba-gang-action"],
    ["exchangeGangYaoJi", "exchange-action"],
  ] as const) {
    const actionPromise = action === "claimAnGang"
      ? transport.claimAnGang({ suit: discard!.suit, rank: discard!.rank }, actionId)
      : action === "claimBaGang"
        ? transport.claimBaGang("ba-gang-candidate", actionId)
        : transport.exchangeGangYaoJi("exchange-candidate", actionId);
    const gangRequest = JSON.parse(socket.sent.at(-1)!) as {
      clientMessageId: string;
      type: string;
      payload: { expectedActionId: string; tile?: unknown; candidateId?: string };
    };
    assert.equal(gangRequest.type, action);
    assert.equal(gangRequest.payload.expectedActionId, actionId);
    if (action === "claimAnGang") {
      assert.deepEqual(gangRequest.payload.tile, { suit: discard!.suit, rank: discard!.rank });
    } else {
      assert.equal(
        gangRequest.payload.candidateId,
        action === "claimBaGang" ? "ba-gang-candidate" : "exchange-candidate",
      );
    }
    socket.serverSend({
      protocolVersion: 1,
      serverEventId: 3,
      roomId: "ROOM",
      recipientSessionToken: "secure-token",
      type: "actionRejected",
      payload: { clientMessageId: gangRequest.clientMessageId, code: "staleAction", message: "stale" },
    });
    assert.equal((await actionPromise).ok, false);
  }
  transport.close();
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

test("a fresh mobile transport resumes the same real session and seat", async () => {
  const server = await createRoomSocketDevServer({ port: 0 });
  const first = await createMobileRoomTransport({
    url: server.url,
    roomId: "mobile-resume-room",
    socketFactory: (url) => new WebSocket(url) as unknown as MobileWebSocketLike,
  });
  let resumed: MobileRoomTransport | null = null;
  try {
    const created = await first.createRoomSession({ displayName: "Host" });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal((await first.takeSeat(0)).ok, true);
    const beforeClose = await waitForTransport(first, (state) =>
      state.snapshot?.seats[0].playerId === created.playerId ? state : null);
    first.close();
    await delay(20);

    resumed = await createMobileRoomTransport({
      url: server.url,
      roomId: "mobile-resume-room",
      socketFactory: (url) => new WebSocket(url) as unknown as MobileWebSocketLike,
    });
    const recovery = await resumed.resumeSession({
      sessionToken: created.sessionToken,
      lastSeenEventId: beforeClose.lastEventId,
    });
    assert.equal(recovery.ok, true);
    if (!recovery.ok) return;
    const recovered = await waitForTransport(resumed, (state) =>
      state.snapshot?.seats[0].connected === true ? state : null);
    assert.equal(recovery.playerId, created.playerId);
    assert.equal(recovery.sessionToken, created.sessionToken);
    assert.equal(recovered.playerId, created.playerId);
    assert.equal(recovered.sessionToken, created.sessionToken);
    assert.equal(recovered.snapshot?.seats[0].playerId, created.playerId);
  } finally {
    first.close();
    resumed?.close();
    await server.close();
  }
});

test("recovery transport sends only resume and never replays an uncertain discard", async () => {
  const firstSocket = new FakeSocket();
  const firstPromise = createMobileRoomTransport({
    url: "ws://example.test",
    roomId: "ROOM",
    socketFactory: () => firstSocket,
  });
  firstSocket.open();
  const first = await firstPromise;
  const createPromise = first.createRoomSession({ displayName: "手机玩家" });
  const createRequest = JSON.parse(firstSocket.sent[0]) as { clientMessageId: string };
  firstSocket.serverSend({
    protocolVersion: 1,
    serverEventId: 1,
    roomId: "ROOM",
    recipientSessionToken: "secure-token",
    type: "actionAccepted",
    payload: { clientMessageId: createRequest.clientMessageId, playerId: "p1" },
  });
  assert.equal((await createPromise).ok, true);

  let room = startedRoom();
  for (const [playerId, suit] of [
    ["p1", "characters"],
    ["p2", "dots"],
    ["p3", "dots"],
    ["p4", "dots"],
  ] as const) {
    const chosen = chooseMissingSuit(room, playerId, suit);
    assert.equal(chosen.ok, true);
    if (chosen.ok) room = chosen.room;
  }
  const view = toClientVisibleRoomState(room, "p1");
  firstSocket.serverSend(snapshotMessage(view, "p1"));
  const descriptor = descriptorForAction(view, "discardTile");
  const discard = legalTilesForAction(view, "discardTile")[0];
  assert.notEqual(descriptor, null);
  assert.notEqual(discard, undefined);

  const uncertainDiscard = first.discardTile(discard!, descriptor!.actionId);
  assert.equal((JSON.parse(firstSocket.sent.at(-1)!) as { type: string }).type, "discardTile");
  firstSocket.close();
  assert.deepEqual(await uncertainDiscard, {
    ok: false,
    kind: "transport",
    code: "closed",
    reason: "连接已关闭",
  });

  const recoverySocket = new FakeSocket();
  const recoveryPromise = createMobileRoomTransport({
    url: "ws://example.test",
    roomId: "ROOM",
    socketFactory: () => recoverySocket,
  });
  recoverySocket.open();
  const recovery = await recoveryPromise;
  const resumePromise = recovery.resumeSession({ sessionToken: "secure-token", lastSeenEventId: 1 });
  const resumeRequest = JSON.parse(recoverySocket.sent[0]) as { clientMessageId: string; type: string };
  assert.equal(resumeRequest.type, "resumeSession");
  recoverySocket.serverSend({
    protocolVersion: 1,
    serverEventId: 2,
    roomId: "ROOM",
    recipientSessionToken: "secure-token",
    type: "actionAccepted",
    payload: { clientMessageId: resumeRequest.clientMessageId, playerId: "p1" },
  });
  recoverySocket.serverSend(snapshotMessage(view, "p1"));
  assert.equal((await resumePromise).ok, true);
  assert.deepEqual(
    recoverySocket.sent.map((entry) => (JSON.parse(entry) as { type: string }).type),
    ["resumeSession"],
  );
  recovery.close();
});

test("mobile transports complete a real authoritative draw and discard turn", async () => {
  const server = await createRoomSocketDevServer({ port: 0, responseWindowTimeoutMs: 3_000 });
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
      const dingqueView = await waitForTransport(transport, (state) =>
        state.snapshot?.phase === "dingque" || state.snapshot?.phase === "discard"
          ? state.snapshot
          : null);
      if (dingqueView.legalActions.includes("chooseMissingSuit")) {
        assert.equal((await transport.chooseMissingSuit("characters")).ok, true);
      } else {
        const localSeatId = dingqueView.localSeatId;
        assert.notEqual(localSeatId, null);
        assert.notEqual(dingqueView.round?.players[localSeatId!]?.missingSuit, null);
      }
    }

    const hostDiscardView = await waitForTransport(transports[0], (state) =>
      state.snapshot?.phase === "discard" ? state.snapshot : null);
    const hostDiscard = legalTilesForAction(hostDiscardView, "discardTile")[0];
    const hostDiscardActionId = descriptorForAction(hostDiscardView, "discardTile")?.actionId;
    assert.notEqual(hostDiscard, undefined);
    assert.notEqual(hostDiscardActionId, undefined);
    assert.equal((await transports[0].discardTile(hostDiscard, hostDiscardActionId!)).ok, true);

    for (const transport of transports.slice(1)) {
      const claimView = await waitForTransport(transport, (state) =>
        state.snapshot?.legalActions.includes("passClaim") ? state.snapshot : null);
      const passActionId = descriptorForAction(claimView, "passClaim")?.actionId;
      assert.notEqual(passActionId, undefined);
      assert.equal((await transport.passClaim(passActionId!)).ok, true);
    }

    const drawView = await waitForTransport(transports[1], (state) =>
      state.snapshot?.legalActions.includes("drawTile") ? state.snapshot : null);
    const wallBefore = drawView.round?.wallCount ?? 0;
    const drawActionId = nextAutomaticDrawActionId(drawView, null, null);
    assert.notEqual(drawActionId, null);
    assert.equal((await transports[1].drawTile(drawActionId!)).ok, true);
    const discardView = await waitForTransport(transports[1], (state) =>
      state.snapshot?.phase === "discard" ? state.snapshot : null);
    assert.equal(discardView.round?.wallCount, wallBefore - 1);
    assert.equal(nextAutomaticDrawActionId(discardView, null, drawActionId), null);

    const discard = legalTilesForAction(discardView, "discardTile")[0];
    const discardActionId = descriptorForAction(discardView, "discardTile")?.actionId;
    assert.notEqual(discard, undefined);
    assert.notEqual(discardActionId, undefined);
    assert.equal((await transports[1].discardTile(discard, discardActionId!)).ok, true);
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

  const gangDrawView: ClientVisibleRoomState = {
    ...view,
    phase: "gangDraw",
    legalActions: ["drawGangTile"],
    actionDescriptors: [{ action: "drawGangTile", actionId: "gang-draw-1" }],
  };
  assert.equal(nextAutomaticDrawActionId(gangDrawView, null, null), "gang-draw-1");
  assert.equal(nextAutomaticDrawActionId(gangDrawView, "gang-draw-1", null), null);
  assert.equal(nextAutomaticDrawActionId(gangDrawView, null, "gang-draw-1"), null);
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
  const legalTiles = legalTilesForAction(view, "discardTile");
  assert.deepEqual(legalTiles.map(({ suit, rank }) => ({ suit, rank })), [tile("characters", 3)]);
  assert.equal(typeof legalTiles[0]?.tileId, "string");
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
    payload: { view, playerId, lastEventId: 1, serverNow: 1_000, events: [] as unknown[] },
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
      const state = transport.getState();
      reject(new Error(`Timed out waiting for mobile transport state: ${JSON.stringify({
        status: state.status,
        phase: state.snapshot?.phase ?? null,
        legalActions: state.snapshot?.legalActions ?? [],
        lastError: state.lastError,
      })}`));
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
