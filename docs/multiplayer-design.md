# Multiplayer Room Design

This document describes the intended product flow and technical shape for real
multiplayer rooms. It is a design plan only; the current repository does not
implement a backend yet.

## Goals

- Let four real players join the same Leshan Mahjong room.
- Keep tile wall, hands, turn order, dingque, and settlement controlled by the
  server.
- Make the client simple: choose a seat, get ready, choose dingque, then play
  only when it is your turn.
- Preserve the tested TypeScript rule engine as the shared source of rule
  behavior.

## Non-Goals For The First Multiplayer Step

- No ranked matchmaking.
- No money, payment, or wallet behavior.
- No public chat moderation system.
- No native mobile client.
- No AI replacement player unless a player disconnects for too long.

## Room Lifecycle

```text
Lobby
  -> Room created
  -> Players join
  -> Seats filled or manually assigned
  -> All seated players ready
  -> Server starts round
  -> Players choose dingque
  -> Server deals and advances turns
  -> Round ends by blood-battle completion or draw
  -> Settlement shown
  -> Ready for next round
```

## Room Creation And Joining

### Create Room

1. Host clicks Create Room.
2. Server creates a short room code, for example `L8J4K2`.
3. Server stores room options:
   - Ruleset: Leshan eight-chicken
   - Player count: 4
   - Chicken mode: eight-chicken
   - Score cap: 64
   - Yao ji discard rule: cannot actively discard yao ji in the MVP
4. Host is added to the room and can choose a seat.
5. Client displays the invite code and copy link action.

### Join Room

1. Player opens an invite link or enters the room code.
2. Server validates that the room exists and is not already in a locked state.
3. Player joins as an observer if no seat is selected yet.
4. Player chooses an empty seat.
5. Server broadcasts the updated seat map to all connected clients.

## Seat Assignment

Seats are stable for a room:

```text
Seat 0: East / dealer candidate
Seat 1: Next player
Seat 2: Opposite player
Seat 3: Previous player
```

Rules:

- A player can only send actions for their own seat.
- A seat can have at most one active player connection.
- Reconnecting with the same session token reclaims the same seat.
- Observers can view public table state but never receive hidden hands.
- The dealer can rotate after a round later; the first version can keep a fixed
  dealer to reduce scope.

## Ready State

1. Every seated player has a `ready` flag.
2. Players can toggle ready while the room is waiting.
3. Server starts the round only when four seats are occupied and all four
   players are ready.
4. After the server starts the round, readiness is locked until settlement.

This avoids one client starting a game before everyone is present.

## Dingque Flow

The current prototype already treats dingque as player-selected. Multiplayer
should keep that model.

1. Server creates and shuffles the wall with a seed.
2. Server deals initial hands.
3. Server sends each player only their own hidden hand.
4. Client shows each player their hand and the dingque choices:
   - Bamboos
   - Dots
   - Characters
5. If a hand has exactly one ordinary suit missing, the server may auto-select
   that suit as heavenly dingque.
6. Otherwise the player submits `chooseMissingSuit`.
7. Server validates the request:
   - The player is seated.
   - The round is in dingque phase.
   - The player has not already chosen.
   - The selected suit is valid.
8. When all players have chosen, the server moves to the action phase.

## System Dealing And Drawing

The server owns all hidden randomness:

- The server generates the 108-tile wall.
- The server shuffles with a recorded seed.
- The server deals 14 tiles to the dealer and 13 to the other players.
- The server draws from the wall automatically at the start of a draw turn.

Client behavior:

- The player does not click a draw button.
- The client receives `tileDrawn` only for the current player.
- Other clients receive public metadata such as wall count and whose turn it is,
  but not the drawn tile.

This matches the real table flow: players choose what to discard, not whether
the wall gives them a tile.

## Turn Actions

The server accepts actions only for the current legal timing window.

### Discard

Client sends:

```json
{
  "type": "discardTile",
  "roomId": "L8J4K2",
  "playerId": "player-a",
  "tile": { "suit": "characters", "rank": 5 },
  "clientActionId": "uuid"
}
```

Server validates:

