# Leshan Mahjong Lab

An interactive Leshan Mahjong training app focused on local-rule modeling,
eight-chicken laizi rules, single-player practice, explainable hand evaluation,
and AI-assisted development.

## Project Positioning

This project is not only a Mahjong game. It is a portfolio-oriented product that
shows how a local card-game rule system can be translated into a tested,
explainable, and playable web application.

The first version will be a Web/PWA app so recruiters and interviewers can open a
link and try it immediately. A mobile app version can be added after the core
game engine becomes stable.

## MVP Scope

- Rule guide for eight-chicken Leshan Mahjong
- Single-player practice table
- Tile draw, discard, sort, and action history
- Laizi-aware winning-hand detection
- Hand explanation: why a hand can or cannot win
- Listening-tile hints
- Chicken, gen, gang, and cha jiao settlement notes
- Simple AI discard suggestion
- Round replay timeline
- Case study page for the AI and multi-agent development workflow

## Recommended Tech Stack

- Next.js + React + TypeScript
- Tailwind CSS
- Zustand for local game state
- Node test runner for the first rule-engine tests; Vitest can be added later
- Playwright for browser flow tests
- Vercel for deployment

## Architecture Direction

The app should keep the game logic independent from the UI.

```text
src/
  app/              Next.js pages and routes
  components/       Tile, hand, table, action panel, replay timeline
  game/             Pure TypeScript Mahjong rules and game engine
  store/            Local state management
tests/
  game/             Rule and scoring tests
  e2e/              Browser interaction tests
docs/
  rules.md          Leshan Mahjong rules and pending questions
  roadmap.md        Development phases
  agent-workflow.md Multi-agent collaboration record
```

## Multi-Agent Collaboration

This project is designed to showcase a vibe-coding workflow:

| Agent Role | Responsibility | Output |
| --- | --- | --- |
| Product Agent | Define MVP and portfolio story | Product scope, feature priorities |
| Rule Agent | Model Leshan Mahjong rules | Rule questions, engine boundaries |
| Frontend Agent | Build the playable interface | Table UI, hand interaction |
| Test Agent | Generate rule test cases | Vitest examples and edge cases |
| Review Agent | Audit implementation quality | Bug risks and improvement notes |

## Resume Pitch

**Leshan Mahjong Lab | Local Mahjong Rule Training App**

- Designed and built an interactive Leshan Mahjong training app with hand
  operation, winning-hand detection, scoring hints, discard suggestions, and
  replay timeline.
- Modeled local Mahjong rules as testable TypeScript modules, separating hand
  validation, pattern detection, scoring, and UI state.
- Used a multi-agent AI-assisted workflow to split product planning, rule
  modeling, frontend implementation, test generation, and code review.
- Built a portfolio case study to demonstrate the full development loop from
  ambiguous local rules to a deployed playable product.

## Current Status

Planning, repository setup, and the first tested rule-core layer.

Implemented rule-core basics:

- Tile model and 108-tile wall
- Eight-chicken yao ji / laizi recognition
- Dingque discard legality
- No-active-yao-ji-discard MVP rule
- Wu ji detection
- Three-chicken and four-chicken settlement
- Gang point table
- Basic hu score multiplier, self-draw, minimum win, and 64-point cap
- Laizi-aware standard hu decomposition for 4 melds + 1 pair
- Seeded shuffle, four-player dealing, dealer state, and remaining wall tracking
- Basic draw and discard transitions with dingque and no-yao-ji-discard checks
- Self-draw and discard hu checks with minimum-score validation

Run tests:

```bash
npm test
```

Next milestone: build the first playable table prototype using the seeded round
state, draw/discard transitions, and hu checks.
