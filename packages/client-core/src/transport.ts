import type {
  ClientVisibleRoomState,
  MobilePublicEvent,
  PlayerId,
  ProtocolErrorCode,
  RoomSocketErrorCode,
  Suit,
  Tile,
} from "./contract.ts";

export type ClientTransportActionResult =
  | {
      ok: true;
      clientMessageId: string;
      playerId: string;
      sessionToken: string;
    }
  | {
      ok: false;
      kind: "action" | "protocol" | "transport";
      code: RoomSocketErrorCode | ProtocolErrorCode | "malformedServerMessage" | "closed" | "timeout" | "missingSessionToken";
      reason: string;
    };

export type MobileRoomTransportState = {
  url: string;
  roomId: string;
  status: "connecting" | "online" | "closed" | "error";
  playerId: string | null;
  sessionToken: string | null;
  snapshot: ClientVisibleRoomState | null;
  lastEventId: number;
  serverNow: number | null;
  events: MobilePublicEvent[];
  lastError: string | null;
};

export type MobileRoomTransport = {
  createRoomSession: (input: { displayName: string }) => Promise<ClientTransportActionResult>;
  joinRoomSession: (input: { displayName: string }) => Promise<ClientTransportActionResult>;
  resumeSession: (input: { sessionToken: string; lastSeenEventId?: number }) => Promise<ClientTransportActionResult>;
  takeSeat: (seatId: PlayerId) => Promise<ClientTransportActionResult>;
  toggleReady: () => Promise<ClientTransportActionResult>;
  startRound: (dealer?: PlayerId) => Promise<ClientTransportActionResult>;
  chooseMissingSuit: (suit: Suit) => Promise<ClientTransportActionResult>;
  drawTile: (expectedActionId: string) => Promise<ClientTransportActionResult>;
  drawGangTile: (expectedActionId: string) => Promise<ClientTransportActionResult>;
  discardTile: (tile: Tile, expectedActionId: string) => Promise<ClientTransportActionResult>;
  passClaim: (expectedActionId: string) => Promise<ClientTransportActionResult>;
  claimHu: (expectedActionId: string) => Promise<ClientTransportActionResult>;
  claimSelfDrawHu: (expectedActionId: string) => Promise<ClientTransportActionResult>;
  claimPeng: (expectedActionId: string) => Promise<ClientTransportActionResult>;
  claimMingGang: (expectedActionId: string) => Promise<ClientTransportActionResult>;
  claimAnGang: (tile: Tile, expectedActionId: string) => Promise<ClientTransportActionResult>;
  claimBaGang: (tile: Tile, expectedActionId: string) => Promise<ClientTransportActionResult>;
  passQiangGang: (expectedActionId: string) => Promise<ClientTransportActionResult>;
  claimQiangGangHu: (expectedActionId: string) => Promise<ClientTransportActionResult>;
  getState: () => MobileRoomTransportState;
  subscribe: (listener: (state: MobileRoomTransportState) => void) => () => void;
  waitForSnapshot: (timeoutMs?: number) => Promise<ClientVisibleRoomState>;
  close: () => void;
};

export type PersistedRoomSession = {
  serverUrl: string;
  roomId: string;
  playerId: string;
  sessionToken: string;
  lastEventId: number;
  lastCompletedAutoDrawActionId?: string;
};

export type RoomSessionStore = {
  load: () => Promise<PersistedRoomSession | null>;
  save: (session: PersistedRoomSession) => Promise<void>;
  clear: () => Promise<void>;
};
