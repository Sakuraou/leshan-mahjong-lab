# Release Notes

## 2026-07-16

- Prepared Android internal-beta candidate `0.2.0` without replacing the Vite
  rule and multiplayer debug client.
- Selected Render for the first single-instance room server and added a
  Singapore-region `render.yaml` Blueprint with Docker, readiness, heartbeat,
  payload, Origin, and shutdown settings.
- Added a hosted-WSS smoke runner that uses four strict mobile transports to
  create/join a room, take seats, ready, start, dingque, draw, discard, pass,
  disconnect, and resume. It also probes untrusted Origin rejection, oversized
  messages, heartbeat health, and an authoritative response deadline without
  printing session credentials. Native stale-socket expiry remains in the local
  production smoke because Render's edge answers proxied control-frame pings.
- Kept the Render Free Blueprint compatible by relying on the platform's
  default shutdown window while retaining the server's own 5-second graceful
  drain.
- Expanded the four-device checklist for voluntary ba gang, immediate versus
  delayed-natural scoring, yao-ji continuation, qiang-gang, repeated gang
  exchange, exchange-created self-draw prompts, touch ordering, reconnect, and
  multi-round cumulative scoring.
- Deployed the server at
  `wss://leshan-mahjong-room-server.onrender.com/ws`; readiness, four-client
  gameplay, actual disconnect/resume, Origin rejection, and the 64 KiB payload
  boundary passed remotely. Expo project `@twilight111/leshan-mahjong` is now
  bound, its preview WSS environment is configured, and signed Android build
  `ac719fc4-730a-4236-8b3c-bdbde3fb5495` finished successfully. The version
  `0.2.0` internal APK is approximately 66.7 MiB and is available from the EAS
  build record through July 30, 2026.
- Observed the `d226682` Render redeploy with a live public WebSocket: the old
  connection closed, readiness returned, and the four-client remote smoke
  passed on the replacement instance.
- Completed the final 2026-07-17 artifact preflight: 211 tests, strict
  type-checking, Vite production build, Expo Doctor 20/20, mobile type-check,
  Android export, local development/production server smokes, and the hosted
  four-client room/recovery smoke all passed.
- Added server-authoritative voluntary ba-gang candidates for each physical
  hand tile and peng, including normal, yao-ji, and delayed-natural zero-point
  payment previews.
- Added immutable zero-point ba-gang facts so later yao-ji exchange cannot
  rewrite gang provenance, payer sets, or scoring history.
- Added `exchangeGangYaoJi` for established ming/an/ba gangs. It supports
  repeated exchanges, preserves the frozen gang fact, grants no extra draw,
  opens no qiang-gang window in this ruleset, and offers rather than forces an
  exchange-created self-draw hu.
- Added owner-only physical `tileId` values, opaque candidate ids, stale-action
  rejection, and redaction coverage for an-gang and opponent hand privacy.
- Added Expo selection/confirmation for continue-gang and yao-ji exchange plus
  touch drag ordering. Initial hands are sorted once; draws/exchanges insert
  only new tiles, and per-round custom order survives session recovery.

## 2026-07-15 - Remote Internal Beta Foundation

- Added environment-backed mobile endpoints for local host, Android emulator,
  LAN, and production WSS, with no production localhost fallback.
- Added Chinese diagnostics for malformed address, insecure production URL,
  TLS, device/server offline, invalid session, and missing room.
- Added a production Node WebSocket runtime with `/ws`, Origin policy,
  liveness/readiness checks, payload limits, safe logs, heartbeat, deadline
  ticks, and graceful shutdown.
- Added Docker packaging, `.env.example`, production smoke coverage, and a
  provider-neutral deployment runbook.
- Added dynamic Expo native configuration and EAS development, LAN internal,
  preview APK, and production profiles. Session tokens remain in SecureStore.
- Added a four-device checklist covering privacy, reconnect, cumulative scores,
  responsibility dealer rules, member finish, and final ranking.

## MVP Snapshot

The current build has a phone-first Expo client that can complete and continue
across server-authoritative rounds. The Vite Web app remains the multi-client rule,
privacy, protocol, and portfolio debugging surface.

