import {
  createRoom,
  createRoomSocketAdapterState,
  handleRoomSocketMessage,
  toClientVisibleRoomState,
  type ClientVisibleRoomState,
  type PlayerId,
  type RoomSocketAdapterState,
  type RoomSocketClientMessage,
  type RoomSocketServerMessage,
  type RoomState,
} from "./game/index.ts";

export type LocalRoomTransportState = {
  adapter: RoomSocketAdapterState;
  room: RoomState;
  roomId: string;
  seed: string;
  nextClientMessageNumber: number;
  sessionTokenByPlayerId: Record<string, string | undefined>;
  snapshotByPlayerId: Record<string, ClientVisibleRoomState | undefined>;
};

export type LocalRoomTransportResult = {
  state: LocalRoomTransportState;
  messages: RoomSocketServerMessage[];
  rejectedMessages: Extract<RoomSocketServerMessage, { type: "actionRejected" }>[];
};

export function createLocalRoomTransport(input: { roomId: string; seed: string }): LocalRoomTransportState {
  return {
    adapter: createRoomSocketAdapterState({ roomSeedFactory: () => input.seed }),
    room: createRoom({ id: input.roomId, seed: input.seed }),
    roomId: input.roomId,
    seed: input.seed,
    nextClientMessageNumber: 1,
    sessionTokenByPlayerId: {},
    snapshotByPlayerId: {},
  };
}

export function createLocalRoomSession(
  state: LocalRoomTransportState,
  input: { displayName: string },
): LocalRoomTransportResult {
  return dispatchLocalRoomMessage(state, {
    protocolVersion: 1,
    clientMessageId: nextClientMessageId(state),
    type: "createRoom",
    payload: { roomId: state.roomId, displayName: input.displayName },
  });
}

export function joinLocalRoomSession(
  state: LocalRoomTransportState,
  input: { displayName: string },
): LocalRoomTransportResult {
  return dispatchLocalRoomMessage(state, {
    protocolVersion: 1,
    clientMessageId: nextClientMessageId(state),
    roomId: state.roomId,
    type: "joinRoom",
    payload: { displayName: input.displayName },
  });
}

export function takeLocalRoomSeat(
  state: LocalRoomTransportState,
  playerId: string,
  seatId: PlayerId,
): LocalRoomTransportResult {
  return dispatchSessionMessage(state, playerId, {
    type: "takeSeat",
    payload: { seatId },
  });
}

export function toggleLocalRoomReady(
  state: LocalRoomTransportState,
  playerId: string,
): LocalRoomTransportResult {
  return dispatchSessionMessage(state, playerId, {
    type: "toggleReady",
    payload: {},
  });
}

export function startLocalRoomRound(
  state: LocalRoomTransportState,
  playerId: string,
  dealer: PlayerId,
): LocalRoomTransportResult {
  return dispatchSessionMessage(state, playerId, {
    type: "startRound",
    payload: { dealer },
  });
}

export function getLocalRoomSessionToken(state: LocalRoomTransportState, playerId: string): string | undefined {
  return state.sessionTokenByPlayerId[playerId];
}

export function getLocalRoomClientView(
  state: LocalRoomTransportState,
  playerId: string,
): ClientVisibleRoomState {
  return state.snapshotByPlayerId[playerId] ?? toClientVisibleRoomState(state.room, playerId);
}

export function replaceLocalRoomTransportRoom(
  state: LocalRoomTransportState,
  room: RoomState,
): LocalRoomTransportState {
  const adapter = {
    ...state.adapter,
    rooms: state.adapter.rooms.map((entry) =>
      entry.roomId === room.id ? { ...entry, service: { ...entry.service, room } } : entry,
    ),
  };

  return refreshSnapshots({
    ...state,
    adapter,
    room,
  });
}

function dispatchSessionMessage(
  state: LocalRoomTransportState,
  playerId: string,
  message: Omit<
    Extract<RoomSocketClientMessage, { type: "takeSeat" | "toggleReady" | "startRound" }>,
    "protocolVersion" | "clientMessageId" | "roomId" | "sessionToken"
  >,
): LocalRoomTransportResult {
  const sessionToken = state.sessionTokenByPlayerId[playerId];

  if (sessionToken === undefined) {
    const rejectedMessage = createLocalActionRejectedMessage(state, "invalidSession", "Session is invalid.");

    return {
      state: { ...state, nextClientMessageNumber: state.nextClientMessageNumber + 1 },
      messages: [rejectedMessage],
      rejectedMessages: [rejectedMessage],
    };
  }

  return dispatchLocalRoomMessage(state, {
    protocolVersion: 1,
    clientMessageId: nextClientMessageId(state),
    roomId: state.roomId,
    sessionToken,
    ...message,
  } as RoomSocketClientMessage);
}

function dispatchLocalRoomMessage(
  state: LocalRoomTransportState,
  message: RoomSocketClientMessage,
): LocalRoomTransportResult {
  const result = handleRoomSocketMessage(state.adapter, message);
  const nextState = applySocketMessages(
    {
      ...state,
      adapter: result.adapter,
      room: result.adapter.rooms.find((entry) => entry.roomId === state.roomId)?.service.room ?? state.room,
      nextClientMessageNumber: state.nextClientMessageNumber + 1,
    },
    result.messages,
  );

  return {
    state: nextState,
    messages: result.messages,
    rejectedMessages: result.messages.filter((value) => value.type === "actionRejected"),
  };
}

function applySocketMessages(
  state: LocalRoomTransportState,
  messages: RoomSocketServerMessage[],
): LocalRoomTransportState {
  const sessionTokenByPlayerId = { ...state.sessionTokenByPlayerId };
  const snapshotByPlayerId = { ...state.snapshotByPlayerId };

  for (const message of messages) {
    if (message.type !== "roomSnapshot") {
      continue;
    }

    sessionTokenByPlayerId[message.payload.playerId] = message.payload.sessionToken;
    snapshotByPlayerId[message.payload.playerId] = message.payload.view;
  }

  return refreshSnapshots({
    ...state,
    sessionTokenByPlayerId,
    snapshotByPlayerId,
  });
}

function refreshSnapshots(state: LocalRoomTransportState): LocalRoomTransportState {
  const snapshotByPlayerId = { ...state.snapshotByPlayerId };

  for (const playerId of Object.keys(state.sessionTokenByPlayerId)) {
    snapshotByPlayerId[playerId] = toClientVisibleRoomState(state.room, playerId);
  }

  return { ...state, snapshotByPlayerId };
}

function nextClientMessageId(state: LocalRoomTransportState): string {
  return `local-${state.nextClientMessageNumber}`;
}

function createLocalActionRejectedMessage(
  state: LocalRoomTransportState,
  code: Extract<RoomSocketServerMessage, { type: "actionRejected" }>["payload"]["code"],
  message: string,
): Extract<RoomSocketServerMessage, { type: "actionRejected" }> {
  return {
    protocolVersion: 1,
    serverEventId: 0,
    roomId: state.roomId,
    recipientSessionToken: null,
    type: "actionRejected",
    payload: {
      clientMessageId: nextClientMessageId(state),
      code,
      message,
    },
  };
}
