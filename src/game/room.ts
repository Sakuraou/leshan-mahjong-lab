import { startRound } from "./round.ts";
import type { PlayerId, RoundState, Tile } from "./types.ts";

const seatIds: PlayerId[] = [0, 1, 2, 3];

export type RoomStatus = "waiting" | "dingque";

export type RoomMember = {
  playerId: string;
  displayName: string;
  connected: boolean;
};

export type SeatState = {
  seatId: PlayerId;
  playerId: string | null;
  displayName: string | null;
  connected: boolean;
  ready: boolean;
};

export type RoomEvent =
  | { type: "roomCreated"; roomId: string }
  | { type: "playerJoined"; playerId: string; displayName: string }
  | { type: "seatTaken"; seatId: PlayerId; playerId: string }
  | { type: "readyChanged"; seatId: PlayerId; playerId: string; ready: boolean }
  | { type: "roundStarted"; seed: string; dealer: PlayerId };

export type RoomState = {
  id: string;
  seed: string;
  status: RoomStatus;
  members: RoomMember[];
  seats: SeatState[];
  round: RoundState | null;
  eventLog: RoomEvent[];
};

export type VisiblePlayerState = {
  id: PlayerId;
  hand: Tile[] | null;
  handCount: number;
  discards: Tile[];
  hasWon: boolean;
  missingSuit: RoundState["players"][number]["missingSuit"];
};

export type ClientVisibleRoomState = {
  id: string;
  status: RoomStatus;
  localSeatId: PlayerId | null;
  seats: SeatState[];
  round:
    | null
    | {
        seed: string;
        dealer: PlayerId;
        currentPlayer: PlayerId;
        wallCount: number;
        players: VisiblePlayerState[];
      };
  eventLog: RoomEvent[];
};

export type CreateRoomInput = {
  id: string;
  seed: string;
};

export type JoinRoomInput = {
  playerId: string;
  displayName: string;
};

export type TakeSeatResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "roomAlreadyStarted" | "playerNotInRoom" | "seatOccupied" | "playerAlreadySeated" };

export type JoinRoomResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "roomAlreadyStarted" | "playerAlreadyJoined" };

export type ToggleReadyResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "roomAlreadyStarted" | "playerNotSeated" };

export type StartRoomRoundResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: "roomAlreadyStarted" | "notEnoughPlayers" | "notAllPlayersReady" };

export function createRoom(input: CreateRoomInput): RoomState {
  return {
    id: input.id,
    seed: input.seed,
    status: "waiting",
    members: [],
    seats: seatIds.map((seatId) => ({
      seatId,
      playerId: null,
      displayName: null,
      connected: false,
      ready: false,
    })),
    round: null,
    eventLog: [{ type: "roomCreated", roomId: input.id }],
  };
}

export function joinRoom(room: RoomState, input: JoinRoomInput): JoinRoomResult {
  if (room.status !== "waiting") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  if (room.members.some((member) => member.playerId === input.playerId)) {
    return { ok: false, reason: "playerAlreadyJoined" };
  }

  return {
    ok: true,
    room: {
      ...room,
      members: [...room.members, { ...input, connected: true }],
      eventLog: [...room.eventLog, { type: "playerJoined", ...input }],
    },
  };
}

export function takeSeat(room: RoomState, playerId: string, seatId: PlayerId): TakeSeatResult {
  if (room.status !== "waiting") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  const member = room.members.find((value) => value.playerId === playerId);

  if (member === undefined) {
    return { ok: false, reason: "playerNotInRoom" };
  }

  if (room.seats.some((seat) => seat.playerId === playerId)) {
    return { ok: false, reason: "playerAlreadySeated" };
  }

  const seat = room.seats[seatId];

  if (seat.playerId !== null) {
    return { ok: false, reason: "seatOccupied" };
  }

  return {
    ok: true,
    room: {
      ...room,
      seats: replaceSeat(room.seats, seatId, {
        ...seat,
        playerId,
        displayName: member.displayName,
        connected: member.connected,
        ready: false,
      }),
      eventLog: [...room.eventLog, { type: "seatTaken", seatId, playerId }],
    },
  };
}

export function toggleReady(room: RoomState, playerId: string): ToggleReadyResult {
  if (room.status !== "waiting") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  const seat = room.seats.find((value) => value.playerId === playerId);

  if (seat === undefined) {
    return { ok: false, reason: "playerNotSeated" };
  }

  const nextSeat = { ...seat, ready: !seat.ready };

  return {
    ok: true,
    room: {
      ...room,
      seats: replaceSeat(room.seats, seat.seatId, nextSeat),
      eventLog: [
        ...room.eventLog,
        { type: "readyChanged", seatId: seat.seatId, playerId, ready: nextSeat.ready },
      ],
    },
  };
}

export function startRoomRound(room: RoomState, dealer: PlayerId = 0): StartRoomRoundResult {
  if (room.status !== "waiting") {
    return { ok: false, reason: "roomAlreadyStarted" };
  }

  if (room.seats.some((seat) => seat.playerId === null)) {
    return { ok: false, reason: "notEnoughPlayers" };
  }

  if (room.seats.some((seat) => !seat.ready)) {
    return { ok: false, reason: "notAllPlayersReady" };
  }

  return {
    ok: true,
    room: {
      ...room,
      status: "dingque",
      round: startRound({ seed: room.seed, dealer }),
      eventLog: [...room.eventLog, { type: "roundStarted", seed: room.seed, dealer }],
    },
  };
}

export function toClientVisibleRoomState(room: RoomState, playerId: string): ClientVisibleRoomState {
  const localSeatId = room.seats.find((seat) => seat.playerId === playerId)?.seatId ?? null;

  return {
    id: room.id,
    status: room.status,
    localSeatId,
    seats: room.seats,
    round:
      room.round === null
        ? null
        : {
            seed: room.round.seed,
            dealer: room.round.dealer,
            currentPlayer: room.round.currentPlayer,
            wallCount: room.round.wall.length,
            players: room.round.players.map((player) => ({
              id: player.id,
              hand: player.id === localSeatId ? player.hand : null,
              handCount: player.hand.length,
              discards: player.discards,
              hasWon: player.hasWon,
              missingSuit: player.missingSuit,
            })),
          },
    eventLog: room.eventLog,
  };
}

function replaceSeat(seats: SeatState[], seatId: PlayerId, nextSeat: SeatState): SeatState[] {
  return seats.map((seat) => (seat.seatId === seatId ? nextSeat : seat));
}
