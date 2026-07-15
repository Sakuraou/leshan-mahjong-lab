# WebSocket Server Core

`src/server/roomSocketServerCore.ts` is the testable server-side shell around
the room socket adapter. `src/server/devServer.ts` wraps it with a real local
Node `ws` port while keeping connection health and room transitions in pure,
deterministic core functions.

## Production Runtime

`src/server/nodeServer.ts` now provides the shared Node HTTP/WebSocket runtime.
The existing dev server keeps its root-path socket for browser compatibility;
`productionServer.ts` adds validated environment configuration:

- WebSocket upgrades only on `WS_PATH` (default `/ws`).
- Exact browser Origin allowlisting and an explicit missing-Origin policy for
  native clients; wildcard production origins are rejected.
- `/health/live` and `/health/ready`; readiness returns `503` while draining.
- A 64 KiB default payload limit, guarded sends, ping/pong health, response
  deadline ticks, and idempotent graceful shutdown.
- Structured startup/lifecycle logs that omit raw messages, snapshots, hands,
  session tokens, and undelivered recipient credentials.

The Dockerfile starts this entry with Node 24. TLS should terminate at the
hosting provider; phones use public `wss://` while the single container receives
HTTP/WS. Keep one replica because active rooms are process memory. See
[internal-beta-deployment.md](internal-beta-deployment.md).

## Current Scope

The server core owns:

- Connection registration by `connectionId`.
- Server-internal `lastSeenAt` health timestamps.
- Optional connection binding to `roomId` and `sessionToken`.
- Raw JSON message parsing.
- Basic protocol shape validation.
- Calling `handleRoomSocketMessage` from `roomSocketAdapter`.
- Storing the returned adapter state.
- Routing accepted actions by session and redacted snapshots by internal player
  binding.
- Recording messages that cannot be delivered because no connection owns that
  session.
- Expiring stale connections through an injectable-clock health tick.

It does not own:

- Browser client code.
- Authentication.
- Secure token generation.
- Database persistence.
- Production deployment, load balancing, and durable reconnect cleanup.
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
  lastSeenAt: number;
  roomId?: string;
  sessionToken?: string;
  playerId?: string;
};
```

`adapter` is the server-authoritative room table. `connections` is the future
runtime's connection registry. All fields in `RoomSocketConnection` are
server-internal and are excluded from client-visible snapshots.

## Connection Registration

A real WebSocket wrapper should call:

```ts
registerRoomSocketConnection(state, connectionId, now);
```

when a socket connects, and:

```ts
handleRoomSocketConnectionClosed(state, connectionId);
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

Accepted actions carry a targeted `recipientSessionToken`; redacted snapshots
do not contain a token and are routed by the server's internal room/player
binding.

Routing rules:

- `actionRejected` is sent back to the requesting connection.
- `actionAccepted` is delivered to the connection whose
  `roomId` and `sessionToken` match.
- `roomSnapshot` is delivered to the connection whose `roomId` and `playerId`
  match; the snapshot itself contains no session token.
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

For an Expo client running on a physical phone on the same network, bind the
development server to all local interfaces:

```bash
npm run dev:server:lan
```

Then enter `ws://<computer-LAN-IP>:8787` in the mobile client. Android Emulator
uses `ws://10.0.2.2:8787`; a same-host simulator can use
`ws://127.0.0.1:8787`. Production mobile builds must use `wss://`.

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

## Authoritative Presence And Connection Ownership

`RoomSocketConnection` now records the server-derived `roomId`, `sessionToken`,
and `playerId`. A successful resume moves that identity to the newest
connection and clears it from the previous one. Ordinary room actions must come
from the currently bound connection; a stale socket cannot use a remembered
token to reclaim the session by sending a gameplay action.

The cleared connection is marked internally as superseded for that session.
It cannot race the current owner with a delayed `resumeSession`; only a newly
registered connection may recover the token again. Superseded-token metadata
stays inside the server core and never enters a room snapshot.

The dev server delegates `close` to the testable
`handleRoomSocketConnectionClosed` core function. Only a connection that still
owns the session can mark it offline. The resulting `presenceChanged` event and
redacted snapshots are routed to the remaining clients; the disconnected
client's own snapshot is reported as undelivered.

Presence does not remove gameplay state or pause response deadlines. Resume
marks the same member and seat online, preserves the session token, and binds
future snapshots to the newest connection. The WebSocket preview renders
`在线`, `离线`, and `已恢复` badges plus the latest safe presence event.

## Heartbeat And Stale Connections

The server core stores `lastSeenAt` on `RoomSocketConnection` and exposes two
pure operations:

- `markRoomSocketConnectionAlive(state, connectionId, now)` records a pong
  using a monotonic timestamp.
- `tickRoomSocketConnectionHealth(state, now, timeoutMs)` expires connections
  at the timeout boundary and returns the affected connection ids plus any safe
  presence snapshots to route.

The development server sends native `ws` ping frames every 10 seconds and uses
a 30 second timeout by default. Both values and the clock are injectable. A
timed-out socket first passes through the authoritative close transition and is
then terminated, making a later `close` callback idempotent.

Heartbeat expiry marks only the latest bound player session offline. It never
removes room membership, seats, hands, dingque choices, scores, settlement
entries, or session tokens. A session resumed on a new connection owns presence
immediately; delayed pong, timeout, or close events from its old socket cannot
override the new online state. Claim and qiang-gang deadlines remain active for
offline players.

