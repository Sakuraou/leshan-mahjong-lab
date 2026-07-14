import {
  createMobileRoomTransport,
  type MobileRoomTransport,
} from "@leshan-mahjong/client-core";

export type MobileRoomGateway = MobileRoomTransport;

export function connectMobileRoomGateway(input: {
  serverUrl: string;
  roomId: string;
}): Promise<MobileRoomGateway> {
  return createMobileRoomTransport({
    url: input.serverUrl.trim(),
    roomId: input.roomId.trim(),
  });
}

export function latestServerEventId(gateway: MobileRoomGateway): number {
  return gateway.getState().lastEventId;
}
