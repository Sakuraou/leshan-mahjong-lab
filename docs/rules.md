# Leshan Mahjong Rules

This document is the source of truth for the app's rule engine. The target MVP
is the Leshan "eight chicken" variant described by the project owner.

## Rule Variant

The first playable version implements **eight chicken Leshan Mahjong**.

- `1 bamboo` and `1 dot` are both yao ji / laizi.
- Laizi can be used as a wildcard in hand formation.
- Four-chicken mode may be added later, where only `1 bamboo` is yao ji.

## Tiles

- Uses only characters, dots, and bamboos.
- No winds.
- No dragons.
- No flowers.
- Total base tile set: 108 tiles.

## Start Of Round

- No huansanzhang.
- Dingque is required.
- Players cannot chi.
- Players can peng, ming gang, an gang, and ba gang.
- The round uses xuezhan daodi.

## Win Rules

- Self-draw is allowed.
- Discard win is allowed.
- Multiple players may win from one discard.
- Qiang gang hu is allowed.
- Gang shang hua is allowed.
- Gang shang pao is allowed.
- A 1-point hand cannot win.
- Because self-draw doubles the result, self-draw ping hu can win as 2 points.
- Discard ping hu is only 1 point, so it cannot win.

## Base Score And Cap

- Base score is 1.
- Self-draw doubles the hand result.
- Each losing player can pay at most 64 points to a single winning player for
  the hu score.
- The 64-point cap does not include chicken payments, gang payments, or other
  side payments.

## Fan And Multipliers

Scoring is multiplier-based.

| Pattern | Fan | Multiplier |
| --- | ---: | ---: |
| Ping hu | 0 | 1x |
| Dui dui hu / da dui | 1 | 2x |
| Dan diao | 1 | 2x |
| Each gen | 1 each | 2x each |
| Qing yi se | 2 | 4x |
| Xiao qi dui | 2 | 4x |
| Long qi dui | 3 | 8x |
| Shuang long qi dui | 4 | 16x |

Examples:

- Discard qing yi se + xiao qi dui: `1 * 4 * 4 = 16`.
- Self-draw qing yi se + xiao qi dui: `1 * 4 * 4 * 2 = 32`.

## Gen

Each gen adds 1 fan.

Gen is checked at final settlement. A player has one gen when the final resolved
hand/table state contains four of the same tile value.

Important details:

- Gang naturally forms a gen because four identical tiles are present.
- Laizi can participate in gen according to the tile value it is being used as.
- Exposed sets and the final hand/table state are considered together.
- Example: if the player has peng of `4 characters`, and the final resolved
  hand also uses another `4 characters`, that counts as one gen.

## Chicken / Yao Ji / Laizi Rules

In eight-chicken mode:

- `1 bamboo` is yao ji.
- `1 dot` is yao ji.
- Both are laizi and may be used as wildcard tiles for hand formation.

Chicken payments are settled at hu or draw settlement, not immediately.

### Three Chicken

If a player has exactly three yao ji of the same original suit:

- Three `1 bamboo`: every other player pays 16.
- Three `1 dot`: every other player pays 16.

### Four Chicken

If a player has exactly four yao ji of the same original suit:

- Four `1 bamboo`: every other player pays 32.
- Four `1 dot`: every other player pays 32.

Mixed yao ji do not merge across suits:

- Two `1 bamboo` + two `1 dot` does not count as four chicken.
- Three `1 bamboo` + three `1 dot` counts as two separate three-chicken
  payments, so each other player pays `16 + 16`.

Players who have already won and exited the xuezhan round still pay later
chicken payments.

## Gang Score

Gang payments are separate from the hu score cap.

| Gang Type | Without laizi | With laizi |
| --- | ---: | ---: |
| Ming gang | 4 | 2 |
| An gang | 4 | 2 |
| Ba gang | 2 | 1 |

If a discarded yao ji is used in a gang, it remains a laizi. Chicken settlement
still depends on the final yao ji count at settlement.

## Qiang Gang And Chicken Liability

If a player robs a gang where the robbed tile is yao ji (`1 bamboo` or `1 dot`),
and that tile changes the winner from no three-chicken state to a three-chicken
state, the robbed-gang player pays the whole table's three-chicken payment.

Current confirmed amount:

- `16 * 3 = 48`

## Cha Jiao

Cha jiao exists.

At draw settlement:

- Players who are not listening pay players who are listening.
- Payment is based on the listening player's maximum possible discard-win hand.
- This is calculated as discard-win value, not self-draw value.

## Rule Engine Implications

The implementation should separate these modules:

- Tile model, including original tile and resolved laizi value.
- Dingque validation.
- Legal action generation.
- Laizi-aware hand decomposition.
- Hu eligibility and minimum-score validation.
- Pattern detection.
- Gen detection from final resolved state.
- Chicken settlement from original yao ji counts.
- Gang ledger.
- Cha jiao settlement.
- Event log and replay.

The UI should never decide rule legality by itself. It should ask the game
engine for legal actions and settlement results.

## Still Pending

These details still need confirmation before the engine becomes strict:

1. Does dingque forbid using laizi as the missing suit, or can laizi resolve into
   any suit after dingque?
2. When a player has both qing yi se and laizi, does the resolved laizi value
   need to match the pure suit?
3. Is dan diao always 1 fan, including seven-pair-like structures, or only
   standard four-sets-one-pair hands?
4. For one-discard multiple wins, does the discarder pay each winner separately
   with each winner's own 64-point cap?
5. Are gang payments paid immediately in real play but recorded for final UI
   settlement, or should the app display them only at final settlement?

