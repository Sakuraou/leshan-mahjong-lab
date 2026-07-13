# WebSocket Server Core

`src/server/roomSocketServerCore.ts` is the first testable server-side shell
around the room socket adapter. It does not open a network port yet. Its purpose
is to define how a real WebSocket process will register connections, parse
messages, call the authoritative adapter, and route responses.

## Current Scope

The server core owns:

- Connection registration by `connectionId`.
- Optional connection binding to `roomId` and `sessionToken`.
- Raw JSON message parsing.
- Basic protocol shape validation.
- Calling `handleRoomSocketMessage` from `roomSocketAdapter`.
- Storing the returned adapter state.
- Routing `RoomSocketServerMessage` objects by `recipientSessionToken`.
- Recording messages that cannot be delivered because no connection owns that
  session.

It does not own:

- Browser client code.
- Authentication.
- Secure token generation.
- Database persistence.
- Heartbeats or reconnect timeout cleanup.
- Gameplay actions beyond the room lifecycle and `chooseMissingSuit` already
  supported by `roomSocketAdapter`.

## State Model

```ts
type RoomSocketServerCoreState = {
  adapter: RoomSocketAdapterState;
  connections: RoomSocketConnection[];
};

type RoomSocketConnection = {
  connectionId: string;
  roomId?: string;
  sessionToken?: string;
};
```

`adapter` is the server-authoritative room table. `connections` is the future
runtime's connection registry. In the current pure-function version, tests pass
in synthetic connection ids such as `conn-host`.

## Connection Registration

A real WebSocket wrapper should call:

```ts
registerRoomSocketConnection(state, connectionId);
```

when a socket connects, and:

```ts
unregisterRoomSocketConnection(state, connectionId);
```

when it disconnects.

The core does not decide how connection ids are generated. A Node wrapper can
use an incrementing id, a UUID, or an id supplied by the socket runtime.

## Message Flow

```text
socket receives raw text
  -> handleRoomSocketRawMessage(state, connectionId, rawText)
  -> parse JSON
  -> validate protocolVersion, clientMessageId, type, roomId, sessionToken, payload
  -> call handleRoomSocketMessage(adapter, typedMessage)
  -> store returned adapter state
  -> bind requesting connection after actionAccepted
  -> route messages by recipientSessionToken
```

The return value is explicit so it can be tested without a live server:

```ts
type RoomSocketServerCoreResult = {
  state: RoomSocketServerCoreState;
  outgoing: RoomSocketOutboundMessage[];
  undelivered: RoomSocketUndeliveredMessage[];
  errors: RoomSocketProtocolError[];
};
```

## Adapter Call

The core keeps the adapter boundary narrow:

```ts
const adapterResult = handleRoomSocketMessage(state.adapter, parsed.message);
```

The adapter remains responsible for room-service validation, session lookup,
event ids, room snapshots, and action rejection. The server core only decides
where each returned message should go.

## SessionToken Routing

Every accepted room action from `roomSocketAdapter` returns messages with a
`recipientSessionToken`.

Routing rules:

- `recipientSessionToken: null` is sent back to the source connection. This is
  used for rejected unauthenticated messages such as duplicate room creation.
- A non-null `recipientSessionToken` is delivered to the connection whose
  `roomId` and `sessionToken` match.
- If no connection owns that session, the message is added to `undelivered`.
- When a session resumes on a newer connection, the core binds that
  `sessionToken` to the new connection and clears the old connection binding.
  Future redacted snapshots then flow to the latest browser tab instead of a
  stale socket.

This prevents the server from accidentally sending a private snapshot to the
wrong socket.

## Undelivered Strategy

`undelivered` is intentionally not treated as a fatal error. It can happen when:

- A player has disconnected.
- A test sends a message with an unknown session token.
- A client needs to reconnect and resume from `lastEventId`.

For the first real server wrapper, undelivered messages can be logged. Later,
they can feed reconnect metrics or short-lived delivery buffers.

## Protocol Errors

The core rejects malformed input before it reaches the adapter:

- `unknownConnection`: a message arrived for a connection id that was not
  registered.
- `invalidJson`: raw text was not valid JSON.
- `invalidMessage`: JSON parsed successfully but did not match the room socket
  client message shape.

These errors are returned in `errors` rather than being sent through
`roomSocketAdapter`, because they are transport/protocol problems rather than
room-rule problems.

## Real Node WebSocket Dev Server

The project now includes a lightweight `ws` wrapper in
`src/server/devServer.ts`. It keeps the real network layer thin and delegates
state handling to `roomSocketServerCore`.

Run it locally with:

```bash
npm run dev:server
```

