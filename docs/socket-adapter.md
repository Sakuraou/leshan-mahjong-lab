# Room Socket Adapter

`src/game/roomSocketAdapter.ts` is the first WebSocket-shaped adapter for the
authoritative room service. It is still pure TypeScript and does not open a
socket server. Its job is to prove the protocol boundary before any networking
code is introduced.

## Responsibilities

The adapter:

- Accepts protocol-like client messages.
- Looks up or creates `RoomServiceState` by `roomId`.
- Maps room messages to `roomService` calls.
- Stores the returned authoritative service state.
- Returns `ServerMessage`-style results.
- Builds a redacted `roomSnapshot` for each recipient session after accepted
  room updates.

The adapter does not:

- Start a WebSocket server.
- Track actual socket connections.
- Retry dropped messages.
- Persist rooms to a database.
- Authenticate real users.
- Handle draw, discard, hu, peng, gang, or settlement messages yet.

## Adapter State

```ts
type RoomSocketAdapterState = {
  rooms: RoomSocketRoomState[];
};

type RoomSocketRoomState = {
  roomId: string;
  service: RoomServiceState;
};
```

This is the future server's in-memory room table. A real server can wrap this
with:

```ts
let adapter = createRoomSocketAdapterState();
adapter = handleRoomSocketMessage(adapter, message).adapter;
```

For a production backend, the array can become a `Map<roomId, RoomServiceState>`
or a persisted room repository. The public behavior should stay the same.

## Client Message Input

The adapter accepts a typed subset of the protocol from
[`docs/realtime-protocol.md`](realtime-protocol.md):

```ts
type RoomSocketClientMessage =
  | { type: "createRoom"; payload: { roomId: string; displayName: string } }
  | { type: "joinRoom"; roomId: string; payload: { displayName: string } }
  | { type: "takeSeat"; roomId: string; sessionToken: string; payload: { seatId: PlayerId } }
  | { type: "toggleReady"; roomId: string; sessionToken: string; payload: {} }
  | { type: "startRound"; roomId: string; sessionToken: string; payload: { dealer?: PlayerId } }
  | { type: "resumeSession"; roomId: string; sessionToken: string; payload: { lastSeenEventId?: number } };
```

The adapter generates the private shuffle seed and secure session tokens on the
server side. Tests may inject deterministic factories, but neither value is
accepted from an untrusted client.

All messages include:

- `protocolVersion: 1`
- `clientMessageId`

The adapter currently supports room lifecycle messages only. Gameplay actions
such as draw, discard, hu, peng, gang, and settlement should be added after the
room transport is stable.

## ServerMessage Output

The adapter returns:

```ts
type RoomSocketAdapterResult = {
  adapter: RoomSocketAdapterState;
  messages: RoomSocketServerMessage[];
};
```

Each message is one of:

```ts
type RoomSocketServerMessage =
  | { type: "actionAccepted"; recipientSessionToken: string; payload: { clientMessageId: string } }
  | { type: "actionRejected"; recipientSessionToken: string | null; payload: { clientMessageId: string; code: string; message: string } }
  | { type: "roomSnapshot"; recipientSessionToken: string; payload: RoomSnapshotPayload };
```

The first message for an accepted action is usually `actionAccepted` for the
requesting session. Snapshot messages follow.

Rejected actions do not mutate adapter state. They return an `actionRejected`
message with a stable code such as:

- `roomNotFound`
- `roomAlreadyExists`
- `invalidSession`
- `seatOccupied`
- `notEnoughPlayers`
- `notAllPlayersReady`

## Redacted Snapshot Broadcast Strategy

After an accepted room mutation, the adapter creates a snapshot for every
session in that room:

```text
accepted action
  -> roomService returns next RoomServiceState
  -> adapter stores next state
  -> adapter loops through sessions
  -> getClientRoomView(service, eachSessionToken)
  -> emit one roomSnapshot per session
```

This means four players receive four different snapshots.

Visibility rule:

- The recipient session sees its own hand as `hand: Tile[]`.
- Other seats receive `hand: null` plus `handCount`.
- Public room state, seats, readiness, current turn, discards, and wall count
  remain visible.

This mirrors the frontend perspective switcher and prevents hidden hands from
leaking through broadcast payloads.

## Message Mapping

