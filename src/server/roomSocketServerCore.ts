import {
  createRoomSocketAdapterState,
  handleRoomSocketMessage,
  type PlayerId,
  type RoomSocketAdapterState,
  type RoomSocketClientMessage,
  type RoomSocketServerMessage,
} from "../game/index.ts";

export type RoomSocketConnection = {
  connectionId: string;
  roomId?: string;
  sessionToken?: string;
};

export type RoomSocketServerCoreState = {
  adapter: RoomSocketAdapterState;
  connections: RoomSocketConnection[];
};

export type RoomSocketOutboundMessage = {
  connectionId: string;
  message: RoomSocketServerMessage;
};

export type RoomSocketProtocolError = {
  connectionId: string;
  type: "protocolError";
  payload: {
    code: "invalidJson" | "invalidMessage" | "unknownConnection";
    message: string;
  };
};

export type RoomSocketUndeliveredMessage = {
  recipientSessionToken: string;
  message: RoomSocketServerMessage;
};

export type RoomSocketServerCoreResult = {
  state: RoomSocketServerCoreState;
  outgoing: RoomSocketOutboundMessage[];
  undelivered: RoomSocketUndeliveredMessage[];
  errors: RoomSocketProtocolError[];
};

export function createRoomSocketServerCoreState(): RoomSocketServerCoreState {
  return {
    adapter: createRoomSocketAdapterState(),
    connections: [],
  };
}

export function registerRoomSocketConnection(
  state: RoomSocketServerCoreState,
  connectionId: string,
): RoomSocketServerCoreState {
  if (state.connections.some((connection) => connection.connectionId === connectionId)) {
    return state;
  }

  return {
    ...state,
    connections: [...state.connections, { connectionId }],
  };
}

export function unregisterRoomSocketConnection(
  state: RoomSocketServerCoreState,
  connectionId: string,
): RoomSocketServerCoreState {
  return {
    ...state,
    connections: state.connections.filter((connection) => connection.connectionId !== connectionId),
  };
}

export function handleRoomSocketRawMessage(
  state: RoomSocketServerCoreState,
  connectionId: string,
  rawMessage: string,
): RoomSocketServerCoreResult {
  const connection = state.connections.find((value) => value.connectionId === connectionId);

  if (connection === undefined) {
    return protocolErrorResult(state, connectionId, "unknownConnection", "Connection is not registered.");
  }

  const parsed = parseRoomSocketMessage(rawMessage);

  if (!parsed.ok) {
    return protocolErrorResult(state, connectionId, parsed.code, parsed.message);
  }

  const adapterResult = handleRoomSocketMessage(state.adapter, parsed.message);
  const nextState = bindRequestingConnection(
    {
      ...state,
      adapter: adapterResult.adapter,
    },
    connectionId,
    adapterResult.messages,
  );
  const delivery = routeServerMessages(nextState, connectionId, adapterResult.messages);

  return {
    state: nextState,
    outgoing: delivery.outgoing,
    undelivered: delivery.undelivered,
    errors: [],
  };
}

function parseRoomSocketMessage(
  rawMessage: string,
): { ok: true; message: RoomSocketClientMessage } | { ok: false; code: "invalidJson" | "invalidMessage"; message: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return { ok: false, code: "invalidJson", message: "Message must be valid JSON." };
  }

  if (!isRoomSocketClientMessage(parsed)) {
    return { ok: false, code: "invalidMessage", message: "Message does not match the room socket protocol." };
  }

  return { ok: true, message: parsed };
}

function bindRequestingConnection(
  state: RoomSocketServerCoreState,
  connectionId: string,
  messages: RoomSocketServerMessage[],
): RoomSocketServerCoreState {
  const accepted = messages.find((message) => message.type === "actionAccepted");

  if (accepted === undefined) {
    return state;
  }

  return {
    ...state,
    connections: state.connections.map((connection) => {
      if (connection.connectionId === connectionId) {
        return { ...connection, roomId: accepted.roomId, sessionToken: accepted.recipientSessionToken };
      }

      if (connection.roomId === accepted.roomId && connection.sessionToken === accepted.recipientSessionToken) {
        return { connectionId: connection.connectionId };
      }

      return connection;
    }),
  };
}

