import type { ClientVisibleRoomState } from "./contract.ts";

export function nextAutomaticDrawActionId(
  snapshot: ClientVisibleRoomState | null,
  inFlightActionId: string | null,
  lastCompletedActionId: string | null | undefined,
): string | null {
  return nextAutomaticDrawAction(snapshot, inFlightActionId, lastCompletedActionId)?.actionId ?? null;
}

export function nextAutomaticDrawAction(
  snapshot: ClientVisibleRoomState | null,
  inFlightActionId: string | null,
  lastCompletedActionId: string | null | undefined,
): { action: "drawTile" | "drawGangTile"; actionId: string } | null {
  const descriptor = snapshot?.actionDescriptors.find((entry) =>
    entry.action === "drawTile" || entry.action === "drawGangTile");
  if (descriptor === undefined ||
      (descriptor.action !== "drawTile" && descriptor.action !== "drawGangTile") ||
      descriptor.actionId === inFlightActionId || descriptor.actionId === lastCompletedActionId) {
    return null;
  }
  return { action: descriptor.action, actionId: descriptor.actionId };
}
