import { pathToFileURL } from "node:url";
import type { RoomSocketAdapterOptions } from "../game/index.ts";

import { createRoomSocketNodeServer } from "./nodeServer.ts";
import type { RoomSocketServerCoreState, RoomSocketUndeliveredMessage } from "./roomSocketServerCore.ts";

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
  const server = await createRoomSocketNodeServer({
    ...options,
    webSocketPath: "/",
    allowedOrigins: undefined,
    allowMissingOrigin: true,
    onLog: (entry) => options.onLog?.(
      [entry.event, entry.connectionId, entry.messageType, entry.reason].filter(Boolean).join(" "),
    ),
  });
  return {
    port: server.port,
    url: server.wsUrl,
    close: server.close,
    getState: server.getState,
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(readCliOption("--port") ?? process.env.PORT ?? "8787", 10);
  const host = readCliOption("--host") ?? process.env.HOST ?? "127.0.0.1";
  const server = await createRoomSocketDevServer({
    host,
    port,
    onLog: (message) => console.log(`[room-ws] ${message}`),
    onUndelivered: (message) => console.warn(`[room-ws] undelivered ${message.message.type}`),
  });
  console.log(`[room-ws] listening on ${server.url}`);
}

function readCliOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
