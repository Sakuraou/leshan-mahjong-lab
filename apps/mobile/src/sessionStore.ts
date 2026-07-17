import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type {
  RoomSessionStore,
} from "@leshan-mahjong/client-core";

import { parsePersistedRoomSession, roomSessionStorageKey } from "./sessionRecord.ts";
import { browserSessionStorage, createWebRoomSessionStore } from "./webSessionStore.ts";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const nativeRoomSessionStore: RoomSessionStore = {
  async load() {
    return parsePersistedRoomSession(await SecureStore.getItemAsync(roomSessionStorageKey, secureStoreOptions));
  },
  async save(session) {
    await SecureStore.setItemAsync(roomSessionStorageKey, JSON.stringify(session), secureStoreOptions);
  },
  async clear() {
    await SecureStore.deleteItemAsync(roomSessionStorageKey, secureStoreOptions);
  },
};

export const mobileRoomSessionStore: RoomSessionStore = Platform.OS === "web"
  ? createWebRoomSessionStore(browserSessionStorage())
  : nativeRoomSessionStore;
