export type ReconnectPhase =
  | "offline"
  | "waiting"
  | "reconnecting"
  | "resuming"
  | "online"
  | "failed";

export type ReconnectState = {
  phase: ReconnectPhase;
  attempt: number;
  maxAttempts: number;
  generation: number;
  nextRetryAt: number | null;
  retryDelayMs: number | null;
  lastError: string | null;
};

export type ReconnectScheduler = {
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export type ReconnectAttemptContext = {
  attempt: number;
  generation: number;
  isCurrent: () => boolean;
  markResuming: () => boolean;
};

export type ReconnectAttemptResult =
  | { ok: true }
  | { ok: false; reason: string; terminal?: boolean };

export type ReconnectCoordinator = {
  getState: () => ReconnectState;
  subscribe: (listener: (state: ReconnectState) => void) => () => void;
  start: (reason?: string) => void;
  retryNow: (reason?: string) => void;
  pause: (reason?: string) => void;
  markOnline: () => void;
  dispose: () => void;
};

export type ReconnectCoordinatorOptions = {
  attempt: (context: ReconnectAttemptContext) => Promise<ReconnectAttemptResult>;
  delaysMs?: readonly number[];
  maxAttempts?: number;
  scheduler?: ReconnectScheduler;
};

export const DEFAULT_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;

export function createReconnectCoordinator(
  options: ReconnectCoordinatorOptions,
): ReconnectCoordinator {
  const delaysMs = options.delaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
  const maxAttempts = options.maxAttempts ?? delaysMs.length;
  const scheduler = options.scheduler ?? defaultScheduler;
  const listeners = new Set<(state: ReconnectState) => void>();
  let generation = 0;
  let timer: unknown | null = null;
  let disposed = false;
  let state: ReconnectState = {
    phase: "offline",
    attempt: 0,
    maxAttempts,
    generation,
    nextRetryAt: null,
    retryDelayMs: null,
    lastError: null,
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    start(reason = "connectionLost") {
      beginCycle(false, reason);
    },
    retryNow(reason = "manualRetry") {
      beginCycle(true, reason);
    },
    pause(reason = "paused") {
      cancelTimer();
      generation += 1;
      updateState({
        phase: "offline",
        attempt: 0,
        maxAttempts,
        generation,
        nextRetryAt: null,
        retryDelayMs: null,
        lastError: reason,
      });
    },
    markOnline() {
      cancelTimer();
      generation += 1;
      updateState({
        ...state,
        phase: "online",
        generation,
        nextRetryAt: null,
        retryDelayMs: null,
        lastError: null,
      });
    },
    dispose() {
      disposed = true;
      cancelTimer();
      listeners.clear();
      generation += 1;
    },
  };

  function beginCycle(immediate: boolean, reason: string) {
    if (disposed || maxAttempts <= 0 || delaysMs.length === 0) {
      return;
    }
    cancelTimer();
    generation += 1;
    const currentGeneration = generation;
    updateState({
      phase: "offline",
      attempt: 0,
      maxAttempts,
      generation: currentGeneration,
      nextRetryAt: null,
      retryDelayMs: null,
      lastError: reason,
    });
    if (immediate) {
      void runAttempt(currentGeneration, 1);
      return;
    }
    scheduleNext(currentGeneration, 0);
  }

  function scheduleNext(currentGeneration: number, completedAttempts: number) {
    if (!isCurrent(currentGeneration)) {
      return;
    }
    if (completedAttempts >= maxAttempts) {
      updateState({
        ...state,
        phase: "failed",
        attempt: completedAttempts,
        nextRetryAt: null,
        retryDelayMs: null,
      });
      return;
    }
    const delayMs = delaysMs[Math.min(completedAttempts, delaysMs.length - 1)];
    updateState({
      ...state,
      phase: "waiting",
      attempt: completedAttempts,
      generation: currentGeneration,
      nextRetryAt: scheduler.now() + delayMs,
      retryDelayMs: delayMs,
    });
    timer = scheduler.setTimer(() => {
      timer = null;
      void runAttempt(currentGeneration, completedAttempts + 1);
    }, delayMs);
  }

  async function runAttempt(currentGeneration: number, attemptNumber: number) {
    if (!isCurrent(currentGeneration)) {
      return;
    }
    updateState({
      ...state,
      phase: "reconnecting",
      attempt: attemptNumber,
      generation: currentGeneration,
      nextRetryAt: null,
      retryDelayMs: null,
    });
    let result: ReconnectAttemptResult;
    try {
      result = await options.attempt({
        attempt: attemptNumber,
        generation: currentGeneration,
        isCurrent: () => isCurrent(currentGeneration),
        markResuming: () => {
          if (!isCurrent(currentGeneration)) {
            return false;
          }
          updateState({ ...state, phase: "resuming" });
          return true;
        },
      });
    } catch (error) {
      result = { ok: false, reason: error instanceof Error ? error.message : "reconnectFailed" };
    }
    if (!isCurrent(currentGeneration)) {
      return;
    }
    if (result.ok) {
      updateState({
        ...state,
        phase: "online",
        nextRetryAt: null,
        retryDelayMs: null,
        lastError: null,
      });
      return;
    }
    updateState({ ...state, lastError: result.reason });
    if (result.terminal) {
      updateState({
        ...state,
        phase: "failed",
        nextRetryAt: null,
        retryDelayMs: null,
      });
      return;
    }
    scheduleNext(currentGeneration, attemptNumber);
  }

  function isCurrent(currentGeneration: number): boolean {
    return !disposed && currentGeneration === generation;
  }

  function cancelTimer() {
    if (timer !== null) {
      scheduler.clearTimer(timer);
      timer = null;
    }
  }

  function updateState(nextState: ReconnectState) {
    state = nextState;
    for (const listener of listeners) {
      listener(state);
    }
  }
}

const defaultScheduler: ReconnectScheduler = {
  now: Date.now,
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
