# Roadmap

Product direction: the final deliverable is a mobile Mahjong App. The current
Vite/React Web client is the rule, multiplayer-protocol, privacy, and portfolio
validation surface; mobile clients should reuse the same authoritative
snapshots and `legalActions` instead of reimplementing game rules.

## Phase 0: Repository Setup

- [x] Create portfolio-oriented README
- [x] Record rule assumptions and pending questions
- [x] Record multi-agent workflow
- [x] Initialize Git and connect to GitHub
- [x] Add strict TypeScript `typecheck` and combined `check` quality gates

## Phase 1: Frontend Multiplayer-Table Prototype

Goal: one person can open the app and experience the intended multiplayer table
flow before the real-time backend exists.

- [x] Create Vite + React app structure
- [x] Build first Tile, Hand, TableBoard, ActionPanel, and log UI
- [x] Render four seats, player hand, discard areas, and remaining tile count
- [x] Support a seeded mock round
- [x] Support draw and discard actions
- [x] Limit interaction to the local player's seat
- [x] Hide other players' hands as future remote seats
- [x] Let the local player choose dingque
- [x] Auto-draw tiles through the system instead of a manual draw button
- [x] Render self-drawn bamboo, dot, and character tile faces
- Add clearer peng/gang/hu prompts
- Add a fuller replay timeline

## Phase 2: Rule Engine

Goal: move from visual demo to real rule logic.

- [x] Define tile and hand data structures
- [x] Implement eight-chicken yao ji / laizi recognition
- [x] Implement dingque discard constraints
- [x] Implement no-active-yao-ji-discard MVP rule
- [x] Implement wu ji and chicken settlement helpers
- [x] Implement gang point table
- [x] Implement basic score multiplier and cap helper
- [x] Add laizi-aware standard hand decomposition
- [x] Add focused tests for laizi sequence, pair, triplet, and failed hands
- [x] Return an explainable standard-hand decomposition with each laizi's
  original tile and resolved target
- [x] Support self-draw and discard hu checks after peng or gang melds through
  `fixedMeldCount`
- [x] Detect da dui, dan diao, qing yi se, wu ji, and resolved gen count from
  the explainable decomposition plus exposed melds
- [x] Select the highest-scoring decomposition when one laizi hand has multiple
  valid resolutions
- [x] Bound multi-decomposition search to 128 unique candidates and 20,000
  expanded states per hu check
- [x] Add explainable seven-pairs decomposition with pair-level laizi source /
  target resolution and bounded stable candidate search
- [x] Score mutually exclusive xiao qi dui, long qi dui, shuang long qi dui,
  and san long qi dui tiers without double-counting their included roots
- [x] Compare ordinary and seven-pairs candidates for live hu, legal actions,
  events, and wall-empty cha-jiao maximum score
- [x] Keep hu player-confirmed: publish claim plus continue/pass actions without
  automatically changing `hasWon`
- [x] Build wall shuffle and dealing logic
- [x] Implement basic draw and discard state transitions
- [x] Implement basic win detection
- Add broader rule tests

## Phase 3: Explainable Training

Goal: make the product useful instead of only playable.

- Explain why a hand can win
- Show listening tiles
- Suggest discards with simple reasoning
- Add round timeline and replay
- Add debug panel for state inspection

## Phase 4: Real-Time Room Design And Backend

Goal: connect the frontend table to a real multiplayer room while keeping the
server authoritative.

- [x] Document room creation and joining flow
- [x] Document seat assignment and readiness flow
- [x] Document player dingque and system dealing flow
- [x] Document turn actions and server validation
- [x] Document reconnect behavior and redacted client state
- [x] Define shared room event and state types
- [x] Build an in-memory room reducer with tests
- [x] Add room create/join UI
- [x] Render the table from redacted client-visible room state
- [x] Add client perspective switching to demonstrate per-player visibility
- [x] Draft the WebSocket protocol, reconnect flow, error codes, and server
  interface contract
- [x] Build the first server-authoritative in-memory room service
- [x] Document the room service API and its WebSocket adapter boundary
- [x] Build a pure-function WebSocket adapter around `roomService`
- [x] Document the socket adapter message flow and frontend integration plan
- [x] Connect the frontend room flow to a local mock transport backed by
  `roomSocketAdapter`
- [x] Render room mode from server-shaped redacted snapshots per simulated
  client session
- [x] Build a testable WebSocket server core for connection registration, JSON
  parsing, adapter calls, session-token routing, and undelivered messages
- [x] Document the server core and real Node WebSocket wrapper plan
- [x] Choose lightweight Node `ws` as the first local WebSocket runtime wrapper
- [x] Start a real local WebSocket dev server around the tested server core
- [x] Add a smoke client/test for `createRoom` and `joinRoom` over real
  WebSocket connections
