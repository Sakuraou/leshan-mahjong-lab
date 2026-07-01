# Roadmap

## Phase 0: Repository Setup

- [x] Create portfolio-oriented README
- [x] Record rule assumptions and pending questions
- [x] Record multi-agent workflow
- [x] Initialize Git and connect to GitHub

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
- Wrap `roomSocketAdapter` with a production-ready WebSocket server entry
- Connect table UI to WebSocket room snapshots
- Add reconnect with a local session token

## Phase 5: Portfolio Polish

Goal: make the project easy to understand in a resume or personal homepage.

- Add screenshots
- Add case study page
- Add development process notes
- Deploy to Vercel
- Link from personal homepage

## Phase 6: Advanced Features

Optional after the MVP:

- More accurate Leshan local scoring
- AI opponents
- User accounts and match history
- Expo mobile version
