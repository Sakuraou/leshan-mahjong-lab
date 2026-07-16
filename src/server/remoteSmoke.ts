import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";

import {
  createMobileRoomTransport,
  descriptorForAction,
  legalTilesForAction,
  type ClientLegalAction,
  type MobileRoomTransport,
  type MobileWebSocketLike,
  type Suit,
} from "@leshan-mahjong/client-core";

export type RemoteRoomSmokeOptions = {
  url: string;
  healthUrl?: string;
  roomId?: string;
  origin?: string;
  actionTimeoutMs?: number;
  healthTimeoutMs?: number;
  heartbeatObservationMs?: number;
  staleConnectionObservationMs?: number;
  allowInsecureLocal?: boolean;
  runSecurityProbes?: boolean;
};

export type RemoteRoomSmokeResult = {
  healthStatus: number;
  roomId: string;
  seatedPlayers: number;
  readyPlayers: number;
  completedDiscards: number;
  completedDraws: number;
  resumedPlayerId: string;
  finalPhase: string | null;
  finalCurrentPlayer: number | null;
  originRejected: boolean;
  oversizedPayloadRejected: boolean;
  heartbeatStayedOpen: boolean;
  staleConnectionTimedOut: boolean;
};

const dingqueSuits: Suit[] = ["characters", "dots", "bamboos", "characters"];

export async function runRemoteRoomSmoke(options: RemoteRoomSmokeOptions): Promise<RemoteRoomSmokeResult> {
  const url = validateSmokeUrl(options.url, options.allowInsecureLocal ?? false);
  const healthUrl = options.healthUrl ?? defaultHealthUrl(url);
  const actionTimeoutMs = options.actionTimeoutMs ?? 30_000;
  const healthStatus = await waitForHealth(healthUrl, options.healthTimeoutMs ?? 90_000);
  const roomId = options.roomId ?? `remote-smoke-${Date.now()}`;
  const runSecurityProbes = options.runSecurityProbes ?? true;
  const [originRejected, oversizedPayloadRejected, heartbeatStayedOpen, staleConnectionTimedOut] = await Promise.all([
    runSecurityProbes ? probeRejectedOrigin(url, actionTimeoutMs) : false,
    runSecurityProbes ? probeOversizedPayload(url, actionTimeoutMs) : false,
    probeHeartbeat(url, options.heartbeatObservationMs ?? 12_000, actionTimeoutMs),
    runSecurityProbes
      ? probeStaleConnectionTimeout(url, options.staleConnectionObservationMs ?? 45_000)
      : false,
  ]);
  const transports: MobileRoomTransport[] = [];

  try {
    for (let index = 0; index < 4; index += 1) {
      transports.push(await createMobileRoomTransport({
        url,
        roomId,
        actionTimeoutMs,
        socketFactory: nodeSocketFactory(options.origin),
      }));
    }

    requireAccepted(await transports[0].createRoomSession({ displayName: "Remote Smoke 1" }), "create room");
    for (let index = 1; index < transports.length; index += 1) {
      requireAccepted(
        await transports[index].joinRoomSession({ displayName: `Remote Smoke ${index + 1}` }),
        `join player ${index + 1}`,
      );
    }

    for (let index = 0; index < transports.length; index += 1) {
      requireAccepted(await transports[index].takeSeat(index as 0 | 1 | 2 | 3), `take seat ${index}`);
      requireAccepted(await transports[index].toggleReady(), `ready player ${index + 1}`);
    }

    await waitForAll(transports, (transport) =>
      transport.getState().snapshot?.seats.filter((seat) => seat.playerId !== null).length === 4 &&
      transport.getState().snapshot?.seats.filter((seat) => seat.ready).length === 4,
      actionTimeoutMs,
      "four ready seats",
    );
    requireAccepted(await transports[0].startRound(0), "start round");
    await waitForAll(transports, (transport) => transport.getState().snapshot?.round !== null, actionTimeoutMs, "round start");

    for (let index = 0; index < transports.length; index += 1) {
      const snapshot = transports[index].getState().snapshot;
      const localSeatId = snapshot?.localSeatId;
      const missingSuit = snapshot === null || localSeatId === null || localSeatId === undefined
        ? null
        : snapshot.round?.players[localSeatId].missingSuit ?? null;
      if (missingSuit === null && snapshot?.legalActions.includes("chooseMissingSuit")) {
        requireAccepted(await transports[index].chooseMissingSuit(dingqueSuits[index]), `dingque player ${index + 1}`);
      }
    }

    await waitForAll(transports, (transport) => transport.getState().snapshot?.phase === "discard", actionTimeoutMs, "dealer discard phase");
    await discardFirstLegalTile(transports[0], actionTimeoutMs);
    await passCurrentWindow(transports, [1, 2, 3], "passClaim", actionTimeoutMs);

    await waitForAll(transports, (transport) => {
      const snapshot = transport.getState().snapshot;
      return snapshot?.phase === "draw" && snapshot.round?.currentPlayer === 1;
    }, actionTimeoutMs, "second player draw phase");
    await performAction(transports[1], "drawTile", actionTimeoutMs);
    await waitForTransport(transports[1], (transport) => transport.getState().snapshot?.phase === "discard", actionTimeoutMs, "draw accepted");
    await discardFirstLegalTile(transports[1], actionTimeoutMs);
    await passCurrentWindow(transports, [0, 2, 3], "passClaim", actionTimeoutMs);

    await waitForAll(transports, (transport) => {
      const snapshot = transport.getState().snapshot;
      return snapshot?.phase === "draw" && snapshot.round?.currentPlayer === 2;
    }, actionTimeoutMs, "third player draw phase");

    const previous = transports[3].getState();
    if (previous.sessionToken === null || previous.playerId === null) {
      throw new Error("resume precondition failed without exposing session credentials");
    }
    transports[3].close();
    const resumed = await createMobileRoomTransport({
      url,
      roomId,
      actionTimeoutMs,
      socketFactory: nodeSocketFactory(options.origin),
      initialEvents: previous.events,
    });
    transports[3] = resumed;
    requireAccepted(
      await resumed.resumeSession({ sessionToken: previous.sessionToken, lastSeenEventId: previous.lastEventId }),
      "resume fourth player",
    );
    await waitForTransport(resumed, (transport) => {
      const state = transport.getState();
      return state.snapshot?.localSeatId === 3 && state.snapshot.seats[3].connected;
    }, actionTimeoutMs, "resumed snapshot");

    const finalSnapshot = resumed.getState().snapshot;
    if (finalSnapshot === null) {
      throw new Error("remote smoke completed without a final snapshot");
    }
    return {
      healthStatus,
      roomId,
      seatedPlayers: finalSnapshot.seats.filter((seat) => seat.playerId !== null).length,
      readyPlayers: finalSnapshot.seats.filter((seat) => seat.ready).length,
      completedDiscards: 2,
      completedDraws: 1,
      resumedPlayerId: previous.playerId,
      finalPhase: finalSnapshot.phase,
      finalCurrentPlayer: finalSnapshot.round?.currentPlayer ?? null,
      originRejected,
      oversizedPayloadRejected,
      heartbeatStayedOpen,
      staleConnectionTimedOut,
    };
  } finally {
    transports.forEach((transport) => transport.close());
  }
}

