import assert from "node:assert/strict";
import test from "node:test";

import {
  createReconnectCoordinator,
  type ReconnectScheduler,
} from "@leshan-mahjong/client-core";

test("reconnect coordinator retries at 1, 2, 4, and 8 seconds before failing", async () => {
  const scheduler = new FakeScheduler();
  const attempts: number[] = [];
  const coordinator = createReconnectCoordinator({
    scheduler,
    attempt: async (context) => {
      attempts.push(context.attempt);
      assert.equal(context.markResuming(), true);
      return { ok: false, reason: `failed-${context.attempt}` };
    },
  });

  coordinator.start("socketClosed");
  assert.equal(coordinator.getState().phase, "waiting");
  assert.equal(coordinator.getState().retryDelayMs, 1_000);

  for (const delay of [1_000, 2_000, 4_000, 8_000]) {
    scheduler.advance(delay);
    await flushPromises();
    if (delay !== 8_000) {
      assert.equal(coordinator.getState().phase, "waiting");
      assert.equal(coordinator.getState().retryDelayMs, delay * 2);
    }
  }

  assert.deepEqual(attempts, [1, 2, 3, 4]);
  assert.equal(coordinator.getState().phase, "failed");
  assert.equal(coordinator.getState().attempt, 4);
  assert.equal(scheduler.pendingCount(), 0);
});

test("immediate retry supersedes an older in-flight reconnect attempt", async () => {
  const scheduler = new FakeScheduler();
  const firstAttempt = deferred<{ ok: false; reason: string }>();
  let callCount = 0;
  const coordinator = createReconnectCoordinator({
    scheduler,
    attempt: async () => {
      callCount += 1;
      return callCount === 1 ? firstAttempt.promise : { ok: true };
    },
  });

  coordinator.retryNow("foreground");
  assert.equal(coordinator.getState().phase, "reconnecting");
  coordinator.retryNow("networkAvailable");
  await flushPromises();
  assert.equal(coordinator.getState().phase, "online");
  assert.equal(callCount, 2);

  firstAttempt.resolve({ ok: false, reason: "late-old-connection" });
  await flushPromises();
  assert.equal(coordinator.getState().phase, "online");
  assert.equal(scheduler.pendingCount(), 0);
});

test("pause cancels retries and manual retry starts immediately", async () => {
  const scheduler = new FakeScheduler();
  let attempts = 0;
  const coordinator = createReconnectCoordinator({
    scheduler,
    attempt: async () => {
      attempts += 1;
      return { ok: true };
    },
  });

  coordinator.start("socketClosed");
  coordinator.pause("background");
  scheduler.advance(10_000);
  await flushPromises();
  assert.equal(attempts, 0);
  assert.equal(coordinator.getState().phase, "offline");

  coordinator.retryNow("manualRetry");
  await flushPromises();
  assert.equal(attempts, 1);
  assert.equal(coordinator.getState().phase, "online");
});

class FakeScheduler implements ReconnectScheduler {
  private currentTime = 10_000;
  private nextId = 1;
  private tasks = new Map<number, { at: number; callback: () => void }>();

  now = () => this.currentTime;

  setTimer = (callback: () => void, delayMs: number): number => {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { at: this.currentTime + delayMs, callback });
    return id;
  };

  clearTimer = (handle: unknown) => {
    this.tasks.delete(handle as number);
  };

  advance(delayMs: number) {
    this.currentTime += delayMs;
    const ready = [...this.tasks.entries()]
      .filter(([, task]) => task.at <= this.currentTime)
      .sort((left, right) => left[1].at - right[1].at);
    for (const [id, task] of ready) {
      this.tasks.delete(id);
      task.callback();
    }
  }

  pendingCount(): number {
    return this.tasks.size;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