- The session owns the seat.
- It is that player's turn.
- The player has completed dingque.
- The tile exists in that player's hand.
- Dingque discard constraints are satisfied.
- The tile is not an actively discarded yao ji under the current MVP rule.

Server then:

1. Removes the tile from the player's hand.
2. Adds it to that player's public discard area.
3. Checks possible discard hu windows for other players.
4. Broadcasts a public `tileDiscarded` event.
5. Either opens a claim window or advances to the next active player.

### Hu

For the first real-time version, hu can be split into:

- Self-draw hu after the server auto-draws a tile.
- Discard hu during the discard claim window.

Server validates with the shared rule engine:

- Hand structure can hu.
- Dingque is satisfied.
- Minimum score rule is satisfied.
- Ping hu discard win is rejected when it is only 1 point.

### Peng And Gang

Peng and gang can be added after the first room skeleton because they introduce
claim priority and extra timing windows.

Planned action windows:

- `discardClaimWindow`
- `pengAvailable`
- `mingGangAvailable`
- `anGangAvailable`
- `baGangAvailable`
- `robGangHuWindow`

## Disconnection And Reconnect

### Short Disconnect

1. Server marks the seat as disconnected but keeps it reserved.
2. Other players see a disconnected badge.
3. The disconnected player can reload and reconnect with the same session token.
4. Server sends a state snapshot scoped to that player:
   - Own hand
   - Public discards
   - Melds when implemented
   - Wall count
   - Current phase
   - Pending legal actions

### Long Disconnect

For the first production-like version:

- Keep the room paused for a timeout window.
- After timeout, allow the room owner to dissolve the room.
- Later, add auto-discard or AI takeover only if the product direction needs it.

## Server-Authoritative Validation

The server must be the source of truth. The client is only a renderer and input
surface.

Server owns:

- Room membership
- Seat ownership
- Wall generation and shuffle seed
- Hidden hands
- Current phase
- Current player
- Legal action windows
- Score calculation
- Settlement
- Event log

Client may calculate helper hints, but the server decides whether an action is
accepted.

## State Shape

Suggested high-level server state:

```ts
type RoomState = {
  id: string;
  status: "waiting" | "readyCheck" | "dingque" | "playing" | "settlement";
  ruleset: "leshan-eight-chicken";
  seats: SeatState[];
  round: ServerRoundState | null;
  eventLog: RoomEvent[];
};

type SeatState = {
  seatId: 0 | 1 | 2 | 3;
  playerId: string | null;
  displayName: string | null;
  connected: boolean;
  ready: boolean;
};

type ServerRoundState = {
  seed: string;
  dealer: 0 | 1 | 2 | 3;
  currentPlayer: 0 | 1 | 2 | 3;
  wall: Tile[];
  players: ServerPlayerState[];
  phase: "dingque" | "draw" | "discard" | "claim" | "settlement";
};
```

Each client receives a redacted state view:

- Own hand is visible.
- Other players' hand counts are visible.
- Other players' hidden tiles are not visible.
- Wall count is visible.
- Public discards and public melds are visible.

## Event Model

Every accepted action should produce an append-only event:

```text
roomCreated
playerJoined
seatTaken
playerReadyChanged
roundStarted
initialHandDealt
missingSuitChosen
tileDrawn
tileDiscarded
huDeclared
playerWon
roundSettled
playerDisconnected
playerReconnected
```

This makes reconnect, replay, debugging, and portfolio explanation easier.

## Suggested Implementation Order

1. Define shared room event and redacted state types.
2. Add a local in-memory room reducer and tests without networking.
3. Add a simple WebSocket server or serverless real-time provider.
4. Connect the React table to room snapshots and server events.
5. Add reconnect with a local session token.
6. Add peng/gang/claim windows after the basic turn loop is stable.

## Portfolio Framing

The current app is a frontend multiplayer-table prototype. It demonstrates the
intended player experience before adding network infrastructure:

- Local seat only
- Hidden opponent hands
- Player-selected dingque
- Automatic system draw
- Server-authoritative design documented before implementation

The next engineering milestone is to connect this prototype to a real-time room
layer while preserving the pure TypeScript rule engine.
