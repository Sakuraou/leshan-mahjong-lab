export type Suit = "characters" | "dots" | "bamboos";

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Tile = {
  suit: Suit;
  rank: Rank;
};

export type GangType = "mingGang" | "anGang" | "baGang";

export type WinMethod = "discard" | "selfDraw";

export type ScorePattern =
  | "pingHu"
  | "daDui"
  | "danDiao"
  | "qingYiSe"
  | "xiaoQiDui"
  | "longQiDui"
  | "shuangLongQiDui"
  | "wuJi";

export type PatternScore = {
  pattern: ScorePattern;
  fan: number;
  multiplier: number;
};

export type PlayerId = 0 | 1 | 2 | 3;

export type Meld = {
  type: "peng" | "mingGang" | "anGang" | "baGang";
  // Logical target value after resolving any laizi used by the meld.
  tile: Tile;
  // Original physical tiles, retained for wu ji and chicken settlement.
  tiles: Tile[];
  fromPlayer: PlayerId | null;
};

export type PlayerState = {
  id: PlayerId;
  hand: Tile[];
  discards: Tile[];
  melds: Meld[];
  hasWon: boolean;
  missingSuit: Suit | null;
};

export type RoundState = {
  seed: string;
  dealer: PlayerId;
  players: PlayerState[];
  wall: Tile[];
  currentPlayer: PlayerId;
};
