import {
  createRoomSocketAdapterState,
  handleRoomSocketMessage,
  markRoomSocketSessionDisconnected,
  tickRoomSocketDeadlines,
  type PlayerId,
  type RoomSocketAdapterOptions,
  type RoomSocketAdapterState,
  type RoomSocketClientMessage,
  type RoomSocketServerMessage,
} from "../game/index.ts";

export type RoomSocketConnection = {
  connectionId: string;
  lastSeenAt: number;
  roomId?: string;
  sessionToken?: string;
  playerId?: string;
  supersededSessionTokens?: string[];
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
    code: "invalidJson" | "invalidMessage" | "unknownConnection" | "sessionNotBound";
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

export type RoomSocketConnectionHealthResult = RoomSocketServerCoreResult & {
  expiredConnectionIds: string[];
};

export function createRoomSocketServerCoreState(options: RoomSocketAdapterOptions = {}): RoomSocketServerCoreState {
  return {
    adapter: createRoomSocketAdapterState(options),
    connections: [],
  };
}

export function registerRoomSocketConnection(
  state: RoomSocketServerCoreState,
  connectionId: string,
  now = Date.now(),
): RoomSocketServerCoreState {
  if (state.connections.some((connection) => connection.connectionId === connectionId)) {
    return state;
  }

  return {
    ...state,
    connections: [...state.connections, { connectionId, lastSeenAt: now }],
  };
}

export function markRoomSocketConnectionAlive(
  state: RoomSocketServerCoreState,
  connectionId: string,
  now = Date.now(),
): RoomSocketServerCoreState {
  const connection = state.connections.find((value) => value.connectionId === connectionId);
  const nextSeenAt = connection === undefined ? now : Math.max(connection.lastSeenAt, now);

  if (connection === undefined || connection.lastSeenAt === nextSeenAt) {
    return state;
  }

  return {
    ...state,
    connections: state.connections.map((value) =>
      value.connectionId === connectionId ? { ...value, lastSeenAt: nextSeenAt } : value,
    ),
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

export function handleRoomSocketConnectionClosed(
  state: RoomSocketServerCoreState,
  connectionId: string,
): RoomSocketServerCoreResult {
  const connection = state.connections.find((value) => value.connectionId === connectionId);

  if (connection === undefined) {
    return emptyResult(state);
  }

  let nextState = unregisterRoomSocketConnection(state, connectionId);

  if (connection.roomId === undefined || connection.sessionToken === undefined || connection.playerId === undefined) {
    return emptyResult(nextState);
  }

  const presence = markRoomSocketSessionDisconnected(
    nextState.adapter,
    connection.roomId,
    connection.sessionToken,
  );
  nextState = { ...nextState, adapter: presence.adapter };
  const delivery = routeServerMessages(nextState, "", presence.messages);

  return {
    state: nextState,
    outgoing: delivery.outgoing,
    undelivered: delivery.undelivered,
    errors: [],
  };
}

export function tickRoomSocketConnectionHealth(
  state: RoomSocketServerCoreState,
  now: number,
  timeoutMs: number,
): RoomSocketConnectionHealthResult {
  const expiredConnectionIds = state.connections
    .filter((connection) => now - connection.lastSeenAt >= timeoutMs)
    .map((connection) => connection.connectionId);

  if (expiredConnectionIds.length === 0) {
    return { ...emptyResult(state), expiredConnectionIds: [] };
  }

  let nextState = state;
  const outgoing: RoomSocketOutboundMessage[] = [];
  const undelivered: RoomSocketUndeliveredMessage[] = [];
  const errors: RoomSocketProtocolError[] = [];

  for (const connectionId of expiredConnectionIds) {
    const result = handleRoomSocketConnectionClosed(nextState, connectionId);
    nextState = result.state;
    outgoing.push(...result.outgoing);
    undelivered.push(...result.undelivered);
    errors.push(...result.errors);
  }

  return { state: nextState, outgoing, undelivered, errors, expiredConnectionIds };
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

  if (!connectionCanSendMessage(state, connection, parsed.message)) {
    return protocolErrorResult(
      state,
      connectionId,
      "sessionNotBound",
      "Session is bound to another connection; resume it on this connection first.",
    );
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

export function tickRoomSocketServerDeadlines(
  state: RoomSocketServerCoreState,
  now?: number,
): RoomSocketServerCoreResult {
  const result = tickRoomSocketDeadlines(state.adapter, now);
  const nextState = { ...state, adapter: result.adapter };
  const delivery = routeServerMessages(nextState, "", result.messages);

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
        return {
          ...connection,
          roomId: accepted.roomId,
          sessionToken: accepted.recipientSessionToken,
          playerId: accepted.payload.playerId,
        };
      }

      if (connection.roomId === accepted.roomId && connection.sessionToken === accepted.recipientSessionToken) {
        return {
          connectionId: connection.connectionId,
          lastSeenAt: connection.lastSeenAt,
          supersededSessionTokens: [
            ...(connection.supersededSessionTokens ?? []),
            accepted.recipientSessionToken,
          ],
        };
      }

      return connection;
    }),
  };
}

function connectionCanSendMessage(
  state: RoomSocketServerCoreState,
  connection: RoomSocketConnection,
  message: RoomSocketClientMessage,
): boolean {
  if (message.type === "createRoom" || message.type === "joinRoom") {
    return true;
  }

  if (message.type === "resumeSession") {
    return !(connection.supersededSessionTokens ?? []).includes(message.sessionToken);
  }

  if (connection.roomId === message.roomId && connection.sessionToken === message.sessionToken) {
    return true;
  }

  const sessionExists = state.adapter.rooms.some(
    (room) =>
      room.roomId === message.roomId &&
      room.service.sessions.some((session) => session.sessionToken === message.sessionToken),
  );

  return !sessionExists;
}

function routeServerMessages(
  state: RoomSocketServerCoreState,
  sourceConnectionId: string,
  messages: RoomSocketServerMessage[],
): { outgoing: RoomSocketOutboundMessage[]; undelivered: RoomSocketUndeliveredMessage[] } {
  const outgoing: RoomSocketOutboundMessage[] = [];
  const undelivered: RoomSocketUndeliveredMessage[] = [];

  for (const message of messages) {
    if (message.type === "actionRejected") {
      outgoing.push({ connectionId: sourceConnectionId, message });
      continue;
    }

    if (message.type === "roomSnapshot") {
      const connection = state.connections.find(
        (value) => value.roomId === message.roomId && value.playerId === message.payload.playerId,
      );

      if (connection !== undefined) {
        outgoing.push({ connectionId: connection.connectionId, message });
        continue;
      }

      const sessionToken = sessionTokenForPlayer(state, message.roomId, message.payload.playerId);

      if (sessionToken !== undefined) {
        undelivered.push({ recipientSessionToken: sessionToken, message });
      }

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

function sessionTokenForPlayer(
  state: RoomSocketServerCoreState,
  roomId: string,
  playerId: string,
): string | undefined {
  return state.adapter.rooms
    .find((room) => room.roomId === roomId)
    ?.service.sessions.find((session) => session.playerId === playerId)?.sessionToken;
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

function emptyResult(state: RoomSocketServerCoreState): RoomSocketServerCoreResult {
  return { state, outgoing: [], undelivered: [], errors: [] };
}

function isRoomSocketClientMessage(value: unknown): value is RoomSocketClientMessage {
  if (!isRecord(value) || value.protocolVersion !== 1 || typeof value.clientMessageId !== "string") {
    return false;
  }

  if (value.type === "createRoom") {
    return (
      isRecord(value.payload) &&
      typeof value.payload.roomId === "string" &&
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

  if (value.type === "discardTile" || value.type === "claimAnGang" || value.type === "claimBaGang") {
    return isSessionRoomMessage(value) && isRecord(value.payload) && isTile(value.payload.tile);
  }

  if (
    value.type === "passClaim" ||
    value.type === "claimHu" ||
    value.type === "claimSelfDrawHu" ||
    value.type === "claimPeng" ||
    value.type === "claimMingGang" ||
    value.type === "passQiangGang" ||
    value.type === "claimQiangGangHu" ||
    value.type === "drawGangTile"
  ) {
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