function nodeSocketFactory(origin?: string): (url: string) => MobileWebSocketLike {
  return (url) => new WebSocket(url, origin === undefined ? undefined : { origin }) as unknown as MobileWebSocketLike;
}

async function discardFirstLegalTile(transport: MobileRoomTransport, timeoutMs: number): Promise<void> {
  const descriptor = await waitForDescriptor(transport, "discardTile", timeoutMs);
  const tile = legalTilesForAction(transport.getState().snapshot!, "discardTile")[0];
  if (tile === undefined) {
    throw new Error("no legal discard was provided by the authoritative snapshot");
  }
  requireAccepted(await transport.discardTile(tile, descriptor.actionId), "discard tile");
}

async function passCurrentWindow(
  transports: MobileRoomTransport[],
  responderIndexes: number[],
  action: "passClaim" | "passQiangGang",
  timeoutMs: number,
): Promise<void> {
  for (const index of responderIndexes) {
    const descriptor = await waitForDescriptor(transports[index], action, timeoutMs);
    const result = action === "passClaim"
      ? await transports[index].passClaim(descriptor.actionId)
      : await transports[index].passQiangGang(descriptor.actionId);
    requireAccepted(result, `${action} player ${index + 1}`);
  }
}

async function performAction(
  transport: MobileRoomTransport,
  action: "drawTile" | "drawGangTile",
  timeoutMs: number,
): Promise<void> {
  const descriptor = await waitForDescriptor(transport, action, timeoutMs);
  const result = action === "drawTile"
    ? await transport.drawTile(descriptor.actionId)
    : await transport.drawGangTile(descriptor.actionId);
  requireAccepted(result, action);
}

