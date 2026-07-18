import type { ConfigContext, ExpoConfig } from "expo/config";
import baseConfig from "./app.json";

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT ?? "development";
  const serverMode = process.env.EXPO_PUBLIC_ROOM_SERVER_MODE ?? "development";
  const isProduction = variant === "production";
  const suffix = isProduction ? "" : variant === "preview" ? ".preview" : ".dev";
  const base = baseConfig.expo as ExpoConfig;
  const baseIos = base.ios ?? {};
  const baseAndroid = base.android ?? {};

  return {
    ...config,
    ...base,
    name: isProduction ? base.name : `${base.name} ${variant === "preview" ? "内测" : "开发"}`,
    scheme: isProduction ? "leshanmahjong" : `leshanmahjong-${variant}`,
    ios: {
      ...baseIos,
      bundleIdentifier: `com.sakuraou.leshanmahjong${suffix}`,
      infoPlist: {
        NSLocalNetworkUsageDescription: "用于连接同一局域网内的乐山麻将调试服务器。",
      },
    },
    android: {
      ...baseAndroid,
      package: `com.sakuraou.leshanmahjong${suffix}`,
    },
    plugins: [
      [
        "expo-screen-orientation",
        {
          initialOrientation: "DEFAULT",
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: serverMode !== "production",
          },
        },
      ],
    ],
  };
};
