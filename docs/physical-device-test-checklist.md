# Four-Client Cross-Platform Internal Test Checklist

Use four phones/computers or four independent browser/App sessions connected to
the same production room server. Keep screenshots or a short recording for every
rule-specific scenario; rare gang scenarios are not adequately proved by a
normal round alone.

## Test Record

Fill this in before each run:

| Field | Value |
| --- | --- |
| App version | `0.2.0` |
| EAS build id | `ac719fc4-730a-4236-8b3c-bdbde3fb5495` |
| APK URL | [Install version 0.2.0 build 1](https://expo.dev/artifacts/eas/RO_ovhmgw0dcbkEypy1Y2fyWB2xsjHXhHoQKWuhc9vg.apk) |
| Artifact | 66.7 MiB Android internal APK; available through 2026-07-30 |
| Web/PWA URL | [https://leshan-mahjong-play.expo.app](https://leshan-mahjong-play.expo.app) |
| Server/client commit | `2485909` |
| WSS endpoint | `wss://leshan-mahjong-room-server.onrender.com/ws` |
| Test date and network | |
| Client A platform/browser | |
| Client B platform/browser | |
| Client C platform/browser | |
| Client D platform/browser | |

## Install And Security

- [ ] Open the production Web/PWA on Windows, Mac, Android, and iPhone where
  available; retain at least one run with the Android APK.
- [ ] Confirm the production page uses the Expo single-session UI and never
  exposes the Vite mock-table mode selector.
- [ ] Install the Web/PWA from one supported browser and verify its standalone
  launch still uses the production WSS endpoint.
- [ ] Confirm production mode connects to the configured `wss://` endpoint.
- [ ] Confirm `ws://`, localhost, LAN addresses, and `10.0.2.2` are rejected in
  the preview build.
- [ ] Search server logs, screenshots, errors, and EAS configuration for a real
  session token; there must be no match.
- [ ] Refresh or restart after joining and confirm only the owning client restores
  its seat and hand.

## Four-Player Room

- [ ] Device A creates a room; B, C, and D join it.
- [ ] All four take different seats, become ready, and start the round.
- [ ] Every device sees only its own hand. Opponents show concealed counts,
  presence, score, discards, and public melds only.
- [ ] Heavenly missing suits and manual dingque choices match on all devices.
- [ ] Initial hands are sorted once by bamboo, dots, characters, and rank.

## Hand Ordering

- [ ] Drag tiles at the left, middle, and right edges without changing any tile
  face or sending an action to the server.
- [ ] Verify horizontal hand scrolling and drag gestures do not trap each other
  on both a small and a large Android screen.
- [ ] Draw a tile and confirm only the new tile is inserted; the existing custom
  order is not sorted again.
- [ ] Disconnect and resume. Existing tile order should be preserved, removed
  tiles should disappear, and newly received tiles should be inserted.
- [ ] Start the next round and confirm the new initial deal receives a fresh
  default sort. There must be no separate arrange button.

## Voluntary Continue Gang

- [ ] With an eligible peng and more than one ba-gang candidate, confirm the App
  asks whether to continue and which meld/tile to use.
- [ ] Decline a candidate and make an ordinary discard; the turn must continue.
- [ ] Draw the matching natural tile and continue immediately. After the
  qiang-gang window passes, verify the normal ba-gang payment and exactly one
  replacement draw.
- [ ] Keep that natural tile past its draw turn, continue in a later turn, and
  verify the ba gang remains legal but records zero gang points.
- [ ] Continue with a physical one-bamboo or one-dot yao ji and verify each
  currently active payer pays the normal with-laizi ba-gang amount of 1 point.
- [ ] During qiang-gang, verify other eligible clients can choose hu or pass and
  cannot see one another's unresolved choices.
- [ ] If qiang-gang hu succeeds, verify the original peng remains, no ba-gang
  score is written, and no replacement tile is drawn.

## Exchange Yao Ji Inside A Gang

- [ ] For an established ming gang containing yao ji, exchange a matching
  natural hand tile and recover one yao ji.
- [ ] Repeat for an gang and ba gang. Opponents must not learn the concealed an
  gang face or physical tile ids.
- [ ] For a gang containing multiple yao ji, exchange them in separate later
  turns until no candidate remains.
- [ ] Verify every exchange keeps the original gang score and payer set, creates
  no new gang transfer, grants no replacement draw, and opens no qiang-gang
  window under the current ruleset.
- [ ] Create a winning hand through an exchange and verify the App offers
  self-draw hu but does not accept it automatically.
- [ ] Confirm a recovered yao ji can immediately participate in another legal
  continuation or hu, but cannot be actively discarded.

## Real Round And Recovery

- [ ] Complete draw, discard, private response, peng/gang, and voluntary hu
  actions from the appropriate phones.
- [ ] Put each App in the background and return; its seat, hand, score, action
  descriptor, timeline, and local tile order recover without replaying an
  uncertain action.
- [ ] Disable Wi-Fi for one responder. The deadline auto-passes that player and
  the other clients continue without seeing the hidden pending choice.
- [ ] Switch Wi-Fi to mobile data and confirm the newest connection alone owns
  the resumed session.
- [ ] Interrupt a discard or gang confirmation and verify the App shows a result
  pending state, then rebuilds controls from the latest server action id instead
  of blindly replaying it.

## Multi-Round Rules

- [ ] Complete an ordinary round: the first formally settled winner becomes
  next dealer when no responsibility override exists.
- [ ] Verify one-discard multiple wins: the discarder becomes next dealer.
- [ ] Verify rob-kong hu: the robbed ba-gang declarer becomes next dealer.
- [ ] Ready all four players again and start round two.
- [ ] Confirm hu, chicken, gang, and cha-jiao transfers accumulate exactly once
  and all four devices show identical cumulative totals.
- [ ] Confirm voluntary zero-point ba gang and yao-ji exchange do not rewrite a
  previous round's frozen ledger or cumulative history.

## Match Finish And Server Lifecycle

- [ ] Let a non-host member finish the match during `betweenRounds`.
- [ ] Confirm all four devices show the same final scores, ranking, dealer
  history, and per-round score changes.
- [ ] Leave all four clients connected through at least one heartbeat timeout
  interval; healthy sockets remain online.
- [ ] Redeploy or gracefully stop the server and confirm clients enter reconnect
  states without exposing credentials.
- [ ] Restart the in-memory server and try an old SecureStore session. The App
  must report that the room/session is gone and offer a clean re-entry path.

## Result Log

For every failed item record: checklist item, device, expected result, actual
result, timestamp, screenshot/video name, and whether the server was redeployed
during the scenario. Do not include session tokens in the evidence.
