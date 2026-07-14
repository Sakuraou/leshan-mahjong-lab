import type {
  ClientVisibleRoomState,
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
  drawTile: () => Promise<ClientTransportActionResult>;
  drawGangTile: () => Promise<ClientTransportActionResult>;
  discardTile: (tile: Tile) => Promise<ClientTransportActionResult>;
  passClaim: () => Promise<ClientTransportActionResult>;
  claimHu: () => Promise<ClientTransportActionResult>;
  claimSelfDrawHu: () => Promise<ClientTransportActionResult>;
  claimPeng: () => Promise<ClientTransportActionResult>;
  claimMingGang: () => Promise<ClientTransportActionResult>;
  passQiangGang: () => Promise<ClientTransportActionResult>;
  claimQiangGangHu: () => Promise<ClientTransportActionResult>;
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
