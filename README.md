# Leshan Mahjong Lab

A phone-first Leshan eight-chicken Mahjong project with an Expo mobile client,
a tested TypeScript rule engine, and a Vite browser table retained as the
multiplayer, privacy, and portfolio validation surface.

## Online Demo

Deployment is prepared for Vercel. The production URL should be pasted here
after the GitHub repository is imported in Vercel.

- Live URL: `TBD - paste the Vercel production URL here`
- Deployment status: Vercel-ready, production URL pending
- Repository: `https://github.com/Sakuraou/leshan-mahjong-lab`
- Case study: [docs/case-study.md](docs/case-study.md)
- Release notes: [docs/release-notes.md](docs/release-notes.md)
- Multiplayer design: [docs/multiplayer-design.md](docs/multiplayer-design.md)
- Real-time protocol draft: [docs/realtime-protocol.md](docs/realtime-protocol.md)
- Room service interface: [docs/room-service.md](docs/room-service.md)
- Socket adapter interface: [docs/socket-adapter.md](docs/socket-adapter.md)
- WebSocket server core: [docs/websocket-server.md](docs/websocket-server.md)
- Mobile App plan: [docs/mobile-app-plan.md](docs/mobile-app-plan.md)

## Deploy To Vercel

The project is a Vite single-page app and is ready for Vercel deployment.

Recommended Vercel settings:

| Setting | Value |
| --- | --- |
| Framework Preset | `Vite` |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Root Directory | `.` |
| Node.js Version | `24.x` |

Import steps:

