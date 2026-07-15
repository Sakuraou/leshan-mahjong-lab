import { pathToFileURL } from "node:url";
import type { RoomSocketAdapterOptions } from "../game/index.ts";

import {
  createRoomSocketNodeServer,
  type RoomSocketNodeServer,
  type RoomSocketNodeServerLog,
} from "./nodeServer.ts";
import { loadProductionServerConfig, type ProductionServerConfig } from "./serverConfig.ts";

export type RoomSocketProductionServerOptions = RoomSocketAdapterOptions & {
  env?: Readonly<Record<string, string | undefined>>;
  config?: ProductionServerConfig;
  onStructuredLog?: (entry: Record<string, unknown>) => void;
};

export async function createRoomSocketProductionServer(
  options: RoomSocketProductionServerOptions = {},
): Promise<RoomSocketNodeServer> {
  const config = options.config ?? loadProductionServerConfig(options.env ?? process.env);
  const writeLog = options.onStructuredLog ?? writeStructuredLog;
  const server = await createRoomSocketNodeServer({
    ...options,
    host: config.host,
    port: config.port,
    webSocketPath: config.webSocketPath,
    healthLivePath: config.healthLivePath,
    healthReadyPath: config.healthReadyPath,
    allowedOrigins: config.allowedOrigins,
    allowMissingOrigin: config.allowMissingOrigin,
    maxPayloadBytes: config.maxPayloadBytes,
    shutdownGraceMs: config.shutdownGraceMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    connectionTimeoutMs: config.connectionTimeoutMs,
    deadlinePollIntervalMs: config.deadlinePollIntervalMs,
    onLog: (entry) => writeLog(safeLogEntry(entry)),
    onUndelivered: (message) => writeLog({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "messageUndelivered",
      messageType: message.message.type,
    }),
  });

  writeLog({
    timestamp: new Date().toISOString(),
    level: "info",
    event: "serverStarted",
    host: config.host,
    port: server.port,
    webSocketPath: config.webSocketPath,
    healthLivePath: config.healthLivePath,
    healthReadyPath: config.healthReadyPath,
    allowedOriginCount: config.allowedOrigins.length,
    allowMissingOrigin: config.allowMissingOrigin,
  });
  return server;
}

function safeLogEntry(entry: RoomSocketNodeServerLog): Record<string, unknown> {
  return { timestamp: new Date().toISOString(), ...entry };
}

function writeStructuredLog(entry: Record<string, unknown>) {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(line);
  } else if (entry.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = await createRoomSocketProductionServer();
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      writeStructuredLog({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "shutdownRequested",
        signal,
      });
      try {
        await server.close();
        writeStructuredLog({ timestamp: new Date().toISOString(), level: "info", event: "serverStopped" });
        process.exitCode = 0;
      } catch {
        writeStructuredLog({ timestamp: new Date().toISOString(), level: "error", event: "shutdownFailed" });
        process.exitCode = 1;
      }
    };
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  } catch (error) {
    writeStructuredLog({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "serverStartFailed",
      reason: error instanceof Error ? error.message : "unknownConfigurationError",
    });
    process.exitCode = 1;
  }
}
