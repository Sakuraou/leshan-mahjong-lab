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

## 2026-06-30

- Prepared the repository for Vercel deployment.
- Documented the recommended Vercel project settings in the README.
- Added SPA fallback routing through `vercel.json`.
- Added this release note file for portfolio progress tracking.