1. Open [Vercel New Project](https://vercel.com/new).
2. Choose `Sakuraou/leshan-mahjong-lab` from GitHub.
3. Keep the detected framework as `Vite`.
4. Confirm the settings above.
5. Click Deploy.
6. After deployment, replace the `Live URL` placeholder in this README with
   the Vercel production URL.

The repo includes `vercel.json` so direct SPA routes can rewrite to
`/index.html`.

## Why This Project

This is not a generic Mahjong clone. Leshan eight-chicken Mahjong has local
rules that are easy to describe at the table but hard to encode correctly:

- `1 bamboo` and `1 dot` are yao ji / laizi.
- Laizi can complete pairs, triplets, and sequences.
- Discard ping hu is not allowed because it is only 1 point.
- Self-draw ping hu is allowed because self-draw doubles to 2 points.
- Wu ji, qing yi se, chicken payments, gang points, dingque, and cha jiao all
  affect the rule model.

The project is designed as a portfolio piece: it shows product framing, rule
modeling, tested engineering, frontend interaction, multiplayer room planning,
and AI-assisted development.

## Current Features

- Seeded four-player round setup
- 108-tile wall generation and reproducible shuffle
- Dealer receives 14 tiles, other players receive 13
- Current-player draw and discard flow
- Dingque-aware discard validation
- No-active-yao-ji-discard MVP rule
- Laizi-aware standard hu decomposition for `4 melds + 1 pair`
- Self-draw and discard hu checks with the local minimum-score rule
- Basic score helpers for ping hu, wu ji, qing yi se, gen, and caps
- Frontend multiplayer-table prototype with seat-limited player control,
  self-selected dingque, automatic system draws, hidden opponent hands, Chinese
  tile faces, current-player highlight, wall count, discard areas, action hints,
  and round log
- Local simulated room mode backed by the room reducer, including room number,
  player joining, seat assignment, ready state, and round start before entering
  the table
- Redacted client-visible room state: the local player sees their own hand,
  while other players expose only hand counts, discards, and public state to the
  table UI
- Client perspective switcher for demonstrating that each player receives a
  different redacted view while the local execution layer remains simulated
- Real multiplayer room design covering room creation, joining, seat assignment,
  readiness, dingque, server dealing, turn actions, reconnect, and
  server-authoritative validation
- First WebSocket protocol draft for the next server-authoritative room step,
  including client actions, server broadcasts, error codes, reconnect recovery,
  legal actions, and client-visible state payloads
- Pure TypeScript server-authoritative room service with session tokens,
  `lastEventId`, reconnect recovery, and redacted client views before adding
  the WebSocket adapter
- Pure-function WebSocket adapter that maps protocol-like messages to
  `roomService` and returns `ServerMessage`-style accepted, rejected, and
  redacted snapshot messages without starting a real server
- Frontend local mock transport that turns room UI actions into
  `RoomSocketClientMessage` objects, feeds them through `roomSocketAdapter`, and
  renders each simulated client from its own server-shaped redacted snapshot
- Testable WebSocket server core that registers connections, parses raw JSON,
  calls `roomSocketAdapter`, routes messages by `recipientSessionToken`, and
  records undelivered session-targeted messages before a real network server is
  started
- Real local WebSocket dev server powered by `ws`, plus a smoke client that
  verifies `createRoom` and `joinRoom` over actual WebSocket connections
- Frontend WebSocket transport wrapper that can connect to
  `ws://127.0.0.1:8787`, send room lifecycle and dingque messages, and maintain
  each session's latest redacted snapshot without replacing the current mock UI
  flow
- Real WebSocket experiment panel that can run a full four-client room flow:
  host/guest/helper clients join, take seats, ready up, start the round, and
  display per-client redacted snapshot summaries while the mock table remains
  the default main experience
- Session recovery demo in the WebSocket experiment panel: host/guest
  `sessionToken` and `lastEventId` are saved to `localStorage`, then
  `resumeSession` rebuilds redacted snapshots after a simulated refresh
- Limited WebSocket table preview mode in the main table: it consumes real
  `roomSnapshot` data to show room status, seats, readiness, wall count, and
  redacted hand counts after start while keeping the mock table as the default
- WebSocket-backed dingque path in the table preview: players can submit
  `chooseMissingSuit` after the real server starts the round, and the server
  validates seat ownership, round state, and duplicate submissions before
  broadcasting redacted snapshots
- Expo/React Native mobile App workspace with server configuration,
  create/join, seat, ready, start, dingque, a redacted read-only table,
  SecureStore session persistence, and AppState reconnect recovery
- Shared client-core package for mobile-safe room view models, tile display
  helpers, transport contracts, and authoritative `legalActions` consumption

## Screenshots

Screenshots will be added after the first production deployment.

Planned portfolio shots:

| Shot | Status | What it should show |
| --- | --- | --- |
| Room mode | Pending | Local simulated room number, four seats, join/take-seat/ready/start controls |
| Main table | Pending | Four players, local seat, hidden opponent hands, highlighted current player, and wall count |
| Dingque flow | Pending | Local player chooses bamboos/dots/characters instead of receiving a random missing suit |
| Draw/discard flow | Pending | System auto-draws; local player only chooses a discard on their own turn |
| Tile visuals | Pending | Self-drawn bamboo/dot/character tile faces sorted by suit |
| Illegal action feedback | Pending | Chinese reason text for dingque or yao ji discard rejection |
| Hu-ready prompt | Pending | Visible hu result, score, and detected patterns |
| WebSocket experiment | Pending | Real `ws://127.0.0.1:8787` connection status and create/join/seat/ready/start controls |
| Four-client snapshots | Pending | Host, guest, and helper clients showing per-client redacted snapshots and hidden opponent hands |
| WebSocket full round start | Pending | Full flow after all four clients are seated, ready, and the room reaches `dingque` |
| WebSocket session recovery | Pending | Simulated refresh, restored host/guest sessions, resumed redacted snapshots, and missed-event count |
| WebSocket table preview | Pending | Main table preview consuming real `roomSnapshot` with redacted hand counts |
| WebSocket dingque | Pending | Preview client cards submit server-authoritative `chooseMissingSuit` and receive updated redacted snapshots |
| Portfolio context | Pending | README/case-study view showing the multi-agent workflow and tested rule engine |

## Run Locally

```bash
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:5173
```

## Scripts

```bash
npm test
npm run build
npm run dev
npm run mobile
npm run mobile:typecheck
npm run mobile:export
npm run dev:server
npm run dev:server:lan
npm run smoke:server
```

## Tech Stack

- Vite
- React
- Expo / React Native
- TypeScript
- Node test runner
- Pure TypeScript game engine under `src/game`
- GitHub for project history and portfolio presentation
- Planned deployment: Vercel

## Architecture

The game logic is framework-independent. The React app imports pure TypeScript
functions from `src/game`, which keeps rule tests fast and makes future mobile
reuse possible.

```text
src/
  App.tsx              Browser table prototype
  localRoomTransport.ts Frontend mock transport over the socket adapter
  webSocketRoomTransport.ts Frontend WebSocket transport wrapper
  styles.css           Prototype UI styling
  game/
    tiles.ts        Tile model, wall generation, yao ji detection
    hu.ts           Laizi-aware standard hu decomposition
    rules.ts        Dingque, score helpers, chicken/gang/wu ji helpers
    room.ts         Local room reducer and redacted client-visible room state
    roomService.ts  Server-authoritative room session service
    roomSocketAdapter.ts Pure WebSocket-shaped message adapter
    round.ts        Seeded shuffle, dealing, draw/discard state transitions
    win.ts          Self-draw and discard hu checks
  server/
    roomSocketServerCore.ts Testable WebSocket server core without a live port
apps/
  mobile/               Expo phone client and SecureStore/AppState integration
packages/
  client-core/          Mobile-safe view model and shared transport contracts
tests/
  game/             Rule, round, hu, and win tests
  docs/
    rules.md          Source-of-truth local rule document
    roadmap.md        Development plan
    agent-workflow.md AI collaboration log
    case-study.md     Portfolio write-up
    multiplayer-design.md Real-time room product and technical plan
    realtime-protocol.md WebSocket room protocol and server interface draft
    room-service.md Server-authoritative room service interface
    socket-adapter.md Pure socket adapter interface and frontend integration plan
    websocket-server.md Testable server core and real WebSocket wrapper plan
```

The current browser room flow is intentionally shaped like a future networked
client. It does not call the room reducer directly. Instead, the UI sends
server-like messages into `localRoomTransport`, which wraps
`roomSocketAdapter`, stores the returned adapter state, and keeps a redacted
snapshot per simulated session. Replacing this local transport with a real
WebSocket transport should mainly change delivery and connection management,
not the room lifecycle rules.

The server-side core and local `ws` dev wrapper are also in place.
`src/server/roomSocketServerCore.ts` keeps connection registration, JSON
parsing, adapter calls, session routing, reconnect binding, and undelivered
messages testable without tying the room logic to a specific network runtime.

The WebSocket experiment panel is intentionally separate from the main table.
It uses the real local `ws` dev server to prove the full room lifecycle and
redacted snapshot delivery. It also demonstrates `sessionToken` + `lastEventId`
recovery by saving host/guest sessions locally, reconnecting after a simulated
refresh, and calling `resumeSession` for fresh redacted snapshots. The default
playable table still uses the local mock transport for a stable portfolio demo.

The first mobile client is now available under `apps/mobile`. It uses the same
real WebSocket transport and per-session redacted snapshots as the browser
experiment, while keeping session tokens in Expo SecureStore and closing and
resuming the socket across AppState transitions. See
[docs/mobile-app-plan.md](docs/mobile-app-plan.md) for run addresses, privacy
boundaries, and the Android/iOS roadmap.

The main table now has a limited "真实 WebSocket 桌面预览" mode that consumes the
experiment panel's latest real `roomSnapshot` data and renders room, seat,
ready, wall, and redacted hand-count summaries without enabling real draw or
discard actions yet. The preview now also sends the first real
server-authoritative table action, `chooseMissingSuit`; real draw and discard
remain planned rather than implemented.

## AI-Assisted Workflow

This project intentionally documents the vibe-coding process. Different agent
roles were used to split work into reviewable concerns:

| Agent Role | Responsibility | Output |
| --- | --- | --- |
| Product Agent | MVP and portfolio positioning | Scope, README language, resume pitch |
| Rule Agent | Local rule clarification | Rule questions, edge cases, docs |
| Implementation Agent | TypeScript game-core design | Pure functions, module boundaries |
| Test Agent | Rule examples and regressions | Node test cases |
| Review Agent | Quality and risk checks | Missing tests, UX improvements |

## Resume Pitch

**Leshan Mahjong Lab | Local Mahjong Multiplayer Table Prototype**

- Built a frontend multiplayer-table prototype for Leshan eight-chicken Mahjong,
  supporting a local simulated room flow, seeded rounds, seat-limited control,
  player-selected dingque, system auto-draw, draw/discard flow, rule-aware
  validation, and basic hu checks.
- Modeled local Mahjong rules as tested TypeScript modules, separating tile
  modeling, laizi-aware hand decomposition, scoring helpers, round state, and UI.
- Designed the next real-time room architecture, including room creation,
  joining, seat ownership, readiness, reconnect, redacted state, and
  server-authoritative validation.
- Drafted the WebSocket protocol and service interface for the next milestone:
  a server-authoritative real-time room that sends each client only its own
  legal, redacted state.
- Implemented and documented a pure TypeScript room service as the future
  WebSocket adapter's authoritative state layer.
- Added a tested pure-function socket adapter, preparing the frontend to consume
  server-shaped room snapshots through either a local mock transport or a real
  WebSocket server.
- Connected the room UI to a local mock transport, proving the frontend can
  consume server-shaped snapshots before a real WebSocket server exists.
- Added a tested WebSocket server core that is ready to be wrapped by a local
  Node `ws` development server.
- Added a real WebSocket experiment panel that demonstrates the full room
  lifecycle across four clients without replacing the default mock table.
- Added a session recovery demo using `sessionToken`, `lastEventId`,
  `localStorage`, and server-side rebinding to the latest connection.
- Added a main-table WebSocket preview mode that reads real room snapshots while
  leaving the mock table as the default gameplay surface.
- Added the first WebSocket-backed table action: server-authoritative dingque
  submission from the preview path, with redacted snapshot updates for every
  connected client.
- Used a multi-agent AI-assisted workflow to split product planning, rule
  modeling, implementation, test-case design, and review.
- Prepared the repository as a portfolio case study with rule documentation,
  roadmap, development log, and deployment-ready Vite build.
