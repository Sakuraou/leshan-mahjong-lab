# Release Notes

## MVP Snapshot

The current build is a playable Web prototype for Leshan eight-chicken Mahjong.
It focuses on a stable game-core foundation and a readable browser table rather
than a complete production game.

### Current MVP Features

- Vite, React, and TypeScript Web prototype
- 108-tile Leshan Mahjong wall generation
- Seeded shuffle for reproducible rounds
- Four-player dealing with dealer 14 tiles and other players 13 tiles
- Current-player draw and discard state transitions
- Dingque-aware discard validation
- MVP rule that prevents actively discarding yao ji
- Laizi-aware standard hu check for `4 melds + 1 pair`
- Self-draw and discard hu checks with the local minimum-score rule
- Basic scoring helpers for ping hu, wu ji, qing yi se, gen, and score caps
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
- WebSocket room protocol draft documents the next server-authoritative room
  step, including client actions, broadcasts, errors, reconnect, legal actions,
  and client-visible state payloads.
- Player-selected dingque with heavenly-missing-suit default when the local
  hand naturally lacks exactly one ordinary suit.
- Automatic system draw at the start of draw phases.
- Self-drawn tile faces for bamboos, dots, and characters, with the local hand
  sorted by bamboos, dots, then characters.
- Vercel-ready build configuration

### Known Limits

- Seven pairs, long seven pairs, double long seven pairs, and full fan stacking
  are not fully connected to the round flow yet.
- Peng, gang, robbing gang, gang-shang-hua, gang-shang-pao, and one-discard
  multi-win are still planned.
- Chicken settlement, gang settlement, and cha jiao settlement are modeled only
  as helpers or rule notes, not as a complete end-of-round settlement screen.
- The UI is a prototype table, not yet a polished multiplayer game interface.
- There is no backend, login, persistence, replay system, or real-time room
  synchronization yet.
- Remote turns are still simulated locally for demo progression until a
  real-time room backend is added.
- The room mode is local-only and deterministic; it demonstrates product flow
  before real networking is introduced.
- The WebSocket protocol is documentation only; no real server connection has
  been implemented yet.
- Screenshot assets are still pending until the first production deployment is
  captured.

### Next Steps

1. Paste the Vercel production URL into the README.
2. Capture the first portfolio screenshots and replace the screenshot
   placeholders.
3. Add peng/gang actions to the round state.
4. Connect seven-pairs and advanced fan calculation to hu checks.
5. Implement chicken, gang, and cha jiao settlement views.
6. Add a clearer portfolio page or route for case-study presentation.
7. Design the real multiplayer room flow with seat assignment, readiness,
   reconnect behavior, and server-authoritative actions.
8. Build the first WebSocket server-authoritative in-memory room service and
   connect the table UI to server room snapshots.

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
