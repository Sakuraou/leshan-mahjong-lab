import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { RoomSocketAdapterOptions, RoomSocketServerMessage } from "../game/index.ts";

import {
  createRoomSocketServerCoreState,
  handleRoomSocketConnectionClosed,
  handleRoomSocketRawMessage,
  markRoomSocketConnectionAlive,
  registerRoomSocketConnection,
  tickRoomSocketConnectionHealth,
  tickRoomSocketServerDeadlines,
  type RoomSocketServerCoreState,
  type RoomSocketUndeliveredMessage,
} from "./roomSocketServerCore.ts";

export type RoomSocketNodeServerLog = {
  level: "info" | "warn" | "error";
  event:
    | "connectionOpened"
    | "connectionClosed"
    | "connectionError"
    | "connectionExpired"
    | "messageSendFailed"
    | "upgradeRejected"
    | "serverDraining";
  connectionId?: string;
  messageType?: RoomSocketServerMessage["type"] | "protocolError";
  reason?: string;
};

export type RoomSocketNodeServerOptions = RoomSocketAdapterOptions & {
  host?: string;
  port?: number;
  webSocketPath?: string;
  healthLivePath?: string;
  healthReadyPath?: string;
  allowedOrigins?: readonly string[];
  allowMissingOrigin?: boolean;
  maxPayloadBytes?: number;
  shutdownGraceMs?: number;
  deadlinePollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  connectionTimeoutMs?: number;
  onLog?: (entry: RoomSocketNodeServerLog) => void;
  onUndelivered?: (message: RoomSocketUndeliveredMessage) => void;
};

export type RoomSocketNodeServer = {
  host: string;
  port: number;
  wsUrl: string;
  liveUrl: string;
  readyUrl: string;
  beginDraining: () => void;
  close: () => Promise<void>;
  isDraining: () => boolean;
  getState: () => RoomSocketServerCoreState;
};

