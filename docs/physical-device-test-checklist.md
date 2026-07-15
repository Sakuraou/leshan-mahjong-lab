# Four-Device Internal Test Checklist

Use four phones or four independent App installations connected to the same
production room server. Record the App version, server commit, device model,
OS version, and result for each run.

## Install And Security

- [ ] Install the same EAS `preview` build on all four devices.
- [ ] Confirm production mode accepts the configured `wss://` endpoint.
- [ ] Confirm `ws://`, localhost, and `10.0.2.2` are rejected in production.
- [ ] Search server logs, screenshots, error text, and build configuration for
  a real session token; there must be no match.

## Four-Player Room

- [ ] Device A creates a room; B, C, and D join it.
- [ ] All four take different seats, become ready, and start the round.
- [ ] Every device sees only its own hand. Opponents show concealed counts,
  presence, score, discards, and public melds only.
- [ ] Heavenly missing suits and manual dingque choices match on all devices.

## Real Round And Recovery

- [ ] Complete draw, discard, private response, peng/gang, and voluntary hu
  actions from the appropriate phones.
- [ ] Put each App in the background and return; its seat, hand, score, action
  descriptor, and timeline recover without replaying an uncertain action.
- [ ] Disable Wi-Fi for one responder. The deadline auto-passes that player and
  the other clients continue without seeing the hidden pending choice.
- [ ] Switch Wi-Fi to mobile data and confirm the newest connection alone owns
  the resumed session.

## Multi-Round Rules

- [ ] Complete an ordinary round: the first formally settled winner becomes
  next dealer when no responsibility override exists.
- [ ] Verify one-discard multiple wins: the discarder becomes next dealer.
- [ ] Verify rob-kong hu: the robbed ba-gang declarer becomes next dealer.
- [ ] Ready all four players again and start round two.
- [ ] Confirm hu, chicken, gang, and cha-jiao transfers accumulate exactly once
  and all four devices show identical cumulative totals.

## Match Finish

- [ ] Let a non-host member finish the match during `betweenRounds`.
- [ ] Confirm all four devices show the same final scores, ranking, dealer
  history, and per-round score changes.
- [ ] Restart the in-memory server and try an old SecureStore session. The App
  must report that the room/session is gone and offer a clean re-entry path.
