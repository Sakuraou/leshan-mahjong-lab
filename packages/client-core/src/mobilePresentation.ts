import type {
  ClientLegalAction,
  ClientVisibleRoomState,
  MobilePublicEvent,
  MobileSettlementSummary,
  NextDealerReason,
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
  roundNumber: number;
  reason: "onePlayerLeft" | "wallEmpty";
  reasonLabel: string;
  nextDealer: {
    seatId: SeatId;
    displayName: string;
    reasonLabel: string;
  };
  gameFinished: boolean;
  scores: Array<{
    seatId: SeatId;
    displayName: string;
    roundDelta: number;
    cumulativePoints: number;
    isLocal: boolean;
  }>;
  settlements: MobileSettlementItem[];
  history: Array<{
    roundNumber: number;
    dealerName: string;
    nextDealerName: string;
    scoreText: string;
  }>;
};

export type MobileIntermissionViewModel = {
  readySeats: Array<{ seatId: SeatId; displayName: string; ready: boolean }>;
  actions: Array<{
    action: Extract<ClientLegalAction, "readyNextRound" | "startNextRound" | "finishGame">;
    actionId: string;
  }>;
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

  const latestRound = view.roundHistory.find((entry) => entry.roundNumber === view.roundNumber);
  if (latestRound === undefined || view.nextDealerDecision === null) {
    return null;
  }

  return {
    roundNumber: view.roundNumber,
    reason: view.roundEnd.reason,
    reasonLabel: view.roundEnd.reason === "wallEmpty"
      ? "牌墙已空，流局并完成查叫"
      : "血战结束，仅剩一位未胡",
    nextDealer: {
      seatId: view.nextDealerDecision.nextDealerSeatId,
      displayName: seatName(view, view.nextDealerDecision.nextDealerSeatId),
      reasonLabel: nextDealerReasonLabel(view.nextDealerDecision.reason),
    },
    gameFinished: view.gameStatus === "finished",
    scores: latestRound.scoreDeltas
      .map((score) => ({
        seatId: score.seatId,
        displayName: seatName(view, score.seatId),
        roundDelta: score.delta,
        cumulativePoints: score.afterPoints,
        isLocal: view.localSeatId === score.seatId,
      }))
      .sort((left, right) => right.cumulativePoints - left.cumulativePoints || left.seatId - right.seatId),
    settlements: view.settlementLedger.map((entry) => settlementItem(entry, view)),
    history: [...view.roundHistory]
      .sort((left, right) => left.roundNumber - right.roundNumber)
      .map((entry) => ({
        roundNumber: entry.roundNumber,
        dealerName: seatName(view, entry.dealerSeatId),
        nextDealerName: seatName(view, entry.nextDealerDecision.nextDealerSeatId),
        scoreText: entry.scoreDeltas
          .map((score) => `${seatName(view, score.seatId)} ${signedPoints(score.delta)}`)
          .join(" · "),
      })),
  };
}

export function toMobileIntermissionViewModel(
  view: ClientVisibleRoomState | null,
): MobileIntermissionViewModel | null {
  if (view?.gameStatus !== "betweenRounds") {
    return null;
  }

  const intermissionActions = new Set(["readyNextRound", "startNextRound", "finishGame"] as const);
  return {
    readySeats: view.seats.map((seat) => ({
      seatId: seat.seatId,
      displayName: seat.displayName ?? `座位 ${seat.seatId + 1}`,
      ready: seat.ready,
    })),
    actions: view.actionDescriptors.flatMap((descriptor) =>
      intermissionActions.has(descriptor.action as "readyNextRound" | "startNextRound" | "finishGame") &&
      view.legalActions.includes(descriptor.action)
        ? [{
            action: descriptor.action as "readyNextRound" | "startNextRound" | "finishGame",
            actionId: descriptor.actionId,
          }]
        : [],
    ),
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
    case "gangYaoJiExchanged":
      return event.targetTile === null
        ? `${seatName(view, event.seatId)} 完成暗杠换幺鸡`
        : `${seatName(view, event.seatId)} 从 ${tileLabel(event.targetTile)} 杠中换回幺鸡`;
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
    case "nextDealerDecided":
      return `下一局由${seatName(view, event.nextDealerSeatId)}坐庄（${nextDealerReasonLabel(event.reason)}）`;
    case "gameFinished":
      return `${seatName(view, event.finishedBySeatId)}结束整场，共完成 ${event.completedRoundCount} 局`;
  }
}

export function nextDealerReasonLabel(reason: NextDealerReason): string {
  switch (reason) {
    case "qiangGangDeclarer":
      return "被抢杠者坐庄";
    case "multipleHuDiscarder":
      return "一炮多响点炮者坐庄";
    case "firstWinner":
      return "本局第一个胡牌者坐庄";
    case "wallEmptyDealerKeeps":
      return "无人胡牌，原庄连庄";
  }
}

function signedPoints(points: number): string {
  return `${points > 0 ? "+" : ""}${points}`;
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
