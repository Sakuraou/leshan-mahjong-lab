export type ProductionServerConfig = {
  host: string;
  port: number;
  webSocketPath: string;
  healthLivePath: string;
  healthReadyPath: string;
  allowedOrigins: string[];
  allowMissingOrigin: boolean;
  maxPayloadBytes: number;
  shutdownGraceMs: number;
  heartbeatIntervalMs: number;
  connectionTimeoutMs: number;
  deadlinePollIntervalMs: number;
  responseWindowTimeoutMs: number;
  turnActionTimeoutMs: number;
};

export function loadProductionServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ProductionServerConfig {
  const host = requireNonEmpty(env.HOST ?? "0.0.0.0", "HOST");
  const port = integerInRange(env.PORT ?? "8787", "PORT", 0, 65_535);
  const webSocketPath = pathValue(env.WS_PATH ?? "/ws", "WS_PATH");
  const healthLivePath = pathValue(env.HEALTH_LIVE_PATH ?? "/health/live", "HEALTH_LIVE_PATH");
  const healthReadyPath = pathValue(env.HEALTH_READY_PATH ?? "/health/ready", "HEALTH_READY_PATH");
  const allowedOrigins = parseOrigins(env.ALLOWED_ORIGINS ?? "");
  const allowMissingOrigin = booleanValue(env.ALLOW_MISSING_ORIGIN, "ALLOW_MISSING_ORIGIN", false);
  const heartbeatIntervalMs = integerInRange(
    env.HEARTBEAT_INTERVAL_MS ?? "10000",
    "HEARTBEAT_INTERVAL_MS",
    100,
    300_000,
  );
  const connectionTimeoutMs = integerInRange(
    env.CONNECTION_TIMEOUT_MS ?? "30000",
    "CONNECTION_TIMEOUT_MS",
    heartbeatIntervalMs,
    600_000,
  );

  if (allowedOrigins.length === 0 && !allowMissingOrigin) {
    throw new Error("Configure ALLOWED_ORIGINS or explicitly set ALLOW_MISSING_ORIGIN=true for native clients.");
  }

  return {
    host,
    port,
    webSocketPath,
    healthLivePath,
    healthReadyPath,
    allowedOrigins,
    allowMissingOrigin,
    maxPayloadBytes: integerInRange(env.MAX_PAYLOAD_BYTES ?? "65536", "MAX_PAYLOAD_BYTES", 1_024, 1_048_576),
    shutdownGraceMs: integerInRange(env.SHUTDOWN_GRACE_MS ?? "5000", "SHUTDOWN_GRACE_MS", 0, 60_000),
    heartbeatIntervalMs,
    connectionTimeoutMs,
    deadlinePollIntervalMs: integerInRange(
      env.DEADLINE_POLL_INTERVAL_MS ?? "250",
      "DEADLINE_POLL_INTERVAL_MS",
      50,
      60_000,
    ),
    responseWindowTimeoutMs: integerInRange(
      env.RESPONSE_WINDOW_TIMEOUT_MS ?? "15000",
      "RESPONSE_WINDOW_TIMEOUT_MS",
      1_000,
      120_000,
    ),
    turnActionTimeoutMs: integerInRange(
      env.TURN_ACTION_TIMEOUT_MS ?? "30000",
      "TURN_ACTION_TIMEOUT_MS",
      1_000,
      120_000,
    ),
  };
}

function parseOrigins(value: string): string[] {
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.includes("*")) {
    throw new Error("ALLOWED_ORIGINS cannot contain '*' in production.");
  }
  return [...new Set(origins.map((origin) => {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("ALLOWED_ORIGINS entries must use http:// or https://.");
    }
    if (parsed.origin !== origin.replace(/\/$/, "")) {
      throw new Error("ALLOWED_ORIGINS entries must be origins without a path.");
    }
    return parsed.origin;
  }))];
}

function integerInRange(value: string, name: string, min: number, max: number): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function booleanValue(value: string | undefined, name: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false.`);
}

function pathValue(value: string, name: string): string {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#") || /\s/.test(value)) {
    throw new Error(`${name} must be an absolute URL path.`);
  }
  return value;
}

function requireNonEmpty(value: string, name: string): string {
  if (value.trim() === "") {
    throw new Error(`${name} cannot be empty.`);
  }
  return value.trim();
}
