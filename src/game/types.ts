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

export type PlayerState = {
  id: PlayerId;
  hand: Tile[];
  discards: Tile[];
  hasWon: boolean;
};

export type RoundState = {
  seed: string;
  dealer: PlayerId;
  players: PlayerState[];
  wall: Tile[];
  currentPlayer: PlayerId;
};
