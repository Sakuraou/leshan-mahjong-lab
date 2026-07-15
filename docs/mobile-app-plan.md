# Mobile App Plan

The final product is a phone-first Leshan Mahjong App. The Vite Web client stays
in the repository as a rule, protocol, privacy, and portfolio validation tool;
it is not the final gameplay shell.

## First Complete Single-Round Mobile Milestone

The first Expo/React Native client lives in `apps/mobile`. It currently covers:

- Configuring a WebSocket server address, room id, and display name.
- Creating or joining a real server-authoritative room.
- Rendering four seats, presence, readiness, scores, and local-seat ownership.
- Taking a seat, toggling ready, and starting a full room only when those
  actions appear in the server-provided `legalActions` list.
- Submitting dingque through the same authoritative WebSocket action.
- Accepting a server-selected heavenly missing suit immediately after dealing
  when exactly one ordinary suit is absent; physical one-bamboo and one-dot do
  not count toward ordinary suit presence.
- Rendering a table with the local hand, opponent concealed counts,
  public melds, discards, current player, wall count, and score.
- Automatically requesting normal and gang-replacement draws when the server
  exposes a stable `drawTile` or `drawGangTile` action descriptor. The
  descriptor id is persisted after an accepted request so App recovery does
  not send the same draw twice.
- Letting the local player select only server-provided discard candidates and
  confirm the discard. Dingque priority and the active yaoji restriction are
  never recalculated by React Native.
- Showing server-provided an-gang and ba-gang candidates, with target selection
  and a second confirmation before submission. A declared ba-gang enters the
  qiang-gang response view; after an uncontested commit, the App automatically
  requests exactly one gang-replacement draw.
- Showing private pass, hu, peng, and ming-gang actions during a response
  window. Hu remains an explicit player decision; the App never auto-hu.
- Echoing the current `actionId` as `expectedActionId` on every turn, response,
  and active-gang command. The mobile transport refuses an old local selection,
  and the authoritative service rejects a delayed command with `staleAction`.
- Showing only the window deadline summary, remaining responder count, and the
  local player's submitted choice before the server atomically closes it.
- Saving a small versioned session record with Expo SecureStore.
- Driving recovery through explicit `offline`, `waiting`, `reconnecting`,
  `resuming`, `online`, and `failed` states. Unexpected closes retry after
  1, 2, 4, and 8 seconds; foreground activation, network recovery, and the
  manual command retry immediately.
- Closing the socket on background and resuming with `sessionToken` plus
  `lastEventId` after the App becomes active again. Only the newest connection
  generation may attach its snapshot or update the UI.
- Marking an interrupted discard, hu, peng, or gang request as "result pending
  confirmation" instead of replaying it. Recovery clears old selections and
  rebuilds controls from the fresh server `actionId`.
- Parsing only whitelisted public events, assigning stable event ids from the
  authoritative cursor, and merging/deduplicating a maximum of 100 timeline
  items across reconnects.
- Showing the terminal reason, four authoritative final scores, and each hu,
  chicken, gang, rob-kong liability, and cha-jiao transfer. The App does not
  recalculate settlement totals.

The Vite Web preview remains the multi-client debugging surface. The phone App
now owns a single authenticated session and can complete one real round from
room creation through terminal settlement without storing debug message
history or other players' snapshots.

## Architecture

```text
Authoritative Node WebSocket server
  -> per-session roomSnapshot
  -> full server redacted room snapshot
  -> strict client-core parser and reduced mobile DTO
  -> legalActions + parameterized actionDescriptors
  -> bounded MobilePublicEvent timeline + safe settlement summaries
  -> single-session MobileRoomTransport
  -> injectable reconnect coordinator
  -> Expo mobile presentation

Vite Web debug client
  -> same transport implementation and snapshots
  -> mock table remains available for regression work
```

Ownership boundaries:

| Area | Responsibility |
| --- | --- |
| `src/game` | Rules, hidden hands, wall, response choices, settlement, authoritative transitions |
| `src/server` | WebSocket connections, heartbeat, session routing, deadline ticks |
| `src/webSocketRoomTransport.ts` | Multi-client browser experiment transport and debug history |
| `packages/client-core` | Standalone client DTOs, strict parser, view model, single-session transport, reconnect coordinator, labels, sorting |
| `src/App.tsx` | Browser debug and portfolio surface |
| `apps/mobile` | Phone layout, SecureStore, AppState recovery, user commands |

