import type {
  ClientVisibleRoomState,
  MobilePublicEvent,
  MobileSettlementSummary,
  SeatId,
  Suit,
  Tile,
} from "./contract.ts";
import { suitLabel, tileLabel } from "./roomViewModel.ts";

export type MobileTimelineItem = {
  eventId: number;
  text: string;
};

export type MobileSettlementItem = {
  category: "hu" | "chicken" | "gang" | "chaJiao";
  label: string;
  text: string;
  points: number;
};

export type MobileRoundResultViewModel = {
  reason: "onePlayerLeft" | "wallEmpty";
  reasonLabel: string;
  scores: Array<{
    seatId: SeatId;
    displayName: string;
    points: number;
    isLocal: boolean;
  }>;
  settlements: MobileSettlementItem[];
};

export function toMobileTimelineItems(
  events: readonly MobilePublicEvent[],
  view: ClientVisibleRoomState | null,
): MobileTimelineItem[] {
  return events.map((event) => ({
    eventId: event.eventId,
    text: mobilePublicEventText(event, view),
  }));
}

export function toMobileRoundResultViewModel(
  view: ClientVisibleRoomState | null,
): MobileRoundResultViewModel | null {
  if (view?.roundEnd === null || view?.roundEnd === undefined) {
    return null;
  }

  return {
    reason: view.roundEnd.reason,
    reasonLabel: view.roundEnd.reason === "wallEmpty"
      ? "牌墙已空，流局并完成查叫"
      : "血战结束，仅剩一位未胡",
    scores: view.scores
      .map((score) => ({
        seatId: score.seatId,
        displayName: seatName(view, score.seatId),
        points: score.points,
        isLocal: view.localSeatId === score.seatId,
      }))
      .sort((left, right) => right.points - left.points || left.seatId - right.seatId),
    settlements: view.settlementLedger.map((entry) => settlementItem(entry, view)),
  };
}

function mobilePublicEventText(event: MobilePublicEvent, view: ClientVisibleRoomState | null): string {
  switch (event.type) {
    case "playerJoined":
      return `${event.displayName} 加入房间`;
    case "seatTaken":
      return `${playerName(view, event.playerId)} 坐到座位 ${event.seatId + 1}`;
    case "readyChanged":
      return `${seatName(view, event.seatId)} ${event.ready ? "已准备" : "取消准备"}`;
    case "missingSuitChosen":
      return `${seatName(view, event.seatId)} ${event.automatic ? "天缺自动定缺" : "定缺"}${suitLabel(event.suit)}`;
    case "tileDiscarded":
      return `${seatName(view, event.seatId)} 打出 ${tileLabel(event.tile)}`;
    case "pengClaimed":
      return `${seatName(view, event.seatId)} 碰 ${tileLabel(event.tile)}`;
    case "mingGangClaimed":
      return `${seatName(view, event.seatId)} 明杠 ${tileLabel(event.tile)}`;
    case "anGangClaimed":
      return `${seatName(view, event.seatId)} 暗杠${event.usesLaizi ? "（含幺鸡）" : ""}`;
    case "baGangClaimed":
      return `${seatName(view, event.seatId)} 巴杠 ${tileLabel(event.tile)}`;
    case "huClaimed":
      return `${seatName(view, event.seatId)} 点炮胡 ${tileLabel(event.tile)}，${event.points} 分`;
    case "selfDrawHuClaimed":
      return `${seatName(view, event.seatId)} 自摸胡，${event.points} 分`;
    case "qiangGangHuClaimed":
      return `${seatName(view, event.seatId)} 抢杠胡 ${tileLabel(event.tile)}，${event.points} 分`;
    case "presenceChanged":
      return `${playerName(view, event.playerId)} ${event.connected ? "已恢复在线" : "已离线"}`;
    case "roundEnded":
      return event.reason === "wallEmpty" ? "牌墙已空，本局结束" : "仅剩一位未胡，本局结束";
  }
}

function settlementItem(
  entry: MobileSettlementSummary,
  view: ClientVisibleRoomState,
): MobileSettlementItem {
  const payer = seatName(view, entry.loserSeatId);
  const payee = seatName(view, entry.winnerSeatId);
  const label = settlementLabel(entry);
  return {
    category: settlementCategory(entry),
    label,
    text: `${payer} 向 ${payee} 支付 ${entry.finalPoints} 分`,
    points: entry.finalPoints,
  };
}

function settlementCategory(entry: MobileSettlementSummary): MobileSettlementItem["category"] {
  if (entry.reason === "selfDrawHu" || entry.reason === "discardHu" || entry.reason === "qiangGangHu") {
    return "hu";
  }
  if (entry.reason === "sanJi" || entry.reason === "siJi" || entry.reason === "qiangGangSanJiLiability") {
    return "chicken";
  }
  if (entry.reason === "mingGang" || entry.reason === "anGang" || entry.reason === "baGang") {
    return "gang";
  }
  return "chaJiao";
}

function settlementLabel(entry: MobileSettlementSummary): string {
  switch (entry.reason) {
    case "selfDrawHu":
      return "自摸";
    case "discardHu":
      return "点炮";
    case "qiangGangHu":
      return "抢杠胡";
    case "sanJi":
      return `${chickenSuitLabel(entry.chickenSuit)}三鸡`;
    case "siJi":
      return `${chickenSuitLabel(entry.chickenSuit)}四鸡`;
    case "qiangGangSanJiLiability":
      return `${chickenSuitLabel(entry.chickenSuit)}抢杠三鸡全责`;
    case "mingGang":
      return `明杠${publicGangTile(entry.targetTile)}`;
    case "anGang":
      return `暗杠${entry.usesLaizi ? "（含幺鸡）" : ""}`;
    case "baGang":
      return `巴杠${publicGangTile(entry.targetTile)}`;
    case "chaJiao":
      return "查叫";
  }
}

function publicGangTile(value: Tile | null): string {
  return value === null ? "" : ` ${tileLabel(value)}`;
}

function chickenSuitLabel(value: Extract<Suit, "bamboos" | "dots">): string {
  return value === "bamboos" ? "一条" : "一筒";
}

function seatName(view: ClientVisibleRoomState | null, seatId: SeatId): string {
  return view?.seats[seatId]?.displayName ?? `座位 ${seatId + 1}`;
}

function playerName(view: ClientVisibleRoomState | null, playerId: string): string {
  return view?.seats.find((seat) => seat.playerId === playerId)?.displayName ?? playerId;
}