- [x] Add a frontend WebSocket transport wrapper for room lifecycle messages
  while keeping mock transport as the default UI path
- [x] Move shuffle seed generation behind the server adapter and remove seed,
  wall order, opponent hands, and concealed gang details from client snapshots
- [x] Replace predictable session counters with secure random session tokens and
  injectable factories for deterministic tests
- [x] Replace hand-count phase inference with an explicit authoritative room
  phase machine for dingque, draw, discard, claim, gang draw, and round end
- [x] Publish the safe current phase and per-session `legalActions` in each
  redacted client snapshot
- [x] Implement provisional ba-gang upgrades, the authoritative `qiangGang`
  response phase, multi-winner rob-kong hu, rollback to the original peng, and
  gang replacement draw after all players pass
- [x] Add the first server-authoritative zero-sum hu score ledger for self-draw,
  discard multi-win, and qiang-gang multi-win payments, with public redacted
  balances and stable batch ordering
- [x] Add server-owned response deadlines, deterministic clock injection,
  idempotent timeout settlement, automatic dev-server ticks, and synchronized
  client countdown snapshots
- [x] Add server-authoritative online/offline presence, latest-connection-only
  session binding, reconnect broadcasts, and idempotent presence events
- [x] Add native WebSocket ping/pong health checks, injectable-clock stale
  connection expiry, latest-connection race protection, and safe status UI
- [x] Add idempotent server-authoritative three/four-chicken settlement from
  original physical tile sources, including already-won payers and public
  round-end ledger summaries
- [x] Add robbed-yao-ji three-chicken liability: preserve external winning-tile
  source, replace same-suit ordinary san-ji with one 48-point declarer payment,
  support multi-win, and keep candidates hidden until round end
- [x] Add server-authoritative gang settlement facts with establishment-time
  payer freezing, physical laizi-source scoring, qiang-gang rollback, terminal
  zero-sum ledger transfers, idempotent settlement, and concealed an-gang
  redaction
- [x] Add server-authoritative wall-empty cha-jiao facts: evaluate each active
  player's highest discard-hu result, settle every non-listener/listener pair
  with a 64-point cap, exclude prior winners, and hide waits/decompositions
  until the terminal snapshot
- [x] Make discard and qiang-gang responses private per session, expose only
  own response plus pending count, and atomically publish winners, melds,
  ledgers, and events when the window resolves
- [x] Accept peng/ming-gang candidates privately so `legalActions` cannot leak
  another player's hu opportunity
- [x] Prevent superseded WebSocket connections from reclaiming a session with a
  delayed resume message
- [x] Wrap `roomSocketAdapter` with a local Node `ws` development server,
  heartbeat, connection health checks, and deadline ticking
- [x] Connect the Expo table UI to real per-session WebSocket room snapshots
- [x] Add reconnect with a local session token
- [x] Add a server-authoritative multi-round match lifecycle with cumulative
  scores and safe completed-round history
- [x] Freeze next dealer from formally settled outcomes: robbed ba-gang
  declarer, ordinary multi-hu discarder, first winner, or no-win wall-empty
  dealer keep
- [x] Add four-player re-ready, next-round start, and any-member intermission
  match finish actions with stale-action protection

## Phase 5: Mobile App Client

Goal: turn the validated rule engine and realtime protocol into the actual
phone-first product.

- [x] Choose Expo/React Native + TypeScript as the phone shell
- [x] Add `apps/mobile` without replacing the Vite Web debug client
- [x] Add a shared `client-core` view model, transport contract, tile labels,
  and session-storage contract
- [x] Build the first phone room shell for server config, create/join, seats,
  ready, start, dingque, and a redacted table foundation
- [x] Gate lobby and dingque commands with authoritative `legalActions`
- [x] Save session recovery data with Expo SecureStore and resume after an
  AppState background/foreground transition
- [x] Add safe-area handling and stable phone touch targets
- [x] Extract a standalone client-safe contract with strict runtime snapshot
  parsing and no imports from the server rule/service modules
- [x] Replace the Web experiment transport in mobile with a single-session
  transport that stores one token and one redacted snapshot
- [x] Add stable action descriptors and server-authoritative discard candidates
- [x] Automatically request normal and gang-replacement draws once, then
  support touch selection and server-authoritative discard confirmation
- [x] Add private pass, hu, peng, and ming-gang response controls; hu remains a
  player decision
- [x] Add `expectedActionId` to production phone turn/response commands and
  reject delayed actions as `staleAction` in the authoritative service
- [x] Add server-provided an-gang/ba-gang candidate selection, confirmation,
  qiang-gang waiting, and one-shot automatic gang replacement draws
- [x] Implement the confirmed voluntary continue-gang candidates by exposed meld,
  including normal scoring for yao-ji continuations, immediate natural-draw
  payment eligibility, and zero-point delayed natural-tile ba gang