function routeServerMessages(
  state: RoomSocketServerCoreState,
  sourceConnectionId: string,
  messages: RoomSocketServerMessage[],
): { outgoing: RoomSocketOutboundMessage[]; undelivered: RoomSocketUndeliveredMessage[] } {
  const outgoing: RoomSocketOutboundMessage[] = [];
  const undelivered: RoomSocketUndeliveredMessage[] = [];

  for (const message of messages) {
    if (message.type === "actionRejected" || message.recipientSessionToken === null) {
      outgoing.push({ connectionId: sourceConnectionId, message });
      continue;
    }

    const connection = state.connections.find(
      (value) => value.roomId === message.roomId && value.sessionToken === message.recipientSessionToken,
    );

    if (connection === undefined) {
      undelivered.push({ recipientSessionToken: message.recipientSessionToken, message });
      continue;
    }

    outgoing.push({ connectionId: connection.connectionId, message });
  }

  return { outgoing, undelivered };
}

function protocolErrorResult(
  state: RoomSocketServerCoreState,
  connectionId: string,
  code: RoomSocketProtocolError["payload"]["code"],
  message: string,
): RoomSocketServerCoreResult {
  return {
    state,
    outgoing: [],
    undelivered: [],
    errors: [
      {
        connectionId,
        type: "protocolError",
        payload: { code, message },
      },
    ],
  };
}

function isRoomSocketClientMessage(value: unknown): value is RoomSocketClientMessage {
  if (!isRecord(value) || value.protocolVersion !== 1 || typeof value.clientMessageId !== "string") {
    return false;
  }

  if (value.type === "createRoom") {
    return (
      isRecord(value.payload) &&
      typeof value.payload.roomId === "string" &&
      typeof value.payload.seed === "string" &&
      typeof value.payload.displayName === "string"
    );
  }

  if (value.type === "joinRoom") {
    return isRoomMessage(value) && isRecord(value.payload) && typeof value.payload.displayName === "string";
  }

  if (value.type === "takeSeat") {
    return isSessionRoomMessage(value) && isRecord(value.payload) && isPlayerId(value.payload.seatId);
  }

  if (value.type === "toggleReady") {
    return isSessionRoomMessage(value) && isRecord(value.payload);
  }

  if (value.type === "startRound") {
    return (
      isSessionRoomMessage(value) &&
      isRecord(value.payload) &&
      (value.payload.dealer === undefined || isPlayerId(value.payload.dealer))
    );
  }

  if (value.type === "chooseMissingSuit") {
    return isSessionRoomMessage(value) && isRecord(value.payload) && isSuit(value.payload.suit);
  }

  if (value.type === "drawTile") {
    return isSessionRoomMessage(value) && isRecord(value.payload);
  }

  if (value.type === "discardTile") {
    return isSessionRoomMessage(value) && isRecord(value.payload) && isTile(value.payload.tile);
  }

  if (value.type === "passClaim" || value.type === "expireClaimWindow") {
    return isSessionRoomMessage(value) && isRecord(value.payload);
  }

  if (value.type === "resumeSession") {
    return (
      isSessionRoomMessage(value) &&
      isRecord(value.payload) &&
      (value.payload.lastSeenEventId === undefined || typeof value.payload.lastSeenEventId === "number")
    );
  }

  return false;
}

function isRoomMessage(value: Record<string, unknown>): value is Record<string, unknown> & { roomId: string } {
  return typeof value.roomId === "string";
}

function isSessionRoomMessage(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { roomId: string; sessionToken: string } {
  return isRoomMessage(value) && typeof value.sessionToken === "string";
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isSuit(value: unknown): boolean {
  return value === "characters" || value === "dots" || value === "bamboos";
}

function isRank(value: unknown): boolean {
  return (
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6 ||
    value === 7 ||
    value === 8 ||
    value === 9
  );
}

function isTile(value: unknown): boolean {
  return isRecord(value) && isSuit(value.suit) && isRank(value.rank);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