export async function createRoomSocketNodeServer(
  options: RoomSocketNodeServerOptions = {},
): Promise<RoomSocketNodeServer> {
  const host = options.host ?? "127.0.0.1";
  const webSocketPath = normalizePath(options.webSocketPath ?? "/");
  const healthLivePath = normalizePath(options.healthLivePath ?? "/health/live");
  const healthReadyPath = normalizePath(options.healthReadyPath ?? "/health/ready");
  const shutdownGraceMs = options.shutdownGraceMs ?? 5_000;
  let state = createRoomSocketServerCoreState(options);
  let nextConnectionNumber = 1;
  let draining = false;
  let closePromise: Promise<void> | null = null;
  const sockets = new Map<string, WebSocket>();
  const socketIds = new WeakMap<WebSocket, string>();

  const httpServer = createServer((request, response) => {
    const pathname = requestUrlPath(request.url);
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");

    if (request.method === "GET" && pathname === healthLivePath) {
      response.writeHead(200).end(JSON.stringify({ status: "ok", service: "leshan-mahjong-room-server" }));
      return;
    }
    if (request.method === "GET" && pathname === healthReadyPath) {
      response.writeHead(draining ? 503 : 200).end(JSON.stringify({ status: draining ? "draining" : "ready" }));
      return;
    }
    response.writeHead(404).end(JSON.stringify({ status: "notFound" }));
  });
  const socketServer = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxPayloadBytes ?? 64 * 1024,
    perMessageDeflate: false,
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = requestUrlPath(request.url);
    const origin = firstHeaderValue(request.headers.origin);
    const rejectedReason = draining
      ? "serverDraining"
      : pathname !== webSocketPath
        ? "invalidPath"
        : isWebSocketOriginAllowed(origin, options.allowedOrigins, options.allowMissingOrigin ?? true)
          ? null
          : "originRejected";

    if (rejectedReason !== null) {
      options.onLog?.({ level: "warn", event: "upgradeRejected", reason: rejectedReason });
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }

    socketServer.handleUpgrade(request, socket, head, (webSocket) => {
      socketServer.emit("connection", webSocket, request);
    });
  });

  function deliver(result: {
    outgoing: Array<{ connectionId: string; message: RoomSocketServerMessage }>;
    undelivered: RoomSocketUndeliveredMessage[];
  }) {
    for (const outgoing of result.outgoing) {
      safeSend(outgoing.connectionId, outgoing.message);
    }
    for (const undelivered of result.undelivered) {
      options.onUndelivered?.(undelivered);
    }
  }

  function safeSend(connectionId: string, message: RoomSocketServerMessage | {
    protocolVersion: 1;
    type: "protocolError";
    payload: { code: string; message: string };
  }) {
    const socket = sockets.get(connectionId);
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(JSON.stringify(message), (error) => {
        if (error !== undefined) {
          options.onLog?.({
            level: "warn",
            event: "messageSendFailed",
            connectionId,
            messageType: message.type,
            reason: "socketSendError",
          });
        }
      });
    } catch {
      options.onLog?.({
        level: "warn",
        event: "messageSendFailed",
        connectionId,
        messageType: message.type,
        reason: "socketSendError",
      });
    }
  }

  socketServer.on("connection", (socket) => {
    const connectionId = `conn-${nextConnectionNumber}`;
    nextConnectionNumber += 1;
    sockets.set(connectionId, socket);
    socketIds.set(socket, connectionId);
    state = registerRoomSocketConnection(state, connectionId, options.nowFactory?.() ?? Date.now());
    options.onLog?.({ level: "info", event: "connectionOpened", connectionId });

    socket.on("pong", () => {
      state = markRoomSocketConnectionAlive(state, connectionId, options.nowFactory?.() ?? Date.now());
    });
    socket.on("message", (data: RawData) => {
      const result = handleRoomSocketRawMessage(state, connectionId, data.toString());
      state = result.state;
      deliver(result);
      for (const error of result.errors) {
        safeSend(connectionId, { protocolVersion: 1, type: error.type, payload: error.payload });
      }
    });
    socket.on("error", () => {
      options.onLog?.({ level: "warn", event: "connectionError", connectionId, reason: "socketError" });
    });
    socket.on("close", () => {
      sockets.delete(connectionId);
      const result = handleRoomSocketConnectionClosed(state, connectionId);
      state = result.state;
      deliver(result);
      options.onLog?.({ level: "info", event: "connectionClosed", connectionId });
    });
  });

  const deadlineTimer = setInterval(() => {
    const result = tickRoomSocketServerDeadlines(state, options.nowFactory?.());
    state = result.state;
    deliver(result);
  }, options.deadlinePollIntervalMs ?? 250);
  deadlineTimer.unref();

  const heartbeatTimer = setInterval(() => {
    const now = options.nowFactory?.() ?? Date.now();
    const result = tickRoomSocketConnectionHealth(state, now, options.connectionTimeoutMs ?? 30_000);
    state = result.state;
    deliver(result);

    for (const connectionId of result.expiredConnectionIds) {
      options.onLog?.({ level: "warn", event: "connectionExpired", connectionId });
      sockets.get(connectionId)?.terminate();
    }

    const activeConnectionIds = new Set(state.connections.map((connection) => connection.connectionId));
    for (const [connectionId, socket] of sockets) {
      if (activeConnectionIds.has(connectionId) && socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }
  }, options.heartbeatIntervalMs ?? 10_000);
  heartbeatTimer.unref();

  await listen(httpServer, host, options.port ?? 0);
  const address = httpServer.address() as AddressInfo;
  const port = address.port;
  const clientHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const baseUrl = `http://${formatHost(clientHost)}:${port}`;
  const wsUrl = `ws://${formatHost(clientHost)}:${port}${webSocketPath === "/" ? "" : webSocketPath}`;

  function beginDraining() {
    if (draining) {
      return;
    }
    draining = true;
    options.onLog?.({ level: "info", event: "serverDraining" });
  }

  function close(): Promise<void> {
    if (closePromise !== null) {
      return closePromise;
    }
    beginDraining();
    clearInterval(deadlineTimer);
    clearInterval(heartbeatTimer);
    closePromise = closeHttpServer(httpServer, sockets, socketIds, shutdownGraceMs);
    return closePromise;
  }

  return {
    host,
    port,
    wsUrl,
    liveUrl: `${baseUrl}${healthLivePath}`,
    readyUrl: `${baseUrl}${healthReadyPath}`,
    beginDraining,
    close,
    isDraining: () => draining,
    getState: () => state,
  };
}

export function isWebSocketOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[] | undefined,
  allowMissingOrigin: boolean,
): boolean {
  if (allowedOrigins === undefined) {
    return true;
  }
  if (origin === undefined) {
    return allowMissingOrigin;
  }
  return allowedOrigins.includes(normalizeOrigin(origin));
}

function listen(server: HttpServer, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

async function closeHttpServer(
  server: HttpServer,
  sockets: Map<string, WebSocket>,
  socketIds: WeakMap<WebSocket, string>,
  graceMs: number,
): Promise<void> {
  let closeError: Error | null = null;
  const closed = new Promise<void>((resolve) => {
    server.close((error) => {
      closeError = error ?? null;
      resolve();
    });
  });

  for (const socket of sockets.values()) {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1012, "Service restart");
    }
  }

  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<void>((resolve) => {
    graceTimer = setTimeout(resolve, Math.max(0, graceMs));
  });
  await Promise.race([closed, grace]);
  if (graceTimer !== undefined) {
    clearTimeout(graceTimer);
  }
  for (const socket of sockets.values()) {
    if (socket.readyState !== WebSocket.CLOSED) {
      socket.terminate();
    }
    socketIds.delete(socket);
  }
  await closed;
  if (closeError !== null) {
    throw closeError;
  }
}

function requestUrlPath(url: string | undefined): string {
  try {
    return new URL(url ?? "/", "http://localhost").pathname;
  } catch {
    return "/invalid";
  }
}

function normalizePath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
