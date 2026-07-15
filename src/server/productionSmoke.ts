import { pathToFileURL } from "node:url";

import { createRoomSocketProductionServer } from "./productionServer.ts";
import { runRoomSocketSmokeClient } from "./smokeClient.ts";

export async function runProductionServerSmoke() {
  const server = await createRoomSocketProductionServer({
    env: {
      HOST: "127.0.0.1",
      PORT: "0",
      WS_PATH: "/ws",
      ALLOWED_ORIGINS: "https://smoke.example",
      ALLOW_MISSING_ORIGIN: "false",
      SHUTDOWN_GRACE_MS: "100",
    },
    onStructuredLog: () => undefined,
  });

  try {
    const health = await fetch(server.liveUrl);
    if (!health.ok) {
      throw new Error(`Production health check failed with ${health.status}.`);
    }
    const result = await runRoomSocketSmokeClient({
      url: server.wsUrl,
      origin: "https://smoke.example",
      roomId: `production-smoke-${Date.now()}`,
    });
    return {
      health: health.status,
      hostMessages: result.hostMessages.map((message) => message.type),
      guestMessages: result.guestMessages.map((message) => message.type),
    };
  } finally {
    await server.close();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await runProductionServerSmoke(), null, 2));
}
