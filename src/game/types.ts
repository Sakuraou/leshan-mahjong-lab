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

