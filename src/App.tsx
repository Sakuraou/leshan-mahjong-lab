import { useEffect, useMemo, useRef, useState } from "react";
import {
  checkCurrentPlayerHu,
  checkDiscardHu,
  discardTile,
  drawTile,
  startRound,
  type PlayerId,
  type PlayerState,
  type RoundState,
  type Suit,
  type Tile,
} from "./game/index.ts";

const seed = "portfolio-demo-001";
const localPlayerId: PlayerId = 0;
const suitOrder: Suit[] = ["bamboos", "dots", "characters"];

type LogEntry = {
  id: number;
  text: string;
};

type TurnPhase = "chooseMissingSuit" | "draw" | "discard";

function createDemoRound(): RoundState {
  const round = startRound({ seed, dealer: 0 });

  return {
    ...round,
    players: round.players.map((player) => ({
      ...player,
      missingSuit: player.id === localPlayerId ? detectHeavenlyMissingSuit(player.hand) : null,
    })),
  };
}

export function App() {
  const [round, setRound] = useState(createDemoRound);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 1,
      text: `牌局已按固定种子 ${seed} 开始。当前原型只操作自己的座位，其他座位代表未来联机玩家。`,
    },
  ]);
  const autoDrawKeys = useRef(new Set<string>());

  const currentPlayer = round.players[round.currentPlayer];
  const localPlayer = round.players[localPlayerId];
  const currentPhase = getTurnPhase(currentPlayer);
  const localPhase = getTurnPhase(localPlayer);
  const isLocalTurn = round.currentPlayer === localPlayerId;
  const currentHu = isLocalTurn ? checkCurrentPlayerHu(round) : null;
  const sortedLocalHand = useMemo(() => sortHand(localPlayer.hand), [localPlayer.hand]);

  const totalDiscards = useMemo(
    () => round.players.reduce((sum, player) => sum + player.discards.length, 0),
    [round.players],
  );

  useEffect(() => {
    const player = round.players[round.currentPlayer];

    if (getTurnPhase(player) !== "draw") {
      return;
    }

    const autoDrawKey = `${round.currentPlayer}:${round.wall.length}:${player.hand.length}:${player.discards.length}`;

    if (autoDrawKeys.current.has(autoDrawKey)) {
      return;
    }

    autoDrawKeys.current.add(autoDrawKey);

    const result = drawTile(round);

    if (!result.ok) {
      addLog(`系统摸牌失败：${reasonText(result.reason)}。`);
      return;
    }

    setRound(result.round);
    addLog(`系统给玩家 ${player.id + 1} 发了一张牌。${player.id === localPlayerId ? "轮到你出牌。" : "等待该玩家出牌。"}`);
  }, [round]);

  function addLog(text: string) {
    setLogs((items) => [{ id: (items.at(-1)?.id ?? 0) + 1, text }, ...items].slice(0, 9));
  }

  function handleReset() {
    autoDrawKeys.current.clear();
    setRound(createDemoRound());
    setLogs((items) => [
      {
        id: (items.at(-1)?.id ?? 0) + 1,
        text: `牌局已重置。你需要先选择定缺，除非起手天缺。`,
      },
    ]);
  }

  function handleChooseMissingSuit(suit: Suit) {
    setRound((value) => updatePlayer(value, localPlayerId, { ...value.players[localPlayerId], missingSuit: suit }));
    addLog(`你选择定缺 ${suitText(suit)}。`);
  }

  function handleDiscard(tile: Tile) {
    if (!isLocalTurn) {
      addLog(`现在是玩家 ${round.currentPlayer + 1} 的回合，联机模式下只能操作自己的座位。`);
      return;
    }

    if (localPhase === "chooseMissingSuit") {
      addLog("请先选择定缺，再开始出牌。");
      return;
    }

    if (localPhase === "draw") {
      addLog("系统会自动给你摸牌，请稍等。");
      return;
    }

    const result = discardTile(round, localPlayerId, tile);

    if (!result.ok) {
      addLog(`打出 ${tileText(tile)} 失败：${reasonText(result.reason)}。`);
      return;
    }

    const discardChecks = result.round.players
      .filter((player) => player.id !== localPlayerId && !player.hasWon)
      .map((player) => ({ player, check: checkDiscardHu(round, player.id, tile) }))
      .filter(({ check }) => check.canHu);

    setRound(result.round);

    if (discardChecks.length > 0) {
      addLog(
        `你打出 ${tileText(tile)}。${discardChecks
          .map(({ player, check }) => `玩家 ${player.id + 1} 可胡 ${check.canHu ? check.score.cappedPoints : 0} 分`)
          .join("；")}。`,
      );
      return;
    }

    addLog(`你打出 ${tileText(tile)}。轮到玩家 ${result.nextPlayer + 1}。`);
  }

  function handleAdvanceRemoteTurn() {
    if (isLocalTurn) {
      addLog("现在轮到你，不需要模拟远端玩家。");
      return;
    }

    const result = advanceRemoteTurn(round);
    setRound(result.round);
    result.logs.forEach(addLog);
  }

  return (
    <main className="app-shell">
      <section className="table-area" aria-label="乐山麻将牌桌">
        <header className="top-bar">
          <div>
            <h1>乐山麻将 Lab</h1>
            <p>八鸡赖子规则的联机桌原型</p>
          </div>
          <div className="round-stats">
            <Stat label="我的座位" value={`玩家 ${localPlayerId + 1}`} />
            <Stat label="当前回合" value={`玩家 ${round.currentPlayer + 1}`} />
            <Stat label="牌墙" value={round.wall.length.toString()} />
            <Stat label="弃牌" value={totalDiscards.toString()} />
          </div>
        </header>

        <div className="mode-banner">
          <strong>联机设计方向</strong>
          <span>你只控制自己的座位；摸牌由系统自动发；其他玩家未来由远端真人操作。</span>
        </div>

        <div className="seats">
          {round.players.map((player) => (
            <PlayerSeat
              key={player.id}
              player={player}
              current={player.id === round.currentPlayer}
              local={player.id === localPlayerId}
            />
          ))}
        </div>

        <section className="action-panel" aria-label="我的操作区">
          <div>
            <h2>我的手牌</h2>
            <p>
              座位：玩家 {localPlayerId + 1} · 定缺：{suitText(localPlayer.missingSuit)}
            </p>
          </div>
          <div className="actions">
            {!isLocalTurn && (
              <button type="button" onClick={handleAdvanceRemoteTurn}>
                模拟远端一手
              </button>
            )}
            <button type="button" onClick={handleReset}>
              重置牌局
            </button>
          </div>

          <MissingSuitPanel player={localPlayer} onChoose={handleChooseMissingSuit} />

          <div className="turn-hint" data-phase={currentPhase} data-local={isLocalTurn}>
            {turnHintText(isLocalTurn, currentPhase)}
          </div>

          <div className="hu-status" data-ready={currentHu?.canHu ?? false}>
            {currentHu === null
              ? `当前是玩家 ${round.currentPlayer + 1} 的回合，等待远端玩家操作。`
              : currentHu.canHu
                ? `可以自摸胡：${currentHu.score.cappedPoints} 分，牌型 ${currentHu.patterns.map(patternText).join("、")}`
                : `暂不能自摸：${reasonText(currentHu.reason)}`}
          </div>

          <div className="hand" aria-label="按条筒万排序的我的手牌">
            {sortedLocalHand.map((tile, index) => (
              <button
                className="tile-button"
                key={`${tileText(tile)}-${index}`}
                type="button"
                onClick={() => handleDiscard(tile)}
                title={isLocalTurn && localPhase === "discard" ? `打出 ${tileText(tile)}` : tileText(tile)}
                disabled={!isLocalTurn || localPhase !== "discard"}
                data-yaoji={isYaoJiTile(tile)}
              >
                <TileFace tile={tile} />
              </button>
            ))}
          </div>
        </section>
      </section>

      <aside className="log-panel" aria-label="牌局记录">
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

function MissingSuitPanel({ player, onChoose }: { player: PlayerState; onChoose: (suit: Suit) => void }) {
  const heavenlyMissingSuit = detectHeavenlyMissingSuit(player.hand);

  if (player.missingSuit !== null) {
    return (
      <div className="missing-panel" data-set="true">
        <span>定缺已确认</span>
        <strong>{suitText(player.missingSuit)}</strong>
        {heavenlyMissingSuit === player.missingSuit && <em>天缺默认</em>}
      </div>
    );
  }

  return (
    <div className="missing-panel" data-set="false">
      <span>请选择定缺</span>
      <div className="missing-options">
        {suitOrder.map((suit) => (
          <button key={suit} type="button" onClick={() => onChoose(suit)}>
            {suitText(suit)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerSeat({ player, current, local }: { player: PlayerState; current: boolean; local: boolean }) {
  return (
    <article className="seat" data-current={current} data-local={local}>
      <div className="seat-title">
        <h2>{local ? "我" : `玩家 ${player.id + 1}`}</h2>
        <span>{current ? "当前回合" : "等待"}</span>
      </div>
      <div className="seat-meta">
        <span>{player.hand.length} 张手牌</span>
        <span>定缺 {suitText(player.missingSuit)}</span>
      </div>
      {!local && (
        <div className="hand-backs" aria-label={`玩家 ${player.id + 1} 盖住的手牌`}>
          {Array.from({ length: Math.min(player.hand.length, 14) }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      )}
      <div className="discard-strip">
        {player.discards.length === 0 ? (
          <span className="empty">暂无弃牌</span>
        ) : (
          player.discards.map((tile, index) => (
            <span className="discard-tile" key={`${tileText(tile)}-${index}`}>
              <TileFace tile={tile} compact />
            </span>
          ))
        )}
      </div>
    </article>
  );
}

function TileFace({ tile, compact = false }: { tile: Tile; compact?: boolean }) {
  return (
    <span className="tile-face" data-suit={tile.suit} data-compact={compact} data-yaoji={isYaoJiTile(tile)}>
      <span className="tile-rank">{tile.rank}</span>
      {tile.suit === "characters" && <CharacterSuit rank={tile.rank} />}
      {tile.suit === "dots" && <DotSuit rank={tile.rank} />}
      {tile.suit === "bamboos" && <BambooSuit rank={tile.rank} />}
      {isYaoJiTile(tile) && <span className="laizi-mark">赖</span>}
    </span>
  );
}

function CharacterSuit({ rank }: { rank: Tile["rank"] }) {
  return (
    <span className="wan-icon">
      <strong>{chineseNumber(rank)}</strong>
      <em>万</em>
    </span>
  );
}

function DotSuit({ rank }: { rank: Tile["rank"] }) {
  return (
    <span className="dot-icon" data-count={rank}>
      {Array.from({ length: rank }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

function BambooSuit({ rank }: { rank: Tile["rank"] }) {
  if (rank === 1) {
    return (
      <span className="bamboo-one">
        <i />
        <strong>幺</strong>
      </span>
    );
  }

  return (
    <span className="bamboo-icon" data-count={rank}>
      {Array.from({ length: rank }, (_, index) => (
        <i key={index} />
      ))}
    </span>
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

function advanceRemoteTurn(round: RoundState): { round: RoundState; logs: string[] } {
  const player = round.players[round.currentPlayer];
  const logs: string[] = [];
  let nextRound = round;
  let nextPlayer = player;

  if (nextPlayer.id === localPlayerId) {
    return { round, logs: ["现在轮到你操作。"] };
  }

  if (nextPlayer.missingSuit === null) {
    const suit = chooseRemoteMissingSuit(nextPlayer.hand);
    nextRound = updatePlayer(nextRound, nextPlayer.id, { ...nextPlayer, missingSuit: suit });
    nextPlayer = nextRound.players[nextPlayer.id];
    logs.push(`玩家 ${nextPlayer.id + 1} 已选择定缺 ${suitText(suit)}。`);
  }

  if (getTurnPhase(nextPlayer) === "draw") {
    const drawResult = drawTile(nextRound);

    if (!drawResult.ok) {
      return { round: nextRound, logs: [...logs, `玩家 ${nextPlayer.id + 1} 摸牌失败：${reasonText(drawResult.reason)}。`] };
    }

    nextRound = drawResult.round;
    nextPlayer = nextRound.players[nextPlayer.id];
    logs.push(`系统给玩家 ${nextPlayer.id + 1} 发了一张牌。`);
  }

  const discard = chooseRemoteDiscard(nextRound, nextPlayer.id);

  if (discard === null) {
    return { round: nextRound, logs: [...logs, `玩家 ${nextPlayer.id + 1} 暂无可模拟打出的牌。`] };
  }

  const discardResult = discardTile(nextRound, nextPlayer.id, discard);

  if (!discardResult.ok) {
    return {
      round: nextRound,
      logs: [...logs, `玩家 ${nextPlayer.id + 1} 打出 ${tileText(discard)} 失败：${reasonText(discardResult.reason)}。`],
    };
  }

  return {
    round: discardResult.round,
    logs: [...logs, `玩家 ${nextPlayer.id + 1} 打出 ${tileText(discard)}。轮到玩家 ${discardResult.nextPlayer + 1}。`],
  };
}

function chooseRemoteDiscard(round: RoundState, playerId: PlayerId): Tile | null {
  const player = round.players[playerId];
  const candidates = sortHand(player.hand);

  return candidates.find((tile) => discardTile(round, playerId, tile).ok) ?? null;
}

function updatePlayer(round: RoundState, playerId: PlayerId, nextPlayer: PlayerState): RoundState {
  return {
    ...round,
    players: round.players.map((player) => (player.id === playerId ? nextPlayer : player)),
  };
}

function sortHand(hand: Tile[]): Tile[] {
  return [...hand].sort((left, right) => {
    const suitDiff = suitOrder.indexOf(left.suit) - suitOrder.indexOf(right.suit);

    if (suitDiff !== 0) {
      return suitDiff;
    }

    return left.rank - right.rank;
  });
}

function detectHeavenlyMissingSuit(hand: Tile[]): Suit | null {
  const missingSuits = suitOrder.filter((suit) => ordinarySuitCount(hand, suit) === 0);
  return missingSuits.length === 1 ? missingSuits[0] : null;
}

function chooseRemoteMissingSuit(hand: Tile[]): Suit {
  return [...suitOrder].sort((left, right) => ordinarySuitCount(hand, left) - ordinarySuitCount(hand, right))[0];
}

function ordinarySuitCount(hand: Tile[], suit: Suit): number {
  return hand.filter((tile) => tile.suit === suit && !isYaoJiTile(tile)).length;
}

function getTurnPhase(player: PlayerState): TurnPhase {
  if (player.missingSuit === null) {
    return "chooseMissingSuit";
  }

  return player.hand.length % 3 === 1 ? "draw" : "discard";
}

function turnHintText(isLocalTurn: boolean, phase: TurnPhase): string {
  if (!isLocalTurn) {
    return "等待其他玩家操作。当前原型可用模拟按钮推进远端回合。";
  }

  if (phase === "chooseMissingSuit") {
    return "请先自己选择定缺；如果起手天缺一门，会自动默认那一门。";
  }

  if (phase === "draw") {
    return "系统正在自动给你发牌。";
  }

  return "你已摸牌，请从手牌中选择一张打出。";
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

function chineseNumber(rank: Tile["rank"]): string {
  const numbers: Record<Tile["rank"], string> = {
    1: "一",
    2: "二",
    3: "三",
    4: "四",
    5: "五",
    6: "六",
    7: "七",
    8: "八",
    9: "九",
  };
  return numbers[rank];
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
