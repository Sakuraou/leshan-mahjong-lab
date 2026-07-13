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

## Dingque And Laizi

After dingque:

- A player cannot win while holding ordinary tiles from the missing suit.
- If a player still has ordinary missing-suit tiles, they must discard all of
  them before discarding other suits.
- `1 bamboo` and `1 dot` are laizi, so their original printed suit does not
  force them to be treated as bamboo or dot for dingque.
- A laizi may resolve to any suit/value during hand formation.
- If qing yi se is claimed, each laizi used in the winning structure must resolve
  into that pure suit.

## Win Rules

- Self-draw is allowed.
- On self-draw, every other player who has not already won pays the winner the
  capped hu score separately.
- Discard win is allowed.
- Multiple players may win from one discard. The discarder pays each winner
  separately, and each winner has their own 64-point hu-score cap.
- Qiang gang hu is allowed.
- Multiple players may rob the same ba gang. The ba-gang declarer pays each
  qiang-gang winner separately, using the ordinary discard-hu score and the
  per-winner 64-point cap.
- Gang shang hua is allowed.
- Gang shang pao is allowed.
- A 1-point hand cannot win.
- Because self-draw doubles the result, self-draw ping hu can win as 2 points.
- Discard ping hu is only 1 point, so it cannot win.

### Server Response Timeout

- Discard and qiang-gang response windows use a server-authoritative deadline.
- When the deadline is reached, every player who has not responded is treated
  as passing.
- Hu claims submitted before the deadline remain valid and settle together.
- With no discard hu, play moves to the next active player's draw phase.
- With no qiang gang hu, the ba gang is committed and enters gang draw.
- A resolved window cannot advance the round or settle scores a second time.

## Base Score And Cap

- Base score is 1.
- Self-draw doubles the hand result.
- Each losing player can pay at most 64 points to a single winning player for
  the hu score.
- The 64-point cap does not include chicken payments, gang payments, or other
  side payments.
- The authoritative score ledger covers self-draw, discard hu, qiang gang hu,
  round-end three/four-chicken payments, and established gang payments.
  Cha-jiao payments remain a future settlement category.

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
| Wu ji | 2 | 4x |
| Long qi dui | 3 | 8x |
| Shuang long qi dui | 4 | 16x |

Examples:

- Discard qing yi se + xiao qi dui: `1 * 4 * 4 = 16`.
- Self-draw qing yi se + xiao qi dui: `1 * 4 * 4 * 2 = 32`.
- Self-draw wu ji + qing yi se: `1 * 2 * 4 * 4 = 32`.

Dan diao is only possible when all sets except the final waiting tile have been
exposed through peng or gang, leaving exactly one tile in hand as the wait. It is
mutually exclusive with seven-pair hands because seven pairs must stay concealed
in hand.

## Wu Ji

Wu ji is worth 2 fan, or 4x.

At final settlement, if the player's 14-tile winning structure contains no
original `1 bamboo` and no original `1 dot`, the hand has wu ji.

Because `1 bamboo` and `1 dot` are the eight-chicken laizi tiles, wu ji is judged
by original printed tiles rather than resolved wildcard values.

If a player has any original `1 bamboo` or `1 dot` in their own final settlement
tiles, the hand is not wu ji, even if that laizi is resolved as another tile.

Wu ji can stack with other scoring patterns such as qing yi se.

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
- The app MVP should forbid actively discarding yao ji, because normal play does
  not discard these laizi tiles.

Chicken payments are settled once when the blood-battle round ends, not when a
player first reaches three or four yao ji.

The server counts each player's original physical settlement tiles: concealed
hand tiles, `Meld.tiles`, and an external winning tile received through discard
hu or qiang-gang hu. A yao ji used as another logical tile still counts by its
printed `1 bamboo` or `1 dot` source.

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
Each gang freezes an authoritative payment fact when it formally becomes valid.
Those frozen facts are written to the score ledger together at final settlement.
Later hu results never cancel or recalculate an already-established gang.

| Gang Type | Payers frozen when established | Without laizi, per payer | With laizi, per payer |
| --- | --- | ---: | ---: |
| Ming gang | The player who discarded the claimed tile | 4 | 2 |
| An gang | Every other player who has not already won | 4 | 2 |
| Ba gang | Every other player who has not already won when the upgrade commits | 2 | 1 |

Confirmed local behavior:

- With three active opponents, an gang pays `4 * 3 = 12` without laizi or
  `2 * 3 = 6` with laizi.
- A player who has already won does not pay a later an gang or ba gang.
- A payer who wins after a gang was established still pays that frozen gang
  transfer at final settlement. The gang player likewise keeps gang income
  established before later winning.
- Gang replacement draw followed by self-draw or discard hu does not transfer,
  cancel, or refund an established gang payment.
- Every payer produces one real zero-sum ledger transfer. Gang payments are
  uncapped and do not consume the 64-point hu cap.

`usesLaizi` is determined from the four original physical tiles in
`Meld.tiles`. If any physical tile is an original `1 bamboo` or `1 dot`, the
whole gang uses the reduced laizi amount even when that tile resolves to the
logical gang target.

A ba gang declaration first opens the qiang-gang response window. It does not
establish a gang payment yet. If every eligible player passes or times out, the
peng is upgraded and the payer set is frozen at that moment. If anyone wins by
qiang gang hu, the original peng remains and no ba-gang payment exists.

If a discarded yao ji is used in a gang, it remains a laizi. Chicken settlement
still depends on the final yao ji count at settlement.

## Qiang Gang And Chicken Liability

If a player robs a gang where the robbed tile is yao ji (`1 bamboo` or `1 dot`),
and the winner had exactly two original yao ji of that same suit before the rob,
the robbed tile changes the count from two to three. The ba-gang declarer alone
pays the winner the whole table's three-chicken amount:

- `16 * 3 = 48`.
- The other two players do not also pay ordinary three-chicken for that winner
  and suit.
- Three/four-chicken in the winner's other yao-ji suit still settles normally.
- A winner who already had three of that suit and reaches four receives normal
  four-chicken instead; the liability replacement does not apply.
- Multiple winners can each receive one 48-point liability payment from the
  same ba-gang declarer when each independently changes from two to three.

The server records the robbed physical tile, qiang-gang window, and responsible
player internally when the hu is claimed. It applies the liability once in the
same idempotent round-end chicken batch. The 64-point hu cap does not apply.
Clients receive only the completed ledger summary after the round reaches
`ended`; no in-progress chicken count or liability candidate is exposed.

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

## Confirmed Clarifications

- Dingque checks ordinary missing-suit tiles, while laizi can resolve as needed.
- Qing yi se requires all resolved laizi to match the pure suit.
- Dan diao is 1 fan and cannot overlap with seven pairs.
- One-discard multiple wins are paid separately by the discarder.
- Gang payments are settled together at the final settlement screen.
- Gang payer sets are frozen when each gang formally becomes valid, rather than
  recomputed from terminal `hasWon` state.
- Wu ji is 2 fan, can stack with other patterns, and is broken by any original
  `1 bamboo` or `1 dot` in the player's own final settlement tiles.
- The MVP should enforce a no-active-yao-ji-discard rule.
