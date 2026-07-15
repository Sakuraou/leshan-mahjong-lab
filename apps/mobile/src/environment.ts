import { resolveMobileServerConfig } from "@leshan-mahjong/client-core";

declare const process: {
  env: {
    EXPO_PUBLIC_ROOM_SERVER_MODE?: string;
    EXPO_PUBLIC_DEV_SERVER_TARGET?: string;
    EXPO_PUBLIC_ROOM_SERVER_URL?: string;
    EXPO_PUBLIC_LAN_SERVER_URL?: string;
  };
};

export const initialMobileServerConfig = resolveMobileServerConfig({
  mode: process.env.EXPO_PUBLIC_ROOM_SERVER_MODE,
  developmentTarget: process.env.EXPO_PUBLIC_DEV_SERVER_TARGET,
  roomServerUrl: process.env.EXPO_PUBLIC_ROOM_SERVER_URL,
  lanServerUrl: process.env.EXPO_PUBLIC_LAN_SERVER_URL,
});