### Current MVP Features

- Vite, React, and TypeScript Web prototype
- 108-tile Leshan Mahjong wall generation
- Seeded shuffle for reproducible rounds
- Four-player dealing with dealer 14 tiles and other players 13 tiles
- Current-player draw and discard state transitions
- Dingque-aware discard validation
- MVP rule that prevents actively discarding yao ji
- Explainable laizi-aware standard and seven-pairs hu search with highest-score
  candidate selection
- Self-draw, discard, and rob-kong hu with player-controlled hu confirmation
- Authoritative score ledger for hu, chicken, gang, rob-kong chicken liability,
  and wall-empty cha jiao
- Chinese tile labels, current-player highlight, wall count, discards, action
  hints, and round log in the Web UI
- Seat-limited interaction model: the local player can only operate their own
  seat, while other seats represent future remote players.
- Local simulated room mode backed by pure room reducer functions for joining,
  taking seats, toggling ready, and starting a round before entering the table.
- Redacted client-visible room state is now used by the frontend table in room
  mode, so opponent hands render from hand counts instead of hidden tile arrays.
- Client perspective switching demonstrates the redacted state contract from
  each player's viewpoint while keeping gameplay execution local-only.
- WebSocket protocol documents the implemented authoritative actions,
  broadcasts, errors, reconnect, legal actions, and client-visible payloads.
- Real local WebSocket dev server powered by `ws`, with tested message routing
  through `roomSocketServerCore`, `roomSocketAdapter`, and `roomService`.
- Frontend WebSocket experiment panel that can run a full four-client room
  lifecycle: create room, join, take seats, ready, start round, and display one
  redacted snapshot summary per client.
- Frontend WebSocket recovery demo that stores host/guest `sessionToken` and
  `lastEventId`, simulates a refresh, calls `resumeSession`, and restores
  redacted snapshots.
- WebSocket server core now rebinds a resumed session to the newest connection,
  so private snapshots do not keep routing to a stale socket.
- Main table limited WebSocket preview mode can consume real `roomSnapshot`
  data and show room status, seats, readiness, wall count, and redacted hand
  counts after start.
- Main table WebSocket preview now supports the first server-authoritative
  table action: `chooseMissingSuit`, with service-side validation and redacted
  snapshot broadcasts.
- The default playable table still uses the local mock transport, keeping the
  main portfolio demo stable while the real WebSocket path is demonstrated
  separately.
- Player-selected dingque with heavenly-missing-suit default when the local
  hand naturally lacks exactly one ordinary suit; physical one-bamboo and
  one-dot laizi do not count as ordinary suit tiles.
- Automatic system draw at the start of draw phases.
- Self-drawn tile faces for bamboos, dots, and characters, with the local hand
  sorted by bamboos, dots, then characters.
- Vercel-ready build configuration
- Expo client with authoritative discard/gang candidates, private response
  controls, stale-action protection, 1/2/4/8-second reconnect, safe missed-event
  merging, a compact timeline, and a final settlement screen.
- Server-authoritative multi-round lifecycle with cumulative scores, frozen
  dealer decisions, four-player re-ready, safe per-round score history, and
  member-triggered match finish.
- Local dealer rules: a robbed ba-gang declarer or ordinary multi-hu discarder
  becomes next dealer regardless of earlier hu order; otherwise the first
  formally settled winner becomes dealer, while a no-win wall-empty round keeps
  the current dealer.
- Phone intermission controls driven only by server `legalActions` and
  `actionDescriptors`, plus final cumulative ranking and round deltas.
- GitHub Actions verification for TypeScript, tests, Web build, and mobile
  TypeScript on push and pull request.

### Known Limits

- Gang-shang-hua and gang-shang-pao do not yet have distinct scoring/event
  labels beyond the existing authoritative hu flow.
- The phone UI is functional but still needs real Mahjong artwork, audio,
  vibration, accessibility review, and physical-device layout testing.
- There is no login, persistence, replay system, or production deployment for
  the WebSocket server yet.
- The main room/table mode is still powered by the local mock transport; the
  browser's real WebSocket path remains an experiment/preview. The Expo client
  is the production-oriented single-session gameplay path.
