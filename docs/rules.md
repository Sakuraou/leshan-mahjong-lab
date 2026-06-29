# Leshan Mahjong Rules

This document records the target rule set for the app. Items marked as pending
need confirmation before the rule engine is finalized.

## MVP Assumptions

The first version can use a simplified but extensible Leshan/Sichuan-style rule
set:

- 108 tiles: characters, dots, and bamboos only
- Four players
- Dealer starts with 14 tiles, other players start with 13
- No winds, dragons, or flowers
- Dingque is required
- Players must discard tiles from the missing suit first if they still have any
- No chi in MVP
- Peng, gang, self-draw win, and discard win are supported
- Xuezhan mode is preferred for MVP: a winning player exits, others continue
- Scoring starts simple and can be expanded later

## Pending Rule Questions

Please confirm these before implementation becomes strict:

1. Are only characters, dots, and bamboos used?
2. Is dingque mandatory before play starts?
3. Is huansanzhang used in the local rule set?
4. Is chi completely forbidden?
5. Is the game xuezhan daodi or xueliu chenghe?
6. Can a player win by discard, self-draw, or both?
7. Is multiple-win from one discard allowed?
8. Are qi dui, long qi dui, qing yi se, dui dui hu, jiang dui, and yao jiu all valid?
9. How many fan does each pattern count?
10. Is there a fan cap?
11. Does each gen add fan or score?
12. How are ming gang, an gang, and bu gang scored?
13. Is qiang gang hu allowed?
14. Are gang shang hua and gang shang pao counted?
15. Are cha jiao, cha hua zhu, tui shui, or hujiao zhuanyi used?

## Rule Engine Design Notes

The code should separate these concerns:

- Tile model
- Wall and dealing
- Player state
- Legal action generation
- Win validation
- Pattern detection
- Scoring
- Event log
- Replay and explanation

The UI should never be the source of truth for rule legality. It should ask the
game engine which actions are currently legal and display those choices.

## MVP Pattern List

Start with:

- Ping hu
- Dui dui hu
- Qing yi se
- Qi dui
- Gen

Add later:

- Long qi dui
- Qing qi dui
- Jiang dui
- Yao jiu
- Gang shang hua
- Gang shang pao
- Qiang gang hu
- Cha jiao
- Cha hua zhu
- Tui shui

