import * as SecureStore from "expo-secure-store";

import type {
  PersistedRoomSession,
  RoomSessionStore,
} from "@leshan-mahjong/client-core";

const storageKey = "leshan-mahjong.room-session.v1";

export const mobileRoomSessionStore: RoomSessionStore = {
  async load() {
    const raw = await SecureStore.getItemAsync(storageKey);

    if (raw === null) {
      return null;
    }

    try {
      const value = JSON.parse(raw) as Partial<PersistedRoomSession>;

      if (
        typeof value.serverUrl !== "string" ||
        typeof value.roomId !== "string" ||
        typeof value.playerId !== "string" ||
        typeof value.sessionToken !== "string" ||
        typeof value.lastEventId !== "number"
      ) {
        return null;
      }

      return {
        serverUrl: value.serverUrl,
        roomId: value.roomId,
        playerId: value.playerId,
        sessionToken: value.sessionToken,
        lastEventId: value.lastEventId,
      };
    } catch {
      return null;
    }
  },
  async save(session) {
    await SecureStore.setItemAsync(storageKey, JSON.stringify(session));
  },
  async clear() {
    await SecureStore.deleteItemAsync(storageKey);
  },
};
