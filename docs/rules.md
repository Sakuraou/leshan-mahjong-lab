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

## Multi-Round Match And Dealer

- A new room starts every player at 0 cumulative points.
- Hu, chicken, gang, and cha-jiao transfers are added to the same match score.
  Starting the next round resets round-only tiles and windows, never the score.
- After a round ends, all four ready flags reset. All four seated players must
  ready again before the next round can start.
- A robbed ba-gang declarer becomes the next dealer. This responsibility rule
  applies even when another player won earlier in the round.
- For an ordinary one-discard multiple win, the discarder becomes the next
  dealer. The winners do not compete for dealer by hu order.
- If neither responsibility rule occurs, the first player whose hu is formally
  settled by the server becomes the next dealer. The original dealer has no
  extra priority; they keep the dealership only by being that first winner.
- If the wall empties and nobody has won, the current dealer remains dealer.
- The decision is frozen with the completed round. Reconnects, repeated
  deadline ticks, and repeated settlement calls cannot change it.
- The match has no fixed round count. Between rounds, any room member may end
  the match; all four final cumulative scores, ranking, and round deltas remain
  available. In-round forced dissolution and voting are not part of this MVP.

## Dingque And Laizi

After dingque:

- A player cannot win while holding ordinary tiles from the missing suit.
- If a player still has ordinary missing-suit tiles, they must discard all of
  them before discarding other suits.
- `1 bamboo` and `1 dot` are laizi, so their original printed suit does not
  force them to be treated as bamboo or dot for dingque.
- Immediately after dealing, if a hand has ordinary tiles from exactly two
  suits, the absent suit is selected automatically as heavenly dingque. Printed
  `1 bamboo` and `1 dot` do not count as ordinary bamboo/dot for this check. If
  zero or two suits are absent, the player still chooses manually.
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
  round-end three/four-chicken payments, established gang payments, and
  wall-empty cha-jiao payments.

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
| San long qi dui | 5 | 32x |

Examples:

- Discard qing yi se + xiao qi dui: `1 * 4 * 4 = 16`.
- Self-draw qing yi se + xiao qi dui: `1 * 4 * 4 * 2 = 32`.
- Self-draw wu ji + qing yi se: `1 * 2 * 4 * 4 = 32`.

Dan diao is only possible when all sets except the final waiting tile have been
exposed through peng or gang, leaving exactly one tile in hand as the wait. It is
mutually exclusive with seven-pair hands because seven pairs must stay concealed
in hand.

## Seven Pairs And Dragons

Seven pairs is a fully concealed 14-tile structure. A four-of-a-kind is split
into two pairs for this structure. Laizi keep their original `source` but may
resolve to any `target`; dragon count is calculated from the final targets, so
`3 natural + 1 laizi`, `2 + 2`, `1 + 3`, and four laizi can all form four equal
resolved tiles. Every complete group of four equal resolved targets contributes
one dragon; additional copies may form another pair or another complete dragon.

The seven-pairs tiers are mutually exclusive and only the highest tier applies:

- Zero groups of four: xiao qi dui, 2 fan / 4x.
- One group of four: long qi dui, 3 fan / 8x.
- Two groups of four: shuang long qi dui, 4 fan / 16x.
- Three groups of four: san long qi dui, 5 fan / 32x.

Each dragon tier already includes the value of its roots. A long-qi-dui hand
therefore reports `genCount: 0` for scoring and must not add another gen
multiplier. Qing yi se still uses resolved targets, while wu ji still uses the
original physical sources.

Hu availability is advisory, not automatic. The server publishes a legal hu
action and the client shows a clear prompt, but the player decides whether to
claim. On self-draw the player may discard instead and keep playing for a larger
dragon hand; on another player's discard the player may pass. `hasWon` changes
only after an explicit hu claim succeeds.

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

### Voluntary Ba Gang / Continue Gang

Ba gang is a player decision and must never be executed automatically. When a
player has more than one legal continuation target, the server must publish the
legal candidates and the player chooses which exposed peng to continue.

An exposed peng can become a ba gang in either of these ways:

- The player uses a yao ji already in hand as the fourth logical tile. This is
  allowed whether or not the original peng itself used yao ji.
- The player uses a natural tile equal to the logical target of the exposed
  peng, whether it was drawn this turn or retained from an earlier turn.

The action and its payment eligibility are separate:

- If the newly drawn physical tile is the natural matching tile, and the player
  continues the peng during that same draw/discard turn, the ba gang uses the
  normal payment table.
- If the player declines during that turn and uses that physical tile to
  continue the peng in a later turn, the ba gang action is still allowed but it
  produces no ba-gang payment.
- A yao ji is not a natural matching tile and is not subject to that natural
  tile's immediate-use expiry. Whenever a yao ji is used to continue a peng,
  the ba gang uses the normal with-laizi payment table (`1` from each other
  active, not-yet-won player).
- The normal payment table still inspects all four physical meld tiles. For
  example, an original peng that already contains yao ji remains a with-laizi
  ba gang even when its fourth tile is a newly drawn natural match.
- A scoring or zero-scoring ba gang still follows the ordinary qiang-gang
  window, rollback, gang-draw, and blood-battle state flow.

The server therefore needs to retain the physical fourth tile and whether its
normal ba-gang payment opportunity is still current. The client must consume a
server candidate rather than infer this timing rule itself.

### Replacing Yao Ji In An Established Gang

If an already established four-tile gang contains a yao ji resolved as its
logical target, and the player later draws the natural matching tile, the
player may put that natural tile into the gang and return one yao ji from the
gang to the concealed hand.

- This is a one-for-one physical tile exchange; the logical gang remains the
  same.
- A three-tile peng cannot return a yao ji this way. The exposed meld must
  already contain four logical equal tiles, counting yao ji replacements.