By default it listens on:

```text
ws://127.0.0.1:8787
```

The server entry follows this shape:

```ts
import { WebSocketServer } from "ws";
import {
  createRoomSocketServerCoreState,
  handleRoomSocketRawMessage,
  registerRoomSocketConnection,
  unregisterRoomSocketConnection,
} from "./roomSocketServerCore.ts";

let state = createRoomSocketServerCoreState();
const sockets = new Map<string, WebSocket>();
const server = new WebSocketServer({ port: 8787 });

server.on("connection", (socket) => {
  const connectionId = createConnectionId();
  sockets.set(connectionId, socket);
  state = registerRoomSocketConnection(state, connectionId);

  socket.on("message", (data) => {
    const result = handleRoomSocketRawMessage(state, connectionId, data.toString());
    state = result.state;

    for (const outgoing of result.outgoing) {
      sockets.get(outgoing.connectionId)?.send(JSON.stringify(outgoing.message));
    }

    for (const error of result.errors) {
      socket.send(JSON.stringify(error));
    }
  });

  socket.on("close", () => {
    sockets.delete(connectionId);
    state = unregisterRoomSocketConnection(state, connectionId);
  });
});
```

The wrapper should stay boring. The interesting behavior should remain in the
tested core and the tested adapter.

## Smoke Client

`src/server/smokeClient.ts` opens two real WebSocket connections against the dev
server flow:

1. Host connects and sends `createRoom`.
2. Guest connects and sends `joinRoom`.
3. Host receives `actionAccepted`, its first `roomSnapshot`, and the guest-join
   broadcast snapshot.
4. Guest receives `actionAccepted` and its own `roomSnapshot`.

Run it with:

```bash
npm run smoke:server
```

The smoke helper starts a temporary server on an ephemeral port, so it does not
require `npm run dev:server` to already be running.

## Frontend Transport Wrapper

`src/webSocketRoomTransport.ts` is now the browser-facing WebSocket client
wrapper. It is separate from the current UI path, so the app can keep the local
mock transport as the default portfolio-safe mode while the real transport is
tested independently.

The wrapper:

- Connects to `ws://127.0.0.1:8787` by default.
- Sends `createRoom`, `joinRoom`, `takeSeat`, `toggleReady`, and `startRound`
  messages using the shared protocol types.
- Waits for matching `actionAccepted` or `actionRejected` messages by
  `clientMessageId`.
- Stores the latest `roomSnapshot` by `playerId`.
- Maintains `sessionTokenByPlayerId` so later seat/ready/start actions can use
  the server-issued session token.
- Exposes test helpers such as `waitForSnapshot` and `waitForMessageCount`.

It does not yet replace `localRoomTransport` in the React page. That switch
should be a deliberate UI milestone, ideally with a mode toggle and clear
status text.

## React Experiment Panel

The React app now includes a dedicated WebSocket experiment panel. It is a
side-by-side proof of networking, not a replacement for the default mock table.

The panel supports:

- Connecting to `ws://127.0.0.1:8787`.
- Creating the room as the host client.
- Joining as a guest client.
- Host and guest seat-taking.
- Host and guest ready actions.
- Auto-filling helper clients for players 3 and 4.
- Starting the round after four clients are seated and ready.
- Submitting `chooseMissingSuit` from the WebSocket preview path after the room
  reaches `dingque`.
- Displaying one redacted snapshot summary per connected client.
- Saving host/guest `sessionToken` and `lastEventId` in `localStorage`.
- Simulating a browser refresh by closing host/guest sockets, reconnecting, and
  calling `resumeSession` for restored redacted snapshots and missed events.

The full-flow button runs this chain:

```text
connect host + guest
  -> host createRoom
  -> guest joinRoom
  -> helper players 3 and 4 joinRoom
  -> all four clients take seats
  -> all four clients toggleReady
  -> host startRound
  -> every client receives a roomSnapshot
```

Expected snapshot behavior:

- Host sees 14 local hand tiles after start.
- Non-dealer clients see 13 local hand tiles after start.
- Every client sees the other three players as hidden hands.
- The room status becomes `dingque`.
- The latest event is `roundStarted`.
- After simulated refresh, host/guest receive fresh redacted snapshots through
  their newly connected sockets. The UI shows whether resume succeeded and how
  many missed events came back from the server.

The default playable table remains backed by the local mock transport. This
keeps the portfolio demo stable while the real WebSocket path matures.

## Main Table Preview Mode

The main table now includes a limited "真实 WebSocket 桌面预览" mode. This is a
bridge between the isolated experiment panel and the eventual real multiplayer
table, but it still does not replace the mock gameplay path.

