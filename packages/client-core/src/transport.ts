import type { ClientVisibleRoomState } from "../../../src/game/room.ts";
import type { PlayerId, Suit } from "../../../src/game/types.ts";

export type ClientTransportActionResult =
  | { ok: true; playerId: string; sessionToken: string }
  | { ok: false; reason: string };

export type RoomClientTransport = {
  createRoomSession: (input: { displayName: string }) => Promise<ClientTransportActionResult>;
  joinRoomSession: (input: { displayName: string }) => Promise<ClientTransportActionResult>;
  resumeSession: (input: {
    sessionToken: string;
    lastSeenEventId?: number;
  }) => Promise<ClientTransportActionResult>;
  takeSeat: (playerId: string, seatId: PlayerId) => Promise<ClientTransportActionResult>;
  toggleReady: (playerId: string) => Promise<ClientTransportActionResult>;
  startRound: (playerId: string, dealer?: PlayerId) => Promise<ClientTransportActionResult>;
  chooseMissingSuit: (playerId: string, suit: Suit) => Promise<ClientTransportActionResult>;
  getClientView: (playerId: string) => ClientVisibleRoomState | undefined;
  getSessionToken: (playerId: string) => string | undefined;
  close: () => void;
};

export type PersistedRoomSession = {
  serverUrl: string;
  roomId: string;
  playerId: string;
  sessionToken: string;
  lastEventId: number;
};

export type RoomSessionStore = {
  load: () => Promise<PersistedRoomSession | null>;
  save: (session: PersistedRoomSession) => Promise<void>;
  clear: () => Promise<void>;
};
