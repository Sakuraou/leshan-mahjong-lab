import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyMobileConnectionError,
  mobileConnectionDiagnosticText,
  resolveMobileServerConfig,
  validateMobileServerUrl,
} from "../../packages/client-core/src/index.ts";

test("mobile server environment maps local, Android emulator, LAN, and production without a production localhost fallback", () => {
  assert.equal(resolveMobileServerConfig({ mode: "development" }).url, "ws://127.0.0.1:8787");
  assert.equal(
    resolveMobileServerConfig({ mode: "development", developmentTarget: "androidEmulator" }).url,
    "ws://10.0.2.2:8787",
  );
  assert.equal(
    resolveMobileServerConfig({ mode: "lan", lanServerUrl: "ws://192.168.1.20:8787" }).url,
    "ws://192.168.1.20:8787",
  );
  assert.deepEqual(resolveMobileServerConfig({ mode: "production" }), {
    mode: "production",
    developmentTarget: "local",
    url: "",
  });
});

test("production mobile endpoints require remote wss URLs", () => {
  assert.equal(validateMobileServerUrl("production", "ws://rooms.example/ws").ok, false);
  assert.equal(validateMobileServerUrl("production", "wss://127.0.0.1/ws").ok, false);
  assert.deepEqual(validateMobileServerUrl("production", "wss://rooms.example/ws"), {
    ok: true,
    url: "wss://rooms.example/ws",
  });
  assert.equal(validateMobileServerUrl("lan", "ws://127.0.0.1:8787").ok, false);
});

test("Chinese diagnostics distinguish address, TLS, offline server, session, and room failures", () => {
  const cases = [
    [classifyMobileConnectionError(new Error("bad URL"), { url: "not-a-url" }), "服务器地址格式不正确"],
    [classifyMobileConnectionError(new Error("TLS certificate rejected"), { url: "wss://rooms.example/ws" }), "安全连接失败"],
    [classifyMobileConnectionError(new Error("closed"), { url: "wss://rooms.example/ws" }), "无法连接服务器"],
    [classifyMobileConnectionError(new Error("invalidSession"), { url: "wss://rooms.example/ws" }), "会话已失效"],
    [classifyMobileConnectionError(new Error("roomNotFound"), { url: "wss://rooms.example/ws" }), "房间已不存在"],
  ] as const;

  for (const [code, expectedText] of cases) {
    assert.match(mobileConnectionDiagnosticText(code), new RegExp(expectedText));
  }
});
