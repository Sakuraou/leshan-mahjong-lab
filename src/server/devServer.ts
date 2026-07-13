import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { RoomSocketAdapterOptions } from "../game/index.ts";

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

export type RoomSocketDevServer = {
  port: number;
  url: string;
  close: () => Promise<void>;
  getState: () => RoomSocketServerCoreState;
};

export type RoomSocketDevServerOptions = RoomSocketAdapterOptions & {
  host?: string;
  port?: number;
  onLog?: (message: string) => void;
  onUndelivered?: (message: RoomSocketUndeliveredMessage) => void;
  deadlinePollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  connectionTimeoutMs?: number;
};

export async function createRoomSocketDevServer(options: RoomSocketDevServerOptions = {}): Promise<RoomSocketDevServer> {
  const host = options.host ?? "127.0.0.1";
  let nextConnectionNumber = 1;
  let state = createRoomSocketServerCoreState(options);
  const sockets = new Map<string, WebSocket>();
  const server = new WebSocketServer({ host, port: options.port ?? 0 });
  const deadlineTimer = setInterval(() => {
    const result = tickRoomSocketServerDeadlines(state, options.nowFactory?.());
    state = result.state;

    for (const outgoing of result.outgoing) {
      sockets.get(outgoing.connectionId)?.send(JSON.stringify(outgoing.message));
    }

    for (const undelivered of result.undelivered) {
      options.onUndelivered?.(undelivered);
    }
  }, options.deadlinePollIntervalMs ?? 250);
  deadlineTimer.unref();
  const heartbeatTimer = setInterval(() => {
    const now = options.nowFactory?.() ?? Date.now();
    const result = tickRoomSocketConnectionHealth(
      state,
      now,
      options.connectionTimeoutMs ?? 30_000,
    );
    state = result.state;

    for (const outgoing of result.outgoing) {
      sockets.get(outgoing.connectionId)?.send(JSON.stringify(outgoing.message));
    }

    for (const undelivered of result.undelivered) {
      options.onUndelivered?.(undelivered);
    }

    for (const connectionId of result.expiredConnectionIds) {
      options.onLog?.(`heartbeat timeout ${connectionId}`);
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

  server.on("connection", (socket) => {
    const connectionId = `conn-${nextConnectionNumber}`;
    nextConnectionNumber += 1;
    sockets.set(connectionId, socket);
    state = registerRoomSocketConnection(state, connectionId, options.nowFactory?.() ?? Date.now());
    options.onLog?.(`connected ${connectionId}`);

    socket.on("pong", () => {
      state = markRoomSocketConnectionAlive(state, connectionId, options.nowFactory?.() ?? Date.now());
    });

    socket.on("message", (data: RawData) => {
      const result = handleRoomSocketRawMessage(state, connectionId, data.toString());
      state = result.state;

      for (const outgoing of result.outgoing) {
        sockets.get(outgoing.connectionId)?.send(JSON.stringify(outgoing.message));
      }

      for (const error of result.errors) {
        socket.send(JSON.stringify(error));
      }

      for (const undelivered of result.undelivered) {
        options.onUndelivered?.(undelivered);
      }
    });

    socket.on("close", () => {
      sockets.delete(connectionId);
      const result = handleRoomSocketConnectionClosed(state, connectionId);
      state = result.state;

      for (const outgoing of result.outgoing) {
        sockets.get(outgoing.connectionId)?.send(JSON.stringify(outgoing.message));
      }

      for (const undelivered of result.undelivered) {
        options.onUndelivered?.(undelivered);
      }

      options.onLog?.(`disconnected ${connectionId}`);
    });
  });

  await waitForListening(server);
  const address = server.address();

  if (typeof address === "string" || address === null) {
    throw new Error("WebSocket server did not expose a TCP port.");
  }

  const port = address.port;

  return {
    port,
    url: `ws://${host}:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(deadlineTimer);
        clearInterval(heartbeatTimer);
        for (const socket of sockets.values()) {
          socket.close();
        }

        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    getState: () => state,
  };
}

function waitForListening(server: WebSocketServer): Promise<void> {
  if (server.address() !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(process.env.PORT ?? "8787", 10);
  const server = await createRoomSocketDevServer({
    port,
    onLog: (message) => console.log(`[room-ws] ${message}`),
    onUndelivered: (message) =>
      console.warn(`[room-ws] undelivered ${message.message.type} for ${message.recipientSessionToken}`),
  });

  console.log(`[room-ws] listening on ${server.url}`);
}
