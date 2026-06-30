# Leshan Mahjong Lab Case Study

## Overview

Leshan Mahjong Lab is a browser-based training prototype for Leshan
eight-chicken Mahjong. The goal is to make a local rule set playable,
explainable, and testable enough to serve as a portfolio project.

The project began from an ambiguous idea: "I want to build a Leshan Mahjong app
for my resume." Instead of starting with visuals, the work was framed around the
hardest part of the product: translating local table rules into deterministic
software behavior.

## Why I Built It

Mahjong is a good portfolio problem because it mixes product design, domain
modeling, frontend interaction, and automated testing.

Leshan eight-chicken Mahjong is especially useful because it is not just a
standard ruleset:

- `1 bamboo` and `1 dot` are both yao ji / laizi.
- Laizi can act as wildcard tiles in hand formation.
- A 1-point hand cannot win.
- Self-draw doubles the score, so self-draw ping hu can win while discard ping
  hu cannot.
- Wu ji, qing yi se, chicken payments, gang points, and dingque create many
  rule boundaries.

That rule complexity makes the project stronger than a simple UI clone.

## Product Direction

The first version is a Web app rather than a native mobile app.

This choice keeps the project easy to try from a resume or personal homepage.
Recruiters and interviewers can open a link, see the table, and interact with a
seeded round without installing anything.

The long-term path is:

1. Web prototype
2. PWA-style app experience
3. Optional Expo mobile client that reuses the same TypeScript game engine

## Rule Modeling Challenges

The largest challenge was separating rule legality from UI behavior.

The engine currently models:

- Tile identity and 108-tile wall generation
- Eight-chicken yao ji / laizi detection
- Dingque discard constraints
- No-active-yao-ji-discard rule for the MVP
- Laizi-aware standard hu decomposition
- Self-draw and discard hu checks
- Minimum-score rule
- Wu ji and qing yi se pattern detection
- Chicken, gang, and score helper functions

The most important design decision was to keep the rule engine pure. React does
not decide whether an action is legal; it asks `src/game` functions for the
answer.

## Engineering Architecture

```text
src/game/tiles.ts
  Tile model, labels, wall generation, yao ji detection

src/game/hu.ts
  Standard 4-melds-1-pair hu decomposition with laizi support

src/game/rules.ts
  Dingque, wu ji, chicken settlement, gang points, and score helpers

src/game/round.ts
  Seeded shuffle, initial dealing, draw/discard transitions

src/game/win.ts
  Self-draw and discard hu checks

src/App.tsx
  Browser table prototype wired to the game engine
```

This split makes the system easy to test and easier to port. A future mobile
client can reuse `src/game` without rewriting the rules.

## Testing Strategy

The project uses Node's built-in test runner for the first engine tests.

Current tests cover:

- Wall size and seeded shuffle reproducibility
- Dealer and non-dealer hand sizes
- Dingque discard order
- Yao ji / laizi recognition
- No-active-yao-ji-discard validation
- Laizi completing sequences, pairs, and triplets
- Failed hu decomposition
- Self-draw ping hu accepted
- Discard ping hu rejected
- Higher-value discard hu accepted

This gives the rule engine a safety net before more UI complexity is added.

## Multi-Agent Workflow

The project was developed with a visible AI-assisted workflow.

Different agent roles were used for:

- Product framing and resume positioning
- Rule clarification and boundary discovery
- Implementation planning
- Test-case generation
- Review and next-step planning

This workflow helped turn a vague idea into a sequence of small, testable
milestones. The work is documented in [agent-workflow.md](agent-workflow.md).

## Current Status

Completed:

- GitHub repository setup
- Rule documentation
- Pure TypeScript rule-core modules
- Tested laizi-aware hu decomposition
- Seeded round setup
- Draw/discard state flow
- Basic self-draw and discard hu checks
- First Vite + React table prototype
- Chinese tile display and clearer action feedback

Still missing:

- Peng, gang, and hu prompt flow
- Full scoring settlement screen
- Cha jiao settlement implementation
- Replay timeline
- Screenshot capture and deployed demo URL
- PWA polish

## What This Shows In A Portfolio

This project demonstrates:

- Turning informal local rules into software specifications
- Designing pure TypeScript domain logic
- Writing regression tests around tricky rule behavior
- Building a usable React prototype on top of tested logic
- Using multi-agent AI assistance without hiding the engineering process

The intended resume story is not "I made a Mahjong game." It is:

> I modeled a local Mahjong variant as a tested rule engine and built a playable
> Web prototype around it using an AI-assisted multi-agent workflow.