async function waitForDescriptor(
  transport: MobileRoomTransport,
  action: ClientLegalAction,
  timeoutMs: number,
) {
  await waitForTransport(
    transport,
    (current) => descriptorForAction(current.getState().snapshot, action) !== null,
    timeoutMs,
    `${action} descriptor`,
  );
  const descriptor = descriptorForAction(transport.getState().snapshot, action);
  if (descriptor === null) {
    throw new Error(`${action} descriptor disappeared before use`);
  }
  return descriptor;
}

function waitForAll(
  transports: MobileRoomTransport[],
  predicate: (transport: MobileRoomTransport) => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  return Promise.all(transports.map((transport) => waitForTransport(transport, predicate, timeoutMs, label))).then(() => undefined);
}

function waitForTransport(
  transport: MobileRoomTransport,
  predicate: (transport: MobileRoomTransport) => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  if (predicate(transport)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      const snapshot = transport.getState().snapshot;
      reject(new Error(`${label} timed out at phase ${snapshot?.phase ?? "none"}`));
    }, timeoutMs);
    const unsubscribe = transport.subscribe(() => {
      if (predicate(transport)) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}

function requireAccepted(
  result: Awaited<ReturnType<MobileRoomTransport["createRoomSession"]>>,
  label: string,
): void {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.code}`);
  }
}

async function waitForHealth(url: string, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(10_000, timeoutMs)) });
      lastStatus = response.status;
      if (response.ok) {
        return response.status;
      }
    } catch {
      lastStatus = 0;
    }
    await delay(1_000);
  }
  throw new Error(`health check did not become ready; last status ${lastStatus}`);
}

function probeRejectedOrigin(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { origin: "https://untrusted.invalid" });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("untrusted Origin was not rejected before the timeout"));
    }, timeoutMs);
    socket.once("open", () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error("untrusted Origin unexpectedly opened a WebSocket"));
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(true);
    });
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      resolve(response.statusCode === 403);
    });
  });
}

function probeOversizedPayload(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("oversized payload was not rejected before the timeout"));
    }, timeoutMs);
    socket.once("open", () => socket.send("x".repeat(70 * 1_024)));
    socket.once("close", (code) => {
      clearTimeout(timer);
      resolve(code === 1009 || code === 1006);
    });
    socket.once("error", () => undefined);
  });
}

function probeHeartbeat(url: string, observationMs: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const openTimer = setTimeout(() => {
      socket.terminate();
      reject(new Error("heartbeat probe could not connect"));
    }, timeoutMs);
    socket.once("open", () => {
      clearTimeout(openTimer);
      setTimeout(() => {
        const stayedOpen = socket.readyState === WebSocket.OPEN;
        socket.close();
        resolve(stayedOpen);
      }, observationMs);
    });
    socket.once("error", () => {
      clearTimeout(openTimer);
      reject(new Error("heartbeat probe failed to connect"));
    });
  });
}

function probeStaleConnectionTimeout(url: string, observationMs: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { autoPong: false });
    let opened = false;
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("a connection that ignored ping was not expired by the server"));
    }, observationMs);
    socket.once("open", () => {
      opened = true;
    });
    socket.once("close", () => {
      clearTimeout(timer);
      if (opened) {
        resolve(true);
      } else {
        reject(new Error("stale-connection probe closed before it connected"));
      }
    });
    socket.once("error", () => undefined);
  });
}

function validateSmokeUrl(value: string, allowInsecureLocal: boolean): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "wss:" && !(allowInsecureLocal && parsed.protocol === "ws:")) {
    throw new Error("Remote room smoke requires a wss:// URL.");
  }
  return parsed.toString();
}

function defaultHealthUrl(webSocketUrl: string): string {
  const parsed = new URL(webSocketUrl);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.pathname = "/health/ready";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.ROOM_SERVER_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error("Set ROOM_SERVER_URL to the deployed wss:// endpoint.");
  }
  const result = await runRemoteRoomSmoke({
    url,
    healthUrl: process.env.ROOM_SERVER_HEALTH_URL,
    origin: process.env.ROOM_SERVER_ORIGIN,
    roomId: process.env.ROOM_SERVER_SMOKE_ROOM_ID,
  });
  console.log(JSON.stringify(result, null, 2));
}
