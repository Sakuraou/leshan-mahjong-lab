import type { RoomSessionStore } from "@leshan-mahjong/client-core";

import { parsePersistedRoomSession, roomSessionStorageKey } from "./sessionRecord.ts";

export interface BrowserSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createWebRoomSessionStore(storage: BrowserSessionStorage): RoomSessionStore {
  return {
    async load() {
      return parsePersistedRoomSession(storage.getItem(roomSessionStorageKey));
    },
    async save(session) {
      storage.setItem(roomSessionStorageKey, JSON.stringify(session));
    },
    async clear() {
      storage.removeItem(roomSessionStorageKey);
    },
  };
}

export function browserSessionStorage(): BrowserSessionStorage {
  const storage = (globalThis as { sessionStorage?: BrowserSessionStorage }).sessionStorage;
  return storage ?? createMemorySessionStorage();
}

function createMemorySessionStorage(): BrowserSessionStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
}