Heartbeat timestamps, connection ids, timer handles, and session tokens stay
inside the server process. `roomSnapshot` contains only the redacted player
view, safe player id, event cursor, server time, and visible events.

## Private Response Routing

The adapter still broadcasts a fresh snapshot after each accepted response,
but it builds that snapshot independently for every session. The responder sees
their own `responseByMe`; all other clients see only
`pendingResponderCount`. Serialized snapshots contain no `pendingPlayerIds`,
`passedPlayerIds`, `huClaims`, or private peng/ming-gang candidate data.

While the window is open, no public claim/pass event, winner flag, score change,
or settlement row is emitted. Deadline and all-response resolution publish the
final outcome atomically. This keeps reconnect snapshots and missed-event replay
on the same privacy boundary and gives a future mobile client the same protocol
contract as the Web preview.

## Qiang-Gang Three-Chicken Liability

The WebSocket layer does not calculate chicken counts. `roomService` retains the
external winning tile's physical source and the responsible ba-gang declarer,
then the pure room reducer resolves chicken payments when the round reaches
`ended`.

If a robbed physical `1 bamboo` or `1 dot` changes a winner's same-suit count
from two to three, the terminal snapshot contains one public
`qiangGangSanJiLiability` ledger entry: the declarer pays that winner 48 points.
It replaces the three ordinary `sanJi` payments for only that winner and suit;
other suits and other eligible winners still settle independently.

Before `ended`, per-session snapshots omit the server-only external winning-tile
source, pre-claim counts, and liability candidate. Repeated deadline ticks or
terminal settlement calls reuse the round settlement ID and cannot duplicate
the 48-point entry.

## Authoritative Gang Settlement

The WebSocket server does not calculate gang points. The room reducer records a
server-only gang fact when a ming gang or an gang succeeds, or when a ba gang is
formally committed after its qiang-gang window closes without hu. Each fact
freezes the payers, per-payer amount, logical target, and original physical
tiles at that moment.

At `ended`, the reducer writes one uncapped zero-sum ledger transfer per frozen
payer. The round gang settlement ID and each stable gang ID make repeated
deadline ticks and terminal calls idempotent. Qiang-gang hu leaves the peng in
place and never creates a ba-gang fact or payment.

Snapshots may show safe established summaries and completed transfers. An gang
shows only the player, laizi usage, payer seats, and points; its target tile is
`null`. Internal gang IDs and every physical source-tile array remain inside the
server process.

## Authoritative Cha-Jiao Settlement

When a round ends specifically because the wall is empty, the room reducer
evaluates every player who has not already won. For each listener it freezes the
highest discard-hu score produced by the current rule engine, then creates one
zero-sum transfer from every non-listener to that listener. Each pair is capped
at 64; chicken and gang entries remain separate and uncapped.

The WebSocket layer only routes the resulting redacted snapshot. Before
`ended`, `chaJiao` is `null` and snapshots contain no waiting tiles, candidate
winning tiles, decomposition, internal fact ID, or opponent hand. After
`wallEmpty`, clients may see listening status, patterns, gen count, capped
maximum, payment rows, and updated public balances. Stable round settlement IDs
make repeated terminal calls and deadline ticks idempotent.

Ordinary and seven-pairs candidates are scored together inside the room rule
core. The WebSocket server never receives or broadcasts pair decompositions,
laizi target assignments, dragon alternatives, or stable search signatures.
Clients receive only the selected pattern list, zero non-duplicated gen count
for dragon seven-pairs hands, legal claim actions, and final points.

The preview treats hu as a player decision. It displays the server-provided hu
action alongside `discardTile` for self-draw or `passClaim` for discard hu; it
does not automatically submit a claim or mark the player as won.

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
- Stale sockets being rejected before adapter execution and stale closes not
  overriding a newly resumed connection.
- Superseded sockets being unable to reclaim the same session with a delayed
  `resumeSession`.
- Per-session response snapshots exposing only the current client's choice,
  while response events and winner state remain private until resolution.
- Latest-connection close broadcasting offline member/seat state.
- Injected-clock pong refresh, timeout boundaries, idempotent repeated health
  ticks, and stale old-connection timeouts after session recovery.
- Serialized room snapshots omitting heartbeat metadata, connection ids, and
  session tokens.

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
- A real socket close broadcasts offline presence, and a new transport restores
  the same seat and readiness state with the original session token.

The React WebSocket preview now consumes server-authoritative dingque, draw,
discard, claim, gang, hu, score-ledger, round-end three/four-chicken, and
response-deadline snapshots while the mock table remains available as the
default portfolio-safe path. It displays established gang summaries and the
terminal gang ledger without exposing concealed an-gang tiles. Chicken entries
appear only after `ended`; no in-progress snapshot publishes another player's
concealed chicken count. Wall-empty snapshots also show safe cha-jiao listening
results and transfers without publishing candidate waits or decomposition data.

## Next Milestone

The next rule milestone is a player-facing listening-tile and discard-suggestion
layer built from the same authoritative candidate engine. Persistent room
recovery and deployment configuration for the WebSocket process follow. Offline
kicking, bot takeover, room dissolution, and database persistence are not part
of the current implementation.