The mobile app must not import `RoomState`, `RoundState`, `roomService`,
`roomSocketAdapter`, or `localRoomTransport` into presentation components. Its
business input is the redacted `ClientVisibleRoomState`. The first shared
package has no imports from `src/game`, `RoomState`, `roomService`, or the socket
adapter. Server internals may structurally produce the wire DTO, but the mobile
runtime accepts it only after exact-key parsing and a fresh safe projection.

## Privacy Contract

The mobile parser and view model copy a fixed safe field set. They do not retain
raw WebSocket messages, multi-player snapshot maps, shuffle seeds, wall order,
opponent hands, private claim arrays, or concealed an-gang tiles.

- Local seat: `hand` is visible and sorted for display.
- Other seats: `hand` remains `null`; only `handCount` is rendered as tile backs.
- Response windows: only `pendingResponderCount`, `hasRespondedByMe`, and
  `responseByMe` cross the view-model boundary.
- Session token: kept in the transport closure and Expo SecureStore, never
  rendered in the UI.
- Commands: every visible button is gated by server `legalActions`.
- Discard: selectable tiles come only from the server's `discardTile`
  descriptor; the server still performs final validation.
- Active gangs: target tiles come only from the session-scoped `claimAnGang`
  and `claimBaGang` descriptors. An-gang candidates and tiles are never copied
  into another session's view.
- Recovery: transient discard/gang selections are cleared, the latest snapshot
  rebuilds the action area, and the persisted completed auto-draw id prevents
  the same replacement draw from being submitted twice.
- In-flight commands: ordinary user commands are never queued for replay. An
  interrupted command remains visibly unconfirmed until a fresh authoritative
  snapshot arrives. Only automatic normal/gang draws may be retried, and only
  while the same descriptor remains legal and its id is not recorded complete.
- Connection ownership: both authenticated and not-yet-authenticated sockets
  carry a local generation. Late callbacks from superseded generations are
  closed and ignored; the server independently enforces latest binding.
- Missed events: the parser converts only joined/ready/dingque/discard/public
  meld/hu/presence/round-end events into `MobilePublicEvent`. Draw events,
  unresolved responses, concealed an-gang faces, wall/seed data, decomposition
  candidates, and internal fact ids are never retained. Events are sorted,
  deduplicated by `eventId`, and bounded to the newest 100 items.
- Terminal state: `roundEnd`, current/final scores, and minimal settlement
  summaries are safe DTOs. Internal batch/window/fact identifiers and physical
  source arrays are not copied into the phone state.
- Server messages: malformed envelopes, unknown extra fields, hidden wall/seed
  fields, and non-null opponent hands are rejected before state changes.

## Run Locally

Install all Web and mobile workspace dependencies from the repository root:

```bash
npm install
```

Start the WebSocket server for a browser, iOS Simulator, or same-host test:

```bash
npm run dev:server
```

Start the Expo client:

```bash
npm run mobile
```

Address rules:

- Same computer / iOS Simulator: `ws://127.0.0.1:8787`
- Android Emulator: `ws://10.0.2.2:8787`
- Physical phone: run `npm run dev:server:lan`, then use
  `ws://<computer-LAN-IP>:8787`; Windows Firewall must allow the Node process.
- Production: use `wss://`; plain `ws://` is development-only.

Quality commands:

```bash
npm run check
npm run mobile:typecheck
npm run mobile:export
npm run smoke:server
```

## Android And iOS Roadmap

1. Confirm dealer rotation, cumulative score, round-count, and next-round ready
   rules, then add a multi-round room loop.
2. Validate the complete single-round flow in Expo Go on one Android phone and
   one iPhone.
3. Add vibration/audio settings and accessibility labels for real tile artwork.
4. Move the in-memory server to a `wss://` deployment with durable room/session
   storage.
5. Produce internal Android and iOS beta builds with EAS Build.

The Web client remains useful throughout this sequence because it can expose
debug timelines and multi-client snapshots that should not appear in the
consumer mobile UI.
