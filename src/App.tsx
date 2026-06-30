import { useMemo, useState } from "react";
import {
  checkCurrentPlayerHu,
  checkDiscardHu,
  discardTile,
  drawTile,
  startRound,
  type PlayerState,
  type RoundState,
  type Suit,
  type Tile,
} from "./game/index.ts";

const seed = "portfolio-demo-001";
const missingSuits: Suit[] = ["bamboos", "dots", "characters", "bamboos"];

type LogEntry = {
  id: number;
  text: string;
};

function createDemoRound(): RoundState {
  const round = startRound({ seed, dealer: 0 });

  return {
    ...round,
    players: round.players.map((player, index) => ({
      ...player,
      missingSuit: missingSuits[index],
    })),
  };
}

export function App() {
  const [round, setRound] = useState(createDemoRound);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, text: `牌局已按固定种子 ${seed} 开始。当前原型已预设定缺。` },
  ]);
  const currentPlayer = round.players[round.currentPlayer];
  const currentHu = checkCurrentPlayerHu(round);
  const lastLogId = logs.at(-1)?.id ?? 1;
  const phase = getTurnPhase(currentPlayer);

  const totalDiscards = useMemo(
    () => round.players.reduce((sum, player) => sum + player.discards.length, 0),
    [round.players],
  );

  function addLog(text: string) {
    setLogs((items) => [{ id: (items.at(-1)?.id ?? 0) + 1, text }, ...items].slice(0, 8));
  }

  function handleReset() {
    setRound(createDemoRound());
    setLogs([{ id: lastLogId + 1, text: `牌局已重置，仍使用固定种子 ${seed}。` }]);
  }

  function handleDraw() {
    if (phase === "discard") {
      addLog(`玩家 ${round.currentPlayer + 1} 当前应先出牌。`);
      return;
    }

    const result = drawTile(round);

    if (!result.ok) {
      addLog(`摸牌失败：${reasonText(result.reason)}。`);
      return;
    }

    setRound(result.round);
    addLog(`玩家 ${round.currentPlayer + 1} 摸到 ${tileText(result.tile)}，现在必须出牌。`);
  }

  function handleDiscard(tile: Tile) {
    if (phase === "draw") {
      addLog(`玩家 ${round.currentPlayer + 1} 当前应先摸牌。`);
      return;
    }

    const result = discardTile(round, round.currentPlayer, tile);

    if (!result.ok) {
      addLog(`打出 ${tileText(tile)} 失败：${reasonText(result.reason)}。`);
      return;
    }

    const discardChecks = result.round.players
      .filter((player) => player.id !== round.currentPlayer && !player.hasWon)
      .map((player) => ({ player, check: checkDiscardHu(round, player.id, tile) }))
      .filter(({ check }) => check.canHu);

    setRound(result.round);

    if (discardChecks.length > 0) {
      addLog(
        `玩家 ${round.currentPlayer + 1} 打出 ${tileText(tile)}。${discardChecks
          .map(({ player, check }) => `玩家 ${player.id + 1} 可胡，${check.canHu ? check.score.cappedPoints : 0} 分`)
          .join("；")}。`,
      );
    } else {
      addLog(`玩家 ${round.currentPlayer + 1} 打出 ${tileText(tile)}。轮到玩家 ${result.nextPlayer + 1}。`);
    }
  }

  return (
    <main className="app-shell">
      <section className="table-area" aria-label="Leshan Mahjong table">
        <header className="top-bar">
          <div>
            <h1>Leshan Mahjong Lab</h1>
            <p>乐山八鸡赖子麻将原型</p>
          </div>
          <div className="round-stats">
            <Stat label="当前" value={`玩家 ${round.currentPlayer + 1}`} />
            <Stat label="牌墙" value={round.wall.length.toString()} />
            <Stat label="弃牌" value={totalDiscards.toString()} />
          </div>
        </header>

        <div className="seats">
          {round.players.map((player) => (
            <PlayerSeat key={player.id} player={player} current={player.id === round.currentPlayer} />
          ))}
        </div>

        <section className="action-panel" aria-label="Current player actions">
          <div>
            <h2>玩家 {currentPlayer.id + 1} 手牌</h2>
            <p>定缺：{suitText(currentPlayer.missingSuit)}</p>
          </div>
          <div className="actions">
            <button type="button" onClick={handleDraw} disabled={phase === "discard"}>摸牌</button>
            <button type="button" onClick={handleReset}>重置</button>
          </div>
          <div className="turn-hint" data-phase={phase}>
            {phase === "discard" ? "已摸牌，请点击一张手牌打出。" : "请先摸牌，再选择要打出的牌。"}
          </div>
          <div className="hu-status" data-ready={currentHu.canHu}>
            {currentHu.canHu
              ? `可自摸胡：${currentHu.score.cappedPoints} 分，牌型 ${currentHu.patterns.map(patternText).join("、")}`
              : `暂不能自摸：${reasonText(currentHu.reason)}`}
          </div>
          <div className="hand">
            {currentPlayer.hand.map((tile, index) => (
              <button
                className="tile"
                key={`${tileText(tile)}-${index}`}
                type="button"
                onClick={() => handleDiscard(tile)}
                title={`打出 ${tileText(tile)}`}
                data-yaoji={isYaoJiTile(tile)}
              >
                <span>{tile.rank}</span>
                <small>{suitText(tile.suit)}</small>
              </button>
            ))}
          </div>
        </section>
      </section>

      <aside className="log-panel" aria-label="Round log">
        <h2>牌局记录</h2>
        <div className="log-list">
          {logs.map((log) => (
            <p key={log.id}>{log.text}</p>
          ))}
        </div>
      </aside>
    </main>
  );
}