- Room/session state is still in memory; server restarts lose active rooms.
- Screenshot assets are still pending until the first production deployment is
  captured.

### Screenshot Placeholders

| Shot | What it should show |
| --- | --- |
| WebSocket experiment panel | `ws://127.0.0.1:8787`, connected state, lifecycle controls, and experiment logs |
| Four-client redacted snapshots | Host, guest, helper 3, and helper 4 summaries showing own-hand counts and three hidden hands |
| WebSocket full-flow start | Four clients seated and ready, room status `dingque`, latest event `roundStarted` |
| WebSocket session recovery | "模拟刷新后恢复", restored host/guest sessions, resume success badge, missed-event count |
| WebSocket table preview | Main table preview showing true `roomSnapshot` status, 4/4 seats, 4/4 ready, wall count, redacted hand counts, and dingque state |
| WebSocket dingque | Preview client card submits `chooseMissingSuit`, service validates the action, and all clients receive updated redacted snapshots |

### Next Steps

1. Paste the Vercel production URL into the README.
2. Capture the first portfolio screenshots and replace the screenshot
   placeholders.
3. Validate the complete multi-round Expo flow on physical Android and iOS
   devices.
4. Add durable room/session persistence and production monitoring beyond the
   current single-instance `wss://` beta.
5. Add real tile artwork, sound/vibration controls, and accessibility polish.
6. Add a clearer portfolio page or route for case-study presentation.

## 2026-07-15

- Added the authoritative `waiting -> playingRound -> betweenRounds -> finished`
  match lifecycle and cumulative scoring across rounds.
- Added frozen dealer decisions for robbed ba-gang responsibility, ordinary
  one-discard multiple wins, first formal winner, and no-win wall-empty rounds.
- Added four-player re-ready, next-round start, any-member intermission finish,
  final cumulative ranking, and safe per-round score history to the mobile DTO
  and Expo UI.

- Added server-side heavenly missing-suit detection immediately after dealing.
- Added strict mobile terminal DTOs for round end, final scores, and safe
  settlement summaries.
- Added a whitelisted `MobilePublicEvent` stream with stable event ids,
  bounded deduplication, resume merging, and no draw/response/private payloads.
- Added phone timeline and single-round result sections without a next-round
  command.
- Added GitHub Actions checks and refreshed the project documentation to match
  the implemented authoritative round flow.

## 2026-06-30

- Prepared the repository for Vercel deployment.
- Documented the recommended Vercel project settings in the README.
- Added SPA fallback routing through `vercel.json`.
- Added this release note file for portfolio progress tracking.
- Reworked the Web prototype toward a multiplayer table: local-only seat
  control, self-selected dingque, automatic system draws, hidden opponent hands,
  and self-drawn Mahjong tile faces.
- Added a local simulated room mode to the frontend, including room number,
  joining, seat assignment, ready state, and reducer-driven round start.

## 2026-07-01

- Added the server-authoritative room service, pure WebSocket adapter, and
  testable WebSocket server core.
- Added a real local `ws` development server and smoke client.
- Added a frontend WebSocket transport wrapper with tests against a real local
  server.
- Added the WebSocket experiment panel to the React page.
- Expanded the panel into a full room lifecycle demo: four clients join, take
  seats, ready up, start the round, and receive redacted snapshot summaries.
- Added clearer WebSocket experiment step states for connection, create, join,
  seat, ready, start, failure, and duplicate-create feedback.
- Added session recovery in the WebSocket experiment panel using
  `sessionToken`, `lastEventId`, `localStorage`, and `resumeSession`.
- Updated server-core routing so a resumed session is rebound to the newest
  connection instead of a stale socket.
- Added a main-table limited WebSocket preview mode that consumes real
  `roomSnapshot` values without replacing the default mock table.
- Added WebSocket-backed player-selected dingque in the table preview path.
- Drafted the WebSocket `drawTile` and `discardTile` protocol, including
  payloads, validation rules, redacted broadcasts, legal-action changes, and
  error codes.
- Kept the mock room/table flow as the default main experience.