- The exchange applies to an already established ming gang, an gang, or ba
  gang.
- The natural tile may be exchanged during a later legal turn; it does not have
  to be exchanged in the turn in which it was drawn.
- If a gang contains more than one yao ji, each natural matching tile can return
  one yao ji, and the exchange can repeat on later turns.
- The exchange itself is not a new peng or a second gang declaration.
- The established gang's frozen payer set, uses-laizi classification, and score
  do not change. The exchange creates no new gang payment and grants no extra
  gang replacement draw.
- In the current ruleset the exchange does not open a qiang-gang response
  window. A future Mahjong ruleset may enable that behavior, but it must not be
  enabled for this version.
- The returned yao ji becomes immediately available in the concealed hand. It
  may participate in another legal continuation or hu during the same turn,
  while the active yao-ji discard prohibition still applies.
- If returning the yao ji creates a legal winning hand, that win is treated as
  self-draw. The server offers hu to the player; it does not force an automatic
  win.
- Original physical source identity must remain traceable for settlement and
  replay even after the displayed meld changes.

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

Cha jiao is settled only when the wall is empty. A round that ends because only
one active player remains does not run cha jiao.

- Only players who have not already won participate. Previously won hu scores,
  chicken payments, and established gang payments remain valid and are not
  recalculated.
- Every non-listening active player pays every listening active player. For
  example, two non-listeners and two listeners produce four transfers.
- Each listener is evaluated independently using the highest-scoring discard-
  win result available from the current rule engine.
- Each payer pays that listener's `cappedPoints`, so one payer-to-listener
  transfer is capped at 64 points.
- The 64-point cap applies only to the cha-jiao hu-body score. Chicken and gang
  payments settle independently at their exact uncapped amounts.
- If every active player is listening, or no active player is listening, no
  cha-jiao transfer is created.
- The payer and listener sets, best patterns, gen count, raw score, and capped
  amount are frozen in a terminal settlement fact. Repeated terminal calls or
  deadline ticks cannot write the same payment twice.

The listening search evaluates both ordinary `4 sets + 1 pair` and concealed
seven-pairs candidates. It includes laizi resolution, xiao/long/shuang-long/
san-long tiers, qing yi se, wu ji, ordinary-hand gen, highest-score selection,
and the discard-hu minimum-score rule.

Drawing the physical last wall tile does not immediately settle the round. The
drawer first receives the normal self-draw/discard opportunity; `wallEmpty`
settlement begins when play next requires a draw or gang replacement draw and
no tile remains.

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

## Hand Arrangement UX

- The local concealed hand must support touch/drag reordering so a player can
  visually group yao ji beside the tiles they are considering it to represent.
- The initial deal uses the standard bamboo/dot/character and rank order.
- Each automatic draw inserts only the new physical tile into its default
  position. It must not re-sort the whole hand or destroy the player's existing
  custom order.
- The client does not provide a separate manual arrange/sort button.
- Dragging changes only the local display order. It does not resolve a yao ji
  target, change the authoritative hand, or create a legal action.
- Stable client-safe physical tile identifiers will be needed so equal printed
  tiles can be moved independently and a reconnect can rebuild the order
  without exposing hidden information.

Implementation invariants:

- Every authoritative dealt tile receives a server-only random physical id.
  The owner receives an opaque `tileId` alias for concealed-hand interaction;
  opponents, public events, the wall, and settlement summaries never receive it.
- Continue-gang and yao-ji-exchange choices use descriptor-scoped opaque
  candidate ids. Clients do not encode or infer meld indexes or physical ids.
- A delayed-natural zero-point ba gang still freezes an immutable established
  gang fact with its original physical tiles, payer set, and eligibility. It
  creates no ledger transfer, but later exchanges cannot rewrite its history.
- Each established gang is linked internally to its frozen fact. Exchanging a
  yao ji changes only current physical ownership and the displayed meld.

The UI should never decide rule legality by itself. It should ask the game
engine for legal actions and settlement results.

## Confirmed Clarifications

- Dingque checks ordinary missing-suit tiles, while laizi can resolve as needed.
- Qing yi se requires all resolved laizi to match the pure suit.
- Dan diao is 1 fan and cannot overlap with seven pairs.
- Seven-pairs dragon tiers are mutually exclusive, and their included roots do
  not also add `genCount` fan.
- Hu is never automatic: the server offers a legal claim, while the player may
  pass or discard and continue building a larger hand.
- One-discard multiple wins are paid separately by the discarder.
- Gang payments are settled together at the final settlement screen.
- Gang payer sets are frozen when each gang formally becomes valid, rather than
  recomputed from terminal `hasWon` state.
- Wu ji is 2 fan, can stack with other patterns, and is broken by any original
  `1 bamboo` or `1 dot` in the player's own final settlement tiles.
- The MVP should enforce a no-active-yao-ji-discard rule.
- Ba gang is optional, candidate-driven, and never automatic.
- A natural matching tile drawn and used to continue a peng immediately can
  receive normal ba-gang points; delaying that physical tile until a later turn
  makes the continuation zero-point.
- A yao ji used to continue a peng receives the normal with-laizi ba-gang
  points and is not subject to the natural matching tile's delayed-use expiry.
- A yao ji inside an established four-tile gang may be exchanged for a newly
  drawn or retained natural matching tile, but a yao ji inside a three-tile
  peng cannot be taken back this way.
- The current ruleset allows repeated yao-ji exchanges in all three established
  gang types without new gang points, replacement draws, or qiang-gang windows.
  An exchange-created hu is self-draw and remains the player's decision.
- The local phone hand should be manually reorderable while deal/draw placement
  inserts only the new tile and preserves the player's existing custom order.
