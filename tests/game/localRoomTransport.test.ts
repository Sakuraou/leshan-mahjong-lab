import test from "node:test";
import assert from "node:assert/strict";

import {
  createLocalRoomSession,
  createLocalRoomTransport,
  getLocalRoomClientView,
  getLocalRoomSessionToken,
  joinLocalRoomSession,
  startLocalRoomRound,
  takeLocalRoomSeat,
  toggleLocalRoomReady,
  type LocalRoomTransportState,
} from "../../src/localRoomTransport.ts";

test("local room transport drives room lifecycle through socket adapter snapshots", () => {
  let transport = createLocalRoomTransport({ roomId: "local-transport-room", seed: "local-transport-seed" });

  assert.equal(transport.room.members.length, 0);

  const host = createLocalRoomSession(transport, { displayName: "Player One" });
  transport = host.state;

  assert.doesNotMatch(getLocalRoomSessionToken(transport, "player-1") ?? "", /^session-\d+$/);
  assert.equal(transport.room.members.length, 1);
  assert.equal(getLocalRoomClientView(transport, "player-1").localSeatId, null);

  transport = seatAndReady(transport, "player-1", 0);

  for (const [index, displayName] of ["Player Two", "Player Three", "Player Four"].entries()) {
    const joined = joinLocalRoomSession(transport, { displayName });
    transport = joined.state;
    transport = seatAndReady(transport, `player-${index + 2}`, (index + 1) as 1 | 2 | 3);
  }

  const started = startLocalRoomRound(transport, "player-1", 0);
  transport = started.state;

  assert.equal(started.rejectedMessages.length, 0);
  assert.equal(transport.room.round?.players[0].hand.length, 14);

  const playerOneView = getLocalRoomClientView(transport, "player-1");
  const playerTwoView = getLocalRoomClientView(transport, "player-2");

  assert.equal(playerOneView.round?.players[0].hand?.length, 14);
  assert.equal(playerOneView.round?.players[1].hand, null);
  assert.equal(playerTwoView.round?.players[0].hand, null);
  assert.equal(playerTwoView.round?.players[1].hand?.length, 13);
});

function seatAndReady(
  transport: LocalRoomTransportState,
  playerId: string,
  seatId: 0 | 1 | 2 | 3,
): LocalRoomTransportState {
  const seated = takeLocalRoomSeat(transport, playerId, seatId);
  assert.equal(seated.rejectedMessages.length, 0);

  const ready = toggleLocalRoomReady(seated.state, playerId);
  assert.equal(ready.rejectedMessages.length, 0);

  return ready.state;
}
