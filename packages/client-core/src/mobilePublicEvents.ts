import type { MobilePublicEvent } from "./contract.ts";

export const DEFAULT_MOBILE_EVENT_LIMIT = 100;

export function mergeMobilePublicEvents(
  current: readonly MobilePublicEvent[],
  incoming: readonly MobilePublicEvent[],
  limit = DEFAULT_MOBILE_EVENT_LIMIT,
): MobilePublicEvent[] {
  const eventsById = new Map<number, MobilePublicEvent>();

  for (const event of [...current, ...incoming]) {
    const existing = eventsById.get(event.eventId);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(event)) {
      throw new Error(`Conflicting public event ${event.eventId}.`);
    }
    eventsById.set(event.eventId, event);
  }

  const sorted = [...eventsById.values()].sort((left, right) => left.eventId - right.eventId);
  return sorted.slice(Math.max(0, sorted.length - Math.max(0, limit)));
}
