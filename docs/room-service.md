# Room Service Interface

`src/game/roomService.ts` is the first server-authoritative room layer. It is
still pure TypeScript and has no WebSocket dependency. The goal is to make the
future network adapter thin: the adapter should translate socket messages into
room service calls, then send the returned redacted room view back to clients.

## Responsibilities

The room service owns the authoritative in-memory state for one room:

- Room state, seats, readiness, round status, and event log.
- Session tokens and their player ids.
- Monotonic `lastEventId` for reconnect and event replay.
- Redacted client-visible room views through `toClientVisibleRoomState`.
- Room actions that reuse the existing room reducer:
  - `joinRoom`
  - `takeSeat`
  - `toggleReady`
  - `startRoomRound`
- A stable API that can be called by both the current frontend mock transport
  and a future real WebSocket adapter.

It does not own:

- WebSocket connections.
- HTTP routing.
- Database persistence.
- Authentication beyond local `sessionToken` lookup.
- Peng, gang, discard claim windows, or settlement flow.

## State Structure

```ts
type RoomServiceState = {
  room: RoomState;
  sessions: RoomSession[];
  lastEventId: number;
  nextPlayerNumber: number;
  nextSessionNumber: number;
};
```

`room` is the authoritative `RoomState`. Clients should not mutate it directly.
Every accepted action returns a new service state.

`sessions` map browser sessions to players:

```ts
type RoomSession = {
  sessionToken: string;
  playerId: string;
  displayName: string;
  lastEventId: number;
};
```

`lastEventId` is currently derived from the room event log length. It is
monotonic for the room and lets a reconnecting client ask for events after its
last seen cursor.

`nextPlayerNumber` and `nextSessionNumber` are deterministic counters for this
first in-memory version. A production server can replace them with generated
ids and secure tokens without changing the room action flow.

## Public API

### `createRoomSession`

Creates a new room, adds the host as the first member, creates `session-1`, and
returns the host-scoped visible room view.

```ts
createRoomSession({
  roomId: "L8J4K2",
  seed: "room-seed",
  displayName: "Host",
});
```

Returns:

- `service`: next authoritative service state.
- `session`: host session token and player id.
- `view`: host-visible redacted room state.
- `lastEventId`: current room cursor.
- `events`: events produced by creation and host join.

### `joinRoomSession`

Adds a new room member and creates an independent session token.

```ts
joinRoomSession(service, { displayName: "Player Two" });
```

This does not take a seat. Seat ownership is a separate action so the future UI
can support observers and explicit seat selection.

### `handleRoomAction`

Applies one authenticated room action:

```ts
handleRoomAction(service, sessionToken, { type: "takeSeat", seatId: 1 });
handleRoomAction(service, sessionToken, { type: "toggleReady" });
handleRoomAction(service, sessionToken, { type: "startRound" });
```

Validation path:

1. Look up the session token.
2. Resolve the session to a `playerId`.
3. Call the existing pure reducer.
4. If accepted, return the next `RoomServiceState`.
5. Return only the session-scoped `ClientVisibleRoomState`.

Invalid sessions return `invalidSession`. Rule failures return the reducer's
stable reason code, such as `seatOccupied`, `notEnoughPlayers`, or
`roomAlreadyStarted`.

### `getClientRoomView`

Returns the redacted room state for one session:

```ts
getClientRoomView(service, sessionToken);
```

The current session sees its own hand after the round starts. Other players'
hands are returned as `hand: null` with `handCount`.

### `resumeRoomSession`

Restores a session after reload or reconnect:

```ts
resumeRoomSession(service, {
  sessionToken,
  lastSeenEventId: 4,
});
```

The response contains:

- A fresh redacted room snapshot.
- The current `lastEventId`.
- `missedEvents`, sliced from the room event log after `lastSeenEventId`.

This is enough for the first WebSocket adapter to choose either event replay or
snapshot replacement.

## Action Flow

```text
Client
  -> WebSocket adapter receives message
  -> adapter validates message envelope
  -> adapter calls roomService
  -> roomService validates session and reducer rules
  -> roomService returns next state, events, view, lastEventId
  -> adapter stores next state
  -> adapter sends roomSnapshot or roomEvent to each connected client
```

The service never broadcasts by itself. Broadcasting belongs to the adapter
because only the adapter knows which sockets are connected.

## Relationship To WebSocket

The WebSocket adapter should be a small translation layer:

| Socket message | Room service call |
| --- | --- |
| `createRoom` | `createRoomSession` |
| `joinRoom` | `joinRoomSession` |
| `takeSeat` | `handleRoomAction(..., { type: "takeSeat" })` |
| `toggleReady` | `handleRoomAction(..., { type: "toggleReady" })` |
| `startRound` | `handleRoomAction(..., { type: "startRound" })` |
| `resumeSession` | `resumeRoomSession` |

After every accepted action, the adapter should call `getClientRoomView` for
each connected session and send a client-specific snapshot. This keeps hidden
hands out of other players' payloads.

## Current Frontend Mock Transport

The frontend now exercises this service through two layers instead of calling
the room reducer directly:

```text
App room controls
  -> localRoomTransport
  -> roomSocketAdapter
  -> roomService
  -> room reducer
```

`localRoomTransport` is not a production network layer. It is a browser-local
stand-in that stores adapter state in memory, creates protocol-like client
messages, and saves the returned `roomSnapshot` payloads by player id.

This gives the prototype a useful portfolio property: the page is still easy to
run locally, but its room flow already behaves like a future networked client.
Each simulated client perspective renders from its own redacted
`ClientVisibleRoomState`, so one player's hand is not present in another
player's snapshot.

## Future Real Server Entry

The real WebSocket server should keep `roomService` behind the adapter rather
than importing the reducer directly. A first server entry can be intentionally
thin:

```text
socket receives client message
  -> validate protocolVersion, clientMessageId, roomId, and sessionToken
  -> call roomSocketAdapter
  -> store returned adapter state
  -> route accepted/rejected/snapshot messages to connected sockets
```

Server-owned concerns:

- Real socket connection lifecycle.
- Session-to-socket registry.
- Reconnect timeout and presence state.
- Secure token generation.
- Optional room persistence.
- Deployment choice, such as Node WebSocket, Socket.IO, or a managed realtime
  provider.

Service-owned concerns stay unchanged: room lifecycle validation, session
lookup, event ids, and redacted room views.

## Current Limits

- One service state represents one room. A server process will need a room map:
  `Map<roomId, RoomServiceState>`.
- Session tokens are deterministic for tests. Production should use secure
  random tokens.
- The service covers room lifecycle through start round only.
- Draw, discard, hu, peng, gang, settlement, and reconnect connection badges
  are still future service actions.
- State is in memory only. Restarting the server would lose rooms.

## Next Adapter Step

The pure-function adapter and frontend mock transport are already in place. The
next implementation milestone is a real WebSocket runtime wrapper that:

1. Maintains a `Map<roomId, RoomServiceState>`.
2. Parses protocol messages from `docs/realtime-protocol.md`.
3. Calls the room service.
4. Stores the returned service state.
5. Sends each connected session its own redacted room view.
6. Supports reconnect through `sessionToken` and `lastSeenEventId`.
