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
- The default playable table still uses the local mock transport, keeping the
  main portfolio demo stable while the real WebSocket path is demonstrated
  separately.
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
- There is no login, persistence, replay system, or production deployment for
  the WebSocket server yet.
- Remote turns are still simulated locally for demo progression until a
  real-time room backend is added.
- The main room/table mode is still powered by the local mock transport; the
  real WebSocket path is currently an experiment panel.
- The WebSocket server currently covers room lifecycle only, not draw/discard,
  peng/gang, hu, settlement, durable auth, or production persistence.
- Screenshot assets are still pending until the first production deployment is
  captured.

### Screenshot Placeholders

| Shot | What it should show |
| --- | --- |
| WebSocket experiment panel | `ws://127.0.0.1:8787`, connected state, lifecycle controls, and experiment logs |
| Four-client redacted snapshots | Host, guest, helper 3, and helper 4 summaries showing own-hand counts and three hidden hands |
| WebSocket full-flow start | Four clients seated and ready, room status `dingque`, latest event `roundStarted` |
| WebSocket session recovery | "模拟刷新后恢复", restored host/guest sessions, resume success badge, missed-event count |

### Next Steps

1. Paste the Vercel production URL into the README.
2. Capture the first portfolio screenshots and replace the screenshot
   placeholders.
3. Add peng/gang actions to the round state.
4. Connect seven-pairs and advanced fan calculation to hu checks.
5. Implement chicken, gang, and cha jiao settlement views.
6. Add a clearer portfolio page or route for case-study presentation.
7. Add clearer persisted-session management, such as manual clear and stale-room
   warnings.
8. Decide when to promote real WebSocket snapshots into the main table view.

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
- Kept the mock room/table flow as the default main experience.
