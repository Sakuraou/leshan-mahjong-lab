# Leshan Mahjong Lab

An interactive Web prototype for learning and testing Leshan eight-chicken
Mahjong rules. The project turns a local, oral rule set into a tested TypeScript
game engine and a playable browser table.

## Online Demo

Deployment is planned for Vercel.

- Live URL: `TBD`
- Repository: `https://github.com/Sakuraou/leshan-mahjong-lab`
- Case study: [docs/case-study.md](docs/case-study.md)

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
6. After deployment, replace `Live URL: TBD` in this README with the Vercel URL.

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
modeling, tested engineering, frontend interaction, and AI-assisted development.

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
- Web table prototype with Chinese tile labels, current-player highlight, wall
  count, discard areas, action hints, and round log

## Screenshots

Screenshots will be added after deployment.

Planned portfolio shots:

- Main table view with four players, highlighted current player, wall count, and
  Chinese hand tiles
- Draw/discard interaction with Chinese illegal-action feedback
- Hu-ready state showing score and detected patterns
- Development case-study view showing the multi-agent workflow and rule-engine
  tests

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
    round.ts        Seeded shuffle, dealing, draw/discard state transitions
    win.ts          Self-draw and discard hu checks
tests/
  game/             Rule, round, hu, and win tests
docs/
  rules.md          Source-of-truth local rule document
  roadmap.md        Development plan
  agent-workflow.md AI collaboration log
  case-study.md     Portfolio write-up
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

**Leshan Mahjong Lab | Local Mahjong Rule Training Web App**

- Built a playable Web prototype for Leshan eight-chicken Mahjong, supporting
  seeded rounds, draw/discard flow, rule-aware validation, and basic hu checks.
- Modeled local Mahjong rules as tested TypeScript modules, separating tile
  modeling, laizi-aware hand decomposition, scoring helpers, round state, and UI.
- Used a multi-agent AI-assisted workflow to split product planning, rule
  modeling, implementation, test-case design, and review.
- Prepared the repository as a portfolio case study with rule documentation,
  roadmap, development log, and deployment-ready Vite build.
