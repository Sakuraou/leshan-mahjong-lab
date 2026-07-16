import type { ClientOwnedTile, Suit } from "./contract.ts";

const suitOrder: Record<Suit, number> = {
  bamboos: 0,
  dots: 1,
  characters: 2,
};

export function reconcileMobileHandOrder(
  previousTileIds: readonly string[],
  incomingTiles: readonly ClientOwnedTile[],
): string[] {
  const incomingById = new Map(incomingTiles.map((tile) => [tile.tileId, tile]));
  const retained = previousTileIds.filter((tileId) => incomingById.has(tileId));
  const retainedSet = new Set(retained);
  const additions = incomingTiles
    .filter((tile) => !retainedSet.has(tile.tileId))
    .sort(compareOwnedTiles);

  if (retained.length === 0) {
    return incomingTiles.map(cloneOwnedTile).sort(compareOwnedTiles).map((tile) => tile.tileId);
  }

  const next = [...retained];
  for (const addition of additions) {
    const insertionIndex = next.findIndex((tileId) => {
      const current = incomingById.get(tileId);
      return current !== undefined && compareOwnedTiles(addition, current) < 0;
    });
    if (insertionIndex < 0) {
      next.push(addition.tileId);
    } else {
      next.splice(insertionIndex, 0, addition.tileId);
    }
  }
  return next;
}

export function orderMobileHand(
  tiles: readonly ClientOwnedTile[],
  tileIds: readonly string[],
): ClientOwnedTile[] {
  const tilesById = new Map(tiles.map((tile) => [tile.tileId, tile]));
  const ordered = tileIds
    .map((tileId) => tilesById.get(tileId))
    .filter((tile): tile is ClientOwnedTile => tile !== undefined)
    .map(cloneOwnedTile);
  const included = new Set(ordered.map((tile) => tile.tileId));
  return [...ordered, ...tiles.filter((tile) => !included.has(tile.tileId)).map(cloneOwnedTile)];
}

export function moveMobileHandTile(
  tileIds: readonly string[],
  movingTileId: string,
  targetTileId: string,
): string[] {
  const fromIndex = tileIds.indexOf(movingTileId);
  const toIndex = tileIds.indexOf(targetTileId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return [...tileIds];
  }

  const next = [...tileIds];
  const [moving] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moving);
  return next;
}

function compareOwnedTiles(left: ClientOwnedTile, right: ClientOwnedTile): number {
  const suitDifference = suitOrder[left.suit] - suitOrder[right.suit];
  if (suitDifference !== 0) {
    return suitDifference;
  }
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  return left.tileId.localeCompare(right.tileId);
}

function cloneOwnedTile(tile: ClientOwnedTile): ClientOwnedTile {
  return { suit: tile.suit, rank: tile.rank, tileId: tile.tileId };
}
