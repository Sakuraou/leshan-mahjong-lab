import { pathToFileURL } from "node:url";

import { createRoomSocketProductionServer } from "./productionServer.ts";
import { runRemoteRoomSmoke } from "./remoteSmoke.ts";

export async function runProductionServerSmoke() {
  const server = await createRoomSocketProductionServer({
    responseWindowTimeoutMs: 200,
    env: {
      HOST: "127.0.0.1",
      PORT: "0",
      WS_PATH: "/ws",
      ALLOWED_ORIGINS: "https://smoke.example",
      ALLOW_MISSING_ORIGIN: "true",
      SHUTDOWN_GRACE_MS: "100",
      HEARTBEAT_INTERVAL_MS: "100",
      CONNECTION_TIMEOUT_MS: "500",
    },
    onStructuredLog: () => undefined,
  });

  try {
    return await runRemoteRoomSmoke({
      url: server.wsUrl,
      healthUrl: server.readyUrl,
      roomId: `production-full-smoke-${Date.now()}`,
      actionTimeoutMs: 5_000,
      healthTimeoutMs: 5_000,
      heartbeatObservationMs: 250,
      probeStaleConnectionTimeout: true,
      staleConnectionObservationMs: 1_500,
      allowInsecureLocal: true,
    });
  } finally {
    await server.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await runProductionServerSmoke(), null, 2));
}
