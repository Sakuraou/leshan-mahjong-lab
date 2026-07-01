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
- Gameplay actions beyond the room lifecycle already supported by
  `roomSocketAdapter`.

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

## Current Test Coverage

`tests/game/roomSocketServerCore.test.ts` covers:

- Routing accepted and snapshot messages to registered session connections.
- Invalid JSON returning a protocol error before adapter execution.
- Unknown-session messages becoming `undelivered` instead of being sent to the
  wrong connection.

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
- Each transport stores its own redacted snapshot and does not expose other
  players' hands.

## Next Milestone

The real local WebSocket dev server and frontend WebSocket transport wrapper
are running-capable. The next milestone is to expose this path in the React UI
without removing the mock transport fallback:

1. Keep mock transport as the default portfolio-safe mode.
2. Add a UI mode toggle for local mock transport versus real WebSocket
   transport.
3. Persist `sessionToken` and `lastEventId` locally for reconnect.
4. Render room snapshots from real server messages.
5. Keep server-authoritative validation in `roomSocketAdapter` and
   `roomService`.
