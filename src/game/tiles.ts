import type { PhysicalTile, Rank, Suit, Tile } from "./types.ts";

export const SUITS: Suit[] = ["characters", "dots", "bamboos"];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const suitLabels: Record<Suit, string> = {
  characters: "wan",
  dots: "dot",
  bamboos: "bamboo",
};

export function tile(suit: Suit, rank: Rank): Tile {
  return { suit, rank };
}

export function tileKey(value: Tile): string {
  return `${value.suit}:${value.rank}`;
}

export function sameTile(left: Tile, right: Tile): boolean {
  return left.suit === right.suit && left.rank === right.rank;
}

export function samePhysicalTile(left: PhysicalTile, right: PhysicalTile): boolean {
  if (left.instanceId !== undefined && right.instanceId !== undefined) {
    return left.instanceId === right.instanceId;
  }

  return sameTile(left, right);
}

export function tileFace(value: Tile): Tile {
  return { suit: value.suit, rank: value.rank };
}

export function tileLabel(value: Tile): string {
  return `${value.rank} ${suitLabels[value.suit]}`;
}

export function isYaoJi(value: Tile): boolean {
  return value.rank === 1 && (value.suit === "bamboos" || value.suit === "dots");
}

export function isOrdinaryMissingSuitTile(value: Tile, missingSuit: Suit): boolean {
  return value.suit === missingSuit && !isYaoJi(value);
}

export function createWall(): Tile[] {
  return SUITS.flatMap((suit) =>
    RANKS.flatMap((rank) => Array.from({ length: 4 }, () => tile(suit, rank))),
  );
}

export function countTile(values: Tile[], target: Tile): number {
  return values.filter((value) => sameTile(value, target)).length;
}

export function containsTile(values: Tile[], target: Tile): boolean {
  return countTile(values, target) > 0;
}