The preview reads the latest real `roomSnapshot` values already received by the
WebSocket experiment panel and renders:

- Real room id and room status.
- Seat occupancy and ready count.
- Wall count after the server-authoritative round start.
- Four seat cards with ready state and visible/hidden hand counts.
- One client card per connected session, showing that each client only sees its
  own hand and sees other players as hidden counts.
- Dingque state per seat and per client snapshot.
- `chooseMissingSuit` buttons that send the first server-authoritative table
  action through the real WebSocket transport.

The preview is still deliberately limited. It can submit dingque, but it does
not send draw, discard, peng, gang, hu, or settlement actions. Those actions
still belong to the mock table until the real server action surface is expanded.

## Session Recovery Demo

The current recovery flow is intentionally small but end-to-end:

```text
host/guest receive roomSnapshot
  -> frontend stores sessionToken + lastEventId in localStorage
  -> user clicks "模拟刷新后恢复"
  -> frontend closes host/guest sockets and opens new ones
  -> frontend sends resumeSession with stored sessionToken + lastSeenEventId
  -> roomService returns missed events and a redacted client snapshot
  -> server core rebinds that sessionToken to the newest connection
  -> React panel renders restored host/guest snapshots
```

This is not production authentication. It is a portfolio-safe demonstration of
the reconnect contract: client state stores only a session cursor, server state
remains authoritative, and the response is still scoped to the recovering
client's redacted view.

## Screenshot Plan

Portfolio screenshots to capture next:

| Shot | What to show |
| --- | --- |
| WebSocket experiment panel | Server address, connected status, and room lifecycle controls |
| Four-client redacted snapshots | Host, guest, and helper clients with own-hand counts and hidden opponent summaries |
| Full flow round start | All four clients seated and ready, room status `dingque`, latest event `roundStarted` |
| WebSocket dingque | Preview client card submits `chooseMissingSuit`, server confirms the action, and every client receives an updated redacted snapshot |
| Session recovery demo | "模拟刷新后恢复" button, resume success badge, restored host/guest snapshots, missed-event count |
| Main table WebSocket preview | Main table limited preview showing real roomSnapshot room status, seats, readiness, wall count, redacted hand counts, and dingque state |

## Server-Owned Response Deadlines

The dev server runs one lightweight polling interval rather than creating a
separate timer per response window. Each poll calls
`tickRoomSocketServerDeadlines`, which delegates all timing decisions to the
pure room/service/adapter core and then routes only changed redacted snapshots.

Window state contains serializable `windowId`, `deadlineAt`, and status fields;
timer handles never enter room state or client snapshots. The server clears its
polling interval during shutdown. Tests inject a fixed clock and timeout length,
while the real dev server defaults to a 250 ms poll and a 15 second response
window.

The old client-triggered `expireClaimWindow` protocol action has been removed.
This prevents a valid session from ending another player's response time early.
Snapshots include `serverNow`, allowing the frontend to render a calibrated
countdown while the server remains authoritative.

## Current Test Coverage

`tests/game/roomSocketServerCore.test.ts` covers:

- Routing accepted and snapshot messages to registered session connections.
- Invalid JSON returning a protocol error before adapter execution.
- Unknown-session messages becoming `undelivered` instead of being sent to the
  wrong connection.
- Resumed sessions being rebound from stale sockets to the newest connection.

`tests/game/roomSocketDevServer.test.ts` covers the real `ws` wrapper path:

- Start a real WebSocket server on an ephemeral local port.
- Connect host and guest sockets.
- Verify `createRoom` and `joinRoom` return `actionAccepted` and
  `roomSnapshot` messages over actual WebSocket connections.

`tests/game/webSocketRoomTransport.test.ts` covers the browser-facing transport
wrapper against a real local WebSocket server:

- Four clients connect through the transport wrapper.
- Host creates a room and three clients join.
- Each client sends seat and ready actions using its own session token.
- Host starts the round.
- A client can submit `chooseMissingSuit`.
- Each transport stores its own redacted snapshot and does not expose other
  players' hands.
- A new transport can call `resumeSession` with a stored `sessionToken` and
  `lastSeenEventId`, then receive missed events and a restored redacted
  snapshot.

The React WebSocket preview now consumes server-authoritative dingque, draw,
discard, claim, gang, hu, score-ledger, and response-deadline snapshots while
the mock table remains available as the default portfolio-safe path.

## Next Milestone

The next milestone is production hardening: heartbeat/presence tracking,
persistent room recovery, deployment configuration for the WebSocket process,
and extension of the settlement ledger to gang, chicken, and cha-jiao payments.
