import {
  createMobileRoomTransport,
  validateMobileServerUrl,
  type MobilePublicEvent,
  type MobileRoomTransport,
  type MobileServerMode,
} from "@leshan-mahjong/client-core";

export type MobileRoomGateway = MobileRoomTransport;

export function connectMobileRoomGateway(input: {
  serverUrl: string;
  serverMode: MobileServerMode;
  roomId: string;
  initialEvents?: MobilePublicEvent[];
}): Promise<MobileRoomGateway> {
  const validation = validateMobileServerUrl(input.serverMode, input.serverUrl);
  if (!validation.ok) {
    throw new Error(validation.code);
  }
  return createMobileRoomTransport({
    url: validation.url,
    roomId: input.roomId.trim(),
    initialEvents: input.initialEvents,
  });
}

export function latestServerEventId(gateway: MobileRoomGateway): number {
  return gateway.getState().lastEventId;
}
