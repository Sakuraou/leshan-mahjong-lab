# Roadmap

## Phase 0: Repository Setup

- [x] Create portfolio-oriented README
- [x] Record rule assumptions and pending questions
- [x] Record multi-agent workflow
- [x] Initialize Git and connect to GitHub

## Phase 1: Playable Prototype

Goal: one person can open the app and interact with a Mahjong table.

- Create Next.js app structure
- Build Tile, Hand, TableBoard, ActionPanel, and ReplayTimeline components
- Render four seats, player hand, discard areas, and remaining tile count
- Support a seeded mock round
- Support draw and discard actions

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
- Build wall shuffle and dealing logic
- Implement basic win detection
- Add broader rule tests

## Phase 3: Explainable Training

Goal: make the product useful instead of only playable.

- Explain why a hand can win
- Show listening tiles
- Suggest discards with simple reasoning
- Add round timeline and replay
- Add debug panel for state inspection

## Phase 4: Portfolio Polish

Goal: make the project easy to understand in a resume or personal homepage.

- Add screenshots
- Add case study page
- Add development process notes
- Deploy to Vercel
- Link from personal homepage

## Phase 5: Advanced Features

Optional after the MVP:

- More accurate Leshan local scoring
- AI opponents
- Multiplayer room prototype
- WebSocket backend
- User accounts and match history
- Expo mobile version
