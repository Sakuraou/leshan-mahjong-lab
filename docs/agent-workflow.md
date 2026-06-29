# Multi-Agent Workflow

This project uses AI-assisted development as a visible engineering process, not
as a hidden shortcut.

## Why Multi-Agent

Leshan Mahjong has three kinds of complexity:

- Product complexity: deciding what should be built first
- Rule complexity: turning local rules into deterministic code
- Engineering complexity: keeping UI, state, rules, tests, and deployment clean

Different agent roles help split these concerns and produce reviewable outputs.

## Agent Roles

## Product Agent

Focus:

- MVP scope
- User journey
- Resume and portfolio positioning
- Case study structure

Output:

- Feature priorities
- README language
- Resume bullets

## Rule Agent

Focus:

- Leshan Mahjong rule questions
- Rule abstractions
- Edge cases
- Scoring risks

Output:

- `docs/rules.md`
- Test-case checklist
- Rule-engine boundaries

## Frontend Agent

Focus:

- Playable table interface
- Mobile-friendly controls
- Tile interaction
- Replay timeline

Output:

- Component structure
- UI implementation
- Visual polish suggestions

## Test Agent

Focus:

- Winning-hand examples
- Illegal-action examples
- Regression tests
- Fixed random seeds for replayable scenarios

Output:

- Vitest cases
- Playwright flows

## Review Agent

Focus:

- Code quality
- Rule correctness risk
- State-management risk
- Portfolio clarity

Output:

- Review notes
- Refactor suggestions
- Missing-test checklist

## Development Log

### 2026-06-29

Initial planning session:

- Chose Web/PWA as the first delivery target
- Positioned the app as a portfolio project and local-rule training product
- Split project concerns into product, rule, frontend, test, and review agents
- Created the first rule-question checklist and roadmap

