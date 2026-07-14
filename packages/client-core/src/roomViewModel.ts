import type {
  ClientLegalAction,
  ClientResponseChoice,
  ClientVisibleMeld,
  ClientVisibleRoomState,
} from "../../../src/game/room.ts";
import type { PlayerId, Suit, Tile } from "../../../src/game/types.ts";

export type ClientSeatViewModel = {
  seatId: PlayerId;
  playerId: string | null;
  displayName: string;
  connected: boolean;
  ready: boolean;
  score: number;
  isLocal: boolean;
  isDealer: boolean;
  isCurrentPlayer: boolean;
  hand: Tile[] | null;
  handCount: number;
  discards: Tile[];
  melds: ClientVisibleMeld[];
  hasWon: boolean;
  missingSuit: Suit | null;
};

export type ClientRoomViewModel = {
  roomId: string;
  status: ClientVisibleRoomState["status"];
  phase: ClientVisibleRoomState["phase"];
  legalActions: ClientLegalAction[];
  localSeatId: PlayerId | null;
  wallCount: number | null;
  pendingResponderCount: number;
  hasRespondedByMe: boolean;
  responseByMe: ClientResponseChoice | null;
  seats: ClientSeatViewModel[];
};

const suitOrder: Record<Suit, number> = {
  bamboos: 0,
  dots: 1,
  characters: 2,
};

export function toClientRoomViewModel(view: ClientVisibleRoomState): ClientRoomViewModel {
  return {
    roomId: view.id,
    status: view.status,
    phase: view.phase,
    legalActions: [...view.legalActions],
    localSeatId: view.localSeatId,
    wallCount: view.round?.wallCount ?? null,
    pendingResponderCount: view.responseWindow?.pendingResponderCount ?? 0,
    hasRespondedByMe: view.responseWindow?.hasRespondedByMe ?? false,
    responseByMe: view.responseWindow?.responseByMe ?? null,
    seats: view.seats.map((seat) => {
      const player = view.round?.players[seat.seatId];
      const score = view.scores.find((entry) => entry.seatId === seat.seatId)?.points ?? 0;

      return {
        seatId: seat.seatId,
        playerId: seat.playerId,
        displayName: seat.displayName ?? `座位 ${seat.seatId + 1}`,
        connected: seat.connected,
        ready: seat.ready,
        score,
        isLocal: view.localSeatId === seat.seatId,
        isDealer: view.round?.dealer === seat.seatId,
        isCurrentPlayer: view.round?.currentPlayer === seat.seatId,
        hand: player?.hand === null || player?.hand === undefined ? null : sortTilesForHand(player.hand),
        handCount: player?.handCount ?? 0,
        discards: player?.discards.map(cloneTile) ?? [],
        melds: player?.melds.map(cloneMeld) ?? [],
        hasWon: player?.hasWon ?? false,
        missingSuit: player?.missingSuit ?? null,
      };
    }),
  };
}

export function canUseAction(
  view: ClientVisibleRoomState | ClientRoomViewModel | null,
  action: ClientLegalAction,
): boolean {
  return view?.legalActions.includes(action) ?? false;
}

export function sortTilesForHand(tiles: Tile[]): Tile[] {
  return tiles.map(cloneTile).sort((left, right) => {
    const suitDifference = suitOrder[left.suit] - suitOrder[right.suit];
    return suitDifference === 0 ? left.rank - right.rank : suitDifference;
  });
}

export function suitLabel(suit: Suit | null): string {
  if (suit === "bamboos") {
    return "条";
  }

  if (suit === "dots") {
    return "筒";
  }

  if (suit === "characters") {
    return "万";
  }

  return "未定";
}

export function tileLabel(tile: Tile): string {
  return `${tile.rank}${suitLabel(tile.suit)}`;
}

function cloneTile(tile: Tile): Tile {
  return { suit: tile.suit, rank: tile.rank };
}

function cloneMeld(meld: ClientVisibleMeld): ClientVisibleMeld {
  if (meld.type === "anGang" && meld.tile === null) {
    return { type: "anGang", tile: null, tiles: [], fromPlayer: null };
  }

  return {
    ...meld,
    tile: cloneTile(meld.tile),
    tiles: meld.tiles.map(cloneTile),
  };
}
