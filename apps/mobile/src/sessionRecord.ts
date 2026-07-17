import type { PersistedRoomSession } from "@leshan-mahjong/client-core";

export const roomSessionStorageKey = "leshan-mahjong.room-session.v1";

export function parsePersistedRoomSession(raw: string | null): PersistedRoomSession | null {
  if (raw === null) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as Partial<PersistedRoomSession>;

    if (
      typeof value.serverUrl !== "string" ||
      typeof value.roomId !== "string" ||
      typeof value.playerId !== "string" ||
      typeof value.sessionToken !== "string" || value.sessionToken.trim() === "" ||
      typeof value.lastEventId !== "number" || !Number.isSafeInteger(value.lastEventId) || value.lastEventId < 0 ||
      !isWebSocketUrl(value.serverUrl)
    ) {
      return null;
    }

    return {
      serverUrl: value.serverUrl,
      roomId: value.roomId,
      playerId: value.playerId,
      sessionToken: value.sessionToken,
      lastEventId: value.lastEventId,
      ...(typeof value.lastCompletedAutoDrawActionId === "string"
        ? { lastCompletedAutoDrawActionId: value.lastCompletedAutoDrawActionId }
        : {}),
      ...(typeof value.handOrderRoundNumber === "number" && Number.isSafeInteger(value.handOrderRoundNumber) &&
          Array.isArray(value.handOrderTileIds) && value.handOrderTileIds.every((tileId) => typeof tileId === "string")
        ? {
            handOrderRoundNumber: value.handOrderRoundNumber,
            handOrderTileIds: [...value.handOrderTileIds],
          }
        : {}),
    };
  } catch {
    return null;
  }
}

function isWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "ws:" || url.protocol === "wss:") && url.hostname !== "";
  } catch {
    return false;
  }
}
