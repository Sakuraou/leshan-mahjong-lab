import {
  createWebSocketRoomTransport,
  type WebSocketRoomTransport,
} from "../../../src/webSocketRoomTransport.ts";

export type MobileRoomGateway = WebSocketRoomTransport;

export function connectMobileRoomGateway(input: {
  serverUrl: string;
  roomId: string;
}): Promise<MobileRoomGateway> {
  return createWebSocketRoomTransport({
    url: input.serverUrl.trim(),
    roomId: input.roomId.trim(),
  });
}

export function latestServerEventId(gateway: MobileRoomGateway): number {
  const snapshot = gateway
    .getState()
    .messages.findLast((message) => message.type === "roomSnapshot");

  return snapshot?.type === "roomSnapshot" ? snapshot.payload.lastEventId : 0;
}
