# Mobile App Plan

The final product is a phone-first Leshan Mahjong App. The Vite Web client stays
in the repository as a rule, protocol, privacy, and portfolio validation tool;
it is not the final gameplay shell.

## First Mobile Milestone

The first Expo/React Native client lives in `apps/mobile`. It currently covers:

- Configuring a WebSocket server address, room id, and display name.
- Creating or joining a real server-authoritative room.
- Rendering four seats, presence, readiness, scores, and local-seat ownership.
- Taking a seat, toggling ready, and starting a full room only when those
  actions appear in the server-provided `legalActions` list.
- Submitting dingque through the same authoritative WebSocket action.
- Rendering a read-only table with the local hand, opponent concealed counts,
  public melds, discards, current player, wall count, and score.
- Saving a small versioned session record with Expo SecureStore.
- Closing the socket on background and resuming with `sessionToken` plus
  `lastEventId` after the App becomes active again.

Draw, discard, peng, gang, and hu buttons are intentionally not enabled in the
first mobile milestone. The client may display those server legal actions, but
the Web preview remains the gameplay integration surface until the phone table
interaction is designed and tested.

## Architecture

```text
Authoritative Node WebSocket server
  -> per-session roomSnapshot
  -> ClientVisibleRoomState + legalActions
  -> shared client-core view model / transport contract
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
| `src/webSocketRoomTransport.ts` | Cross-platform WebSocket message delivery and action correlation |
| `packages/client-core` | Mobile-safe view projection, labels, sorting, shared transport/session interfaces |
| `src/App.tsx` | Browser debug and portfolio surface |
| `apps/mobile` | Phone layout, SecureStore, AppState recovery, user commands |

The mobile app must not import `RoomState`, `RoundState`, `roomService`,
`roomSocketAdapter`, or `localRoomTransport` into presentation components. Its
business input is the redacted `ClientVisibleRoomState`. The first shared
package still references the existing public TypeScript DTO definitions by
type-only imports; extracting a fully standalone protocol package with runtime
message validation is a later hardening step.

## Privacy Contract

The mobile view model copies a fixed safe field set. It does not retain raw
WebSocket messages, session tokens, shuffle seeds, wall order, opponent hands,
private claim arrays, or concealed an-gang tiles.

- Local seat: `hand` is visible and sorted for display.
- Other seats: `hand` remains `null`; only `handCount` is rendered as tile backs.
- Response windows: only `pendingResponderCount`, `hasRespondedByMe`, and
  `responseByMe` cross the view-model boundary.
- Session token: kept in the transport closure and Expo SecureStore, never
  rendered in the UI.
- Commands: seat, ready, start, and dingque buttons are gated by server
  `legalActions`; the server still performs final validation.

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

1. Validate the current shell in Expo Go on one Android phone and one iPhone.
2. Replace the read-only hand with touch selection and discard confirmation,
   still gated by `legalActions`.
3. Add foreground reconnect backoff and network-change handling.
4. Add vibration/audio settings and accessibility labels for real tile artwork.
5. Move the in-memory server to a `wss://` deployment with durable room/session
   storage.
6. Produce internal Android and iOS beta builds with EAS Build.

The Web client remains useful throughout this sequence because it can expose
debug timelines and multi-client snapshots that should not appear in the
consumer mobile UI.