- [x] Implement repeated yao-ji exchange for established ming/an/ba gangs without
  changing frozen ledger facts, granting a replacement draw, or opening the
  current ruleset's qiang-gang window; offer exchange-created hu as self-draw
- [x] Clear transient turn selections on recovery while preserving the last
  completed automatic draw id
- [x] Add an injectable mobile reconnect coordinator with explicit offline,
  waiting, reconnecting, resuming, online, and failed states plus 1/2/4/8-second
  backoff
- [x] Retry immediately on foreground/network recovery, isolate superseded
  connection callbacks, and provide a manual reconnect command with countdown
  status
- [x] Mark interrupted user actions as pending confirmation without replay,
  then rebuild controls from the latest authoritative snapshot and action id
- [x] Verify real WebSocket session/seat recovery, one-shot automatic draws,
  safe missed-event handling, and deterministic reconnect timing
- [x] Auto-select heavenly missing suits after dealing while excluding physical
  one-bamboo and one-dot laizi from ordinary suit counts
- [x] Add strict terminal DTOs for round end, final scores, and safe hu/chicken/
  gang/cha-jiao settlement summaries
- [x] Add a whitelisted public event contract, event-id deduplication, bounded
  resume merging, and a compact phone timeline
- [x] Add the first complete single-round result screen without inventing a
  next-round rule
- [x] Add the multi-round intermission and match result flow: per-round delta,
  cumulative score, next dealer reason, four ready states, final ranking, and
  round history
- [x] Add GitHub Actions checks for TypeScript, tests, Web build, and mobile
  TypeScript
- [x] Add environment-backed local, Android-emulator, LAN, and production WSS
  endpoint profiles with no production localhost fallback
- [x] Add a production Node WebSocket entry with Origin policy, health checks,
  payload limits, secret-free logs, graceful shutdown, and Docker packaging
- [x] Add Expo/EAS development, LAN internal, preview APK, and production build
  profiles with production cleartext disabled
- [x] Add production/mobile endpoint tests and a four-device beta checklist
- [x] Add touch/drag local-hand ordering with stable tile ids, sorted initial deal,
  one-tile draw insertion, reconnect restoration, and no manual arrange action
- [x] Select Render for the first one-instance Docker beta, add a Blueprint, and
  add a reusable remote WSS smoke for full room actions, security probes, and
  session recovery
- [x] Authorize the GitHub repository in Render, deploy the Singapore container,
  record the public WSS/health endpoints, and pass the four-client remote flow,
  response deadline, Origin, payload, and reconnect checks
- [x] Bind Expo project `@twilight111/leshan-mahjong` and create the preview WSS
  environment variable without storing session credentials
- [x] Finish EAS build `ac719fc4-730a-4236-8b3c-bdbde3fb5495` and record the
  first signed Android `0.2.0` internal APK install URL
- [x] Adapt the Expo consumer client to React Native Web with a responsive
  desktop layout and shared mouse/touch hand ordering
- [x] Add a per-tab, whitelisted Web session store without exposing wall, seed,
  opponent hands, or private response state
- [x] Publish the Expo Web/PWA to EAS Hosting at
  `https://leshan-mahjong-play.expo.app` and keep the Android APK available
- [x] Add the exact EAS Web origin to the production WSS policy and cover both
  Android and Web origins in deployment regression tests
- [x] Complete a four-session production browser baseline for room creation,
  seats, readiness, start, dingque, redacted hands, recovery, legal-tile
  selection, and mouse drag ordering
- [x] Add 30-second server-authoritative dingque and discard deadlines with
  yao-ji-aware automatic suit selection, legal automatic discard, and
  idempotent deadline settlement
- [x] Split active gameplay from the lobby into a landscape-first table and add
  compact colored physical-style tile faces without extra yao-ji badges
- [x] Persist the whitelisted Web session across tab/PWA relaunch, automatically
  resume on startup, and distinguish an expired session from a restarted
  in-memory room
- [ ] Complete and record the cross-platform four-client acceptance matrix for voluntary ba
  gang, delayed zero-point continuation, yao-ji exchange, reconnect, and
  multi-round cumulative settlement
- Add vibration/audio feedback
- Test Android and iOS layouts on physical devices
- Generate the first iOS internal build after Android beta acceptance and Apple
  developer device registration

## Phase 6: Portfolio Polish

Goal: make the project easy to understand in a resume or personal homepage.

- Add screenshots
- Add case study page
- Add development process notes
- Capture and link the production EAS-hosted Web/PWA
- Link from personal homepage

## Phase 7: Advanced Features

Optional after the MVP:

- More accurate Leshan local scoring
- AI opponents
- User accounts and match history
- User profiles and cross-device account recovery