function PlayerSeat({ player, current }: { player: PlayerState; current: boolean }) {
  return (
    <article className="seat" data-current={current}>
      <div className="seat-title">
        <h2>玩家 {player.id + 1}</h2>
        <span>{current ? "当前行动" : "等待"}</span>
      </div>
      <div className="seat-meta">
        <span>{player.hand.length} 张手牌</span>
        <span>定缺 {suitText(player.missingSuit)}</span>
      </div>
      <div className="discard-strip">
        {player.discards.length === 0 ? (
          <span className="empty">暂无弃牌</span>
        ) : (
          player.discards.map((tile, index) => (
            <span className="discard-tile" key={`${tileText(tile)}-${index}`}>
              {tileText(tile)}
            </span>
          ))
        )}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function suitText(suit: Suit | null): string {
  if (suit === null) {
    return "未定";
  }

  const names: Record<Suit, string> = {
    characters: "万",
    dots: "筒",
    bamboos: "条",
  };
  return names[suit];
}

function tileText(tile: Tile): string {
  return `${tile.rank}${suitText(tile.suit)}`;
}

function isYaoJiTile(tile: Tile): boolean {
  return tile.rank === 1 && (tile.suit === "bamboos" || tile.suit === "dots");
}

function getTurnPhase(player: PlayerState): "draw" | "discard" {
  return player.hand.length % 3 === 1 ? "draw" : "discard";
}

function reasonText(reason: string | undefined): string {
  const reasons: Record<string, string> = {
    wallEmpty: "牌墙已空",
    playerAlreadyWon: "该玩家已经胡牌",
    notCurrentPlayer: "还没轮到该玩家",
    missingSuitNotSet: "尚未定缺",
    tileNotInHand: "手里没有这张牌",
    mustDiscardMissingSuitFirst: "手里还有缺门牌，必须先打缺门",
    cannotDiscardYaoJi: "幺鸡/赖子不能主动打出",
    invalidTileCount: "手牌张数不符合胡牌结构",
    invalidMeldCount: "副露组数不合法",
    tooManyCopies: "同一普通牌数量超过四张",
    cannotDecompose: "暂时无法拆成四组一对",
    hasMissingSuitTile: "手里还有缺门牌，不能胡",
    belowMinimumScore: "不足 2 分，不能胡",
  };
  return reasons[reason ?? ""] ?? "原因待确认";
}

function patternText(pattern: string): string {
  const names: Record<string, string> = {
    pingHu: "平胡",
    wuJi: "无鸡",
    qingYiSe: "清一色",
    daDui: "大对",
    danDiao: "单调",
    xiaoQiDui: "小七对",
    longQiDui: "龙七对",
    shuangLongQiDui: "双龙七",
  };
  return names[pattern] ?? pattern;
}