| Client message | Adapter behavior | Room service call |
| --- | --- | --- |
| `createRoom` | Creates adapter room entry | `createRoomSession` |
| `joinRoom` | Adds session to existing room | `joinRoomSession` |
| `takeSeat` | Authenticated seat action | `handleRoomAction(..., { type: "takeSeat" })` |
| `toggleReady` | Authenticated ready action | `handleRoomAction(..., { type: "toggleReady" })` |
| `startRound` | Authenticated start action | `handleRoomAction(..., { type: "startRound" })` |
| `resumeSession` | Returns missed events and snapshot | `resumeRoomSession` |

## Relationship To A Real WebSocket Server

A real WebSocket server should be a thin outer shell:

```text
socket.onmessage
  -> parse JSON
  -> validate protocol envelope
  -> call handleRoomSocketMessage(adapter, message)
  -> replace adapter state with result.adapter
  -> send each result message to its recipient socket
```

The real server still needs to own:

- Connection registry: `sessionToken -> socket`
- Room membership lookup for broadcasting
- JSON schema validation
- Heartbeat and disconnect handling
- Secure session token generation
- Optional persistence

The adapter intentionally does not know about sockets. This keeps it easy to
unit test and lets the project choose between:

- A real WebSocket server.
- The current local mock transport for frontend integration.
- A serverless real-time provider later.

## Frontend Mock Transport Integration

The frontend now uses `src/localRoomTransport.ts` as a low-risk transport layer
before real networking exists. This module is intentionally shaped like a local
client-to-server message bus:

1. Keep `RoomSocketAdapterState` inside `LocalRoomTransportState`.
2. Convert room UI actions into `RoomSocketClientMessage` objects.
3. Call `handleRoomSocketMessage`.
4. Store the returned adapter state as the local authoritative state.
5. Capture each `roomSnapshot` under that message's `playerId`.
6. Render the selected client perspective from its own redacted snapshot.

The current room UI no longer calls the room reducer directly for join, seat,
ready, or start-round actions. Those actions move through:

```text
React room controls
  -> localRoomTransport
  -> roomSocketAdapter
  -> roomService
  -> room reducer
  -> per-session roomSnapshot messages
  -> selected client's redacted table view
```

This keeps the browser demo honest: even though it is still offline, the UI is
already consuming server-shaped snapshots. Switching from mock transport to a
real WebSocket transport should mostly change message delivery, connection
registry, and reconnect handling, not the room lifecycle behavior.

## Real Server Entry Design

The next server milestone can wrap this adapter with a small runtime-specific
entry. The boundary should look like:

```ts
type ConnectedClient = {
  socketId: string;
  sessionToken?: string;
  roomId?: string;
};

let adapter = createRoomSocketAdapterState();

function onClientMessage(socketId: string, raw: string) {
  const message = parseAndValidateRoomSocketMessage(raw);
  const result = handleRoomSocketMessage(adapter, message);
  adapter = result.adapter;

  for (const serverMessage of result.messages) {
    deliverServerMessage(socketId, serverMessage);
  }
}
```

The runtime wrapper should own:

- JSON parsing and schema validation.
- `socketId -> sessionToken` and `sessionToken -> socketId` registries.
- Sending `actionAccepted` / `actionRejected` to the requesting socket.
- Sending `roomSnapshot` to the session named by `recipientSessionToken`.
- Heartbeats, disconnect state, and reconnect timeouts.
- Secure token generation if deterministic test tokens are replaced.

The adapter should continue to own only protocol-to-service mapping.

## Current Test Coverage

`tests/game/roomSocketAdapter.test.ts` covers:

- `createRoom` mapping and host snapshot.
- `joinRoom` mapping and multi-session snapshots.
- Rejected action for invalid session.
- `resumeSession` missed-event recovery.
- Four-session start-round broadcast where each session receives only its own
  hidden hand.

`tests/game/localRoomTransport.test.ts` covers the browser-facing mock
transport path:

- Create host session through the adapter.
- Join, sit, and ready four simulated players.
- Start a round through adapter messages.
- Confirm player-specific redacted snapshots hide other players' hands.

## Next Milestone

The local mock transport path is complete. The next milestone is a real
WebSocket server entry that wraps `handleRoomSocketMessage`, keeps a connection
registry, and sends each connected client the redacted snapshot addressed to
its own session.
