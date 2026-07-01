import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";

import type { RoomSocketClientMessage, RoomSocketServerMessage } from "../game/index.ts";
import { createRoomSocketDevServer } from "./devServer.ts";

export type RoomSocketSmokeResult = {
  url: string;
  hostMessages: RoomSocketServerMessage[];
  guestMessages: RoomSocketServerMessage[];
};

export async function runRoomSocketSmokeClient(input: { url: string; roomId?: string }): Promise<RoomSocketSmokeResult> {
  const roomId = input.roomId ?? `smoke-room-${Date.now()}`;
  const host = await openSmokeSocket(input.url);
  const guest = await openSmokeSocket(input.url);

  try {
    const hostMessages: RoomSocketServerMessage[] = [];
    const guestMessages: RoomSocketServerMessage[] = [];
    host.on("message", (data) => hostMessages.push(JSON.parse(data.toString()) as RoomSocketServerMessage));
    guest.on("message", (data) => guestMessages.push(JSON.parse(data.toString()) as RoomSocketServerMessage));

    host.send(
      JSON.stringify({
        protocolVersion: 1,
        clientMessageId: "smoke-create",
        type: "createRoom",
        payload: { roomId, seed: "smoke-seed", displayName: "Smoke Host" },
      } satisfies RoomSocketClientMessage),
    );
    await waitForMessages(hostMessages, 2);

    guest.send(
      JSON.stringify({
        protocolVersion: 1,
        clientMessageId: "smoke-join",
        roomId,
        type: "joinRoom",
        payload: { displayName: "Smoke Guest" },
      } satisfies RoomSocketClientMessage),
    );
    await waitForMessages(guestMessages, 2);
    await waitForMessages(hostMessages, 3);

    return {
      url: input.url,
      hostMessages,
      guestMessages,
    };
  } finally {
    host.close();
    guest.close();
  }
}

async function openSmokeSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  return socket;
}

async function waitForMessages(messages: unknown[], count: number): Promise<void> {
  const deadline = Date.now() + 3_000;

  while (messages.length < count) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${count} WebSocket messages; received ${messages.length}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createRoomSocketDevServer({ port: 0 });

  try {
    const result = await runRoomSocketSmokeClient({ url: server.url });
    console.log(
      JSON.stringify(
        {
          url: result.url,
          hostMessages: result.hostMessages.map((message) => message.type),
          guestMessages: result.guestMessages.map((message) => message.type),
        },
        null,
        2,
      ),
    );
  } finally {
    await server.close();
  }
}
