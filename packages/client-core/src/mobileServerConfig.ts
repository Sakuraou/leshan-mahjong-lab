export type MobileServerMode = "development" | "lan" | "production";
export type MobileDevelopmentTarget = "local" | "androidEmulator";

export type MobileServerEnvironmentInput = {
  mode?: string;
  developmentTarget?: string;
  roomServerUrl?: string;
  lanServerUrl?: string;
};

export type MobileServerConfig = {
  mode: MobileServerMode;
  developmentTarget: MobileDevelopmentTarget;
  url: string;
};

export type MobileServerValidationResult =
  | { ok: true; url: string }
  | {
      ok: false;
      code: "missingServerUrl" | "invalidServerUrl" | "insecureProductionUrl" | "localProductionUrl" | "invalidLanUrl";
      message: string;
    };

export type MobileConnectionDiagnosticCode =
  | "invalidAddress"
  | "insecureProductionUrl"
  | "tlsError"
  | "deviceOffline"
  | "serverOffline"
  | "invalidSession"
  | "roomNotFound"
  | "originRejected";

export function resolveMobileServerConfig(input: MobileServerEnvironmentInput): MobileServerConfig {
  const mode = isMobileServerMode(input.mode) ? input.mode : "development";
  const developmentTarget = input.developmentTarget === "androidEmulator" ? "androidEmulator" : "local";
  const configuredUrl = input.roomServerUrl?.trim() ?? "";
  const lanUrl = input.lanServerUrl?.trim() ?? "";

  return {
    mode,
    developmentTarget,
    url: configuredUrl !== ""
      ? configuredUrl
      : mode === "development"
        ? defaultDevelopmentServerUrl(developmentTarget)
        : mode === "lan"
          ? lanUrl
          : "",
  };
}

export function defaultDevelopmentServerUrl(target: MobileDevelopmentTarget): string {
  return target === "androidEmulator" ? "ws://10.0.2.2:8787" : "ws://127.0.0.1:8787";
}

export function validateMobileServerUrl(
  mode: MobileServerMode,
  inputUrl: string,
): MobileServerValidationResult {
  const value = inputUrl.trim();
  if (value === "") {
    return failure("missingServerUrl", mode === "production"
      ? "生产服务器尚未配置，请填写部署后的 wss:// 地址"
      : "请填写服务器地址");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return failure("invalidServerUrl", "服务器地址格式不正确，请输入 ws:// 或 wss:// 地址");
  }
  if ((url.protocol !== "ws:" && url.protocol !== "wss:") || url.hostname === "" || url.username !== "" || url.password !== "") {
    return failure("invalidServerUrl", "服务器地址格式不正确，请输入 ws:// 或 wss:// 地址");
  }

  if (mode === "production") {
    if (url.protocol !== "wss:") {
      return failure("insecureProductionUrl", "生产服务器必须使用 wss:// 加密连接");
    }
    if (isLoopbackOrEmulatorHost(url.hostname)) {
      return failure("localProductionUrl", "生产服务器不能使用本机或 Android 模拟器地址");
    }
  }

  if (mode === "lan" && isLoopbackOrEmulatorHost(url.hostname)) {
    return failure("invalidLanUrl", "局域网模式请填写电脑在 Wi-Fi 中的 IP 或主机名");
  }
  return { ok: true, url: url.toString().replace(/\/$/, url.pathname === "/" ? "" : "/") };
}

export function inferMobileServerMode(inputUrl: string): MobileServerMode {
  try {
    const url = new URL(inputUrl);
    if (url.protocol === "wss:") {
      return "production";
    }
    return isLoopbackOrEmulatorHost(url.hostname) ? "development" : "lan";
  } catch {
    return "development";
  }
}

export function inferMobileDevelopmentTarget(inputUrl: string): MobileDevelopmentTarget {
  try {
    return new URL(inputUrl).hostname === "10.0.2.2" ? "androidEmulator" : "local";
  } catch {
    return "local";
  }
}

export function classifyMobileConnectionError(
  error: unknown,
  input: { url: string; networkConnected?: boolean | null },
): MobileConnectionDiagnosticCode {
  if (input.networkConnected === false) {
    return "deviceOffline";
  }
  const reason = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (reason.includes("invalidsession") || reason.includes("invalid session")) {
    return "invalidSession";
  }
  if (reason.includes("roomnotfound") || reason.includes("room not found")) {
    return "roomNotFound";
  }
  if (reason.includes("origin") || reason.includes("403")) {
    return "originRejected";
  }
  if (reason.includes("tls") || reason.includes("ssl") || reason.includes("certificate") || reason.includes("cert")) {
    return "tlsError";
  }
  try {
    const url = new URL(input.url);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      return "invalidAddress";
    }
  } catch {
    return "invalidAddress";
  }
  return "serverOffline";
}

export function mobileConnectionDiagnosticText(code: MobileConnectionDiagnosticCode): string {
  const messages: Record<MobileConnectionDiagnosticCode, string> = {
    invalidAddress: "服务器地址格式不正确，请输入 ws:// 或 wss:// 地址",
    insecureProductionUrl: "生产服务器必须使用 wss:// 加密连接",
    tlsError: "安全连接失败，请检查证书、域名和设备时间",
    deviceOffline: "当前设备未联网，请检查 Wi-Fi 或移动网络",
    serverOffline: "无法连接服务器，服务器可能未启动或暂时不可用",
    invalidSession: "保存的会话已失效，请重新加入房间",
    roomNotFound: "房间已不存在，请重新创建或加入其他房间",
    originRejected: "当前客户端来源未获服务器允许",
  };
  return messages[code];
}

function failure(
  code: Extract<MobileServerValidationResult, { ok: false }>["code"],
  message: string,
): MobileServerValidationResult {
  return { ok: false, code, message };
}

function isMobileServerMode(value: string | undefined): value is MobileServerMode {
  return value === "development" || value === "lan" || value === "production";
}

function isLoopbackOrEmulatorHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "10.0.2.2";
}
