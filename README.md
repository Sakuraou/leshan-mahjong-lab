# Leshan Mahjong Lab

An interactive frontend multiplayer-table prototype for learning and testing
Leshan eight-chicken Mahjong rules. The project turns a local, oral rule set
into a tested TypeScript game engine and a browser table that is ready for a
future real-time room layer.

## Online Demo

Deployment is prepared for Vercel. The production URL should be pasted here
after the GitHub repository is imported in Vercel.

- Live URL: `TBD - paste the Vercel production URL here`
- Deployment status: Vercel-ready, production URL pending
- Repository: `https://github.com/Sakuraou/leshan-mahjong-lab`
- Case study: [docs/case-study.md](docs/case-study.md)
- Release notes: [docs/release-notes.md](docs/release-notes.md)
- Multiplayer design: [docs/multiplayer-design.md](docs/multiplayer-design.md)

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
- Real multiplayer room design covering room creation, joining, seat assignment,
  readiness, dingque, server dealing, turn actions, reconnect, and
  server-authoritative validation

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
```

## Tech Stack

- Vite
- React
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
  App.tsx           Browser table prototype
  styles.css        Prototype UI styling
  game/
    tiles.ts        Tile model, wall generation, yao ji detection
    hu.ts           Laizi-aware standard hu decomposition
    rules.ts        Dingque, score helpers, chicken/gang/wu ji helpers
    room.ts         Local room reducer and redacted client-visible room state
    round.ts        Seeded shuffle, dealing, draw/discard state transitions
    win.ts          Self-draw and discard hu checks
tests/
  game/             Rule, round, hu, and win tests
docs/
  rules.md          Source-of-truth local rule document
  roadmap.md        Development plan
  agent-workflow.md AI collaboration log
  case-study.md     Portfolio write-up
  multiplayer-design.md Real-time room product and technical plan
```

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
- Used a multi-agent AI-assisted workflow to split product planning, rule
  modeling, implementation, test-case design, and review.
- Prepared the repository as a portfolio case study with rule documentation,
  roadmap, development log, and deployment-ready Vite build.
