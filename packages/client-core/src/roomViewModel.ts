import type {
  ClientActionDescriptor,
  ClientLegalAction,
  ClientResponseChoice,
  ClientVisibleMeld,
  ClientVisibleResponseWindow,
  ClientVisibleRoomState,
  PlayerId,
  Suit,
  Tile,
} from "./contract.ts";

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
  actionDescriptors: ClientActionDescriptor[];
  localSeatId: PlayerId | null;
  wallCount: number | null;
  pendingResponderCount: number;
  hasRespondedByMe: boolean;
  responseByMe: ClientResponseChoice | null;
  responseWindow: ClientVisibleResponseWindow | null;
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
    actionDescriptors: view.actionDescriptors.map(cloneActionDescriptor),
    localSeatId: view.localSeatId,
    wallCount: view.round?.wallCount ?? null,
    pendingResponderCount: view.responseWindow?.pendingResponderCount ?? 0,
    hasRespondedByMe: view.responseWindow?.hasRespondedByMe ?? false,
    responseByMe: view.responseWindow?.responseByMe ?? null,
    responseWindow: view.responseWindow === null ? null : { ...view.responseWindow },
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

export function descriptorForAction(
  view: ClientVisibleRoomState | ClientRoomViewModel | null,
  action: ClientLegalAction,
): ClientActionDescriptor | null {
  return view?.actionDescriptors.find((descriptor) => descriptor.action === action) ?? null;
}

export function legalTilesForAction(
  view: ClientVisibleRoomState | ClientRoomViewModel | null,
  action: "discardTile" | "claimAnGang" | "claimBaGang",
): Tile[] {
  const descriptor = descriptorForAction(view, action);
  return descriptor !== null && "tiles" in descriptor ? descriptor.tiles.map(cloneTile) : [];
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
    type: meld.type,
    tile: cloneTile(meld.tile),
    tiles: meld.tiles.map(cloneTile),
    fromPlayer: meld.fromPlayer,
  };
}

function cloneActionDescriptor(descriptor: ClientActionDescriptor): ClientActionDescriptor {
  if (descriptor.action === "takeSeat") {
    return { ...descriptor, seatIds: [...descriptor.seatIds] };
  }
  if (descriptor.action === "chooseMissingSuit") {
    return { ...descriptor, suits: [...descriptor.suits] };
  }
  if (descriptor.action === "discardTile" || descriptor.action === "claimAnGang" || descriptor.action === "claimBaGang") {
    return { ...descriptor, tiles: descriptor.tiles.map(cloneTile) };
  }
  return { ...descriptor };
}
