import { useEffect, useMemo, useRef, useState } from "react";
import {
  checkCurrentPlayerHu,
  checkDiscardHu,
  createRoom,
  discardTile,
  drawTile,
  joinRoom,
  startRoomRound,
  startRound,
  takeSeat,
  toggleReady,
  toClientVisibleRoomState,
  type PlayerId,
  type PlayerState,
  type RoomEvent,
  type RoomState,
  type SeatState,
  type RoundState,
  type Suit,
  type Tile,
  type VisiblePlayerState,
} from "./game/index.ts";

const seed = "portfolio-demo-001";
const roomId = "LSMJ-001";
const localPlayerId = "player-1";
const localSeatId: PlayerId = 0;
const suitOrder: Suit[] = ["bamboos", "dots", "characters"];
const demoPlayers = [
  { playerId: "player-1", displayName: "我" },
  { playerId: "player-2", displayName: "演示玩家 2" },
  { playerId: "player-3", displayName: "演示玩家 3" },
  { playerId: "player-4", displayName: "演示玩家 4" },
];

type LogEntry = {
  id: number;
  text: string;
};

type TableMode = "room" | "standalone";
type TurnPhase = "chooseMissingSuit" | "draw" | "discard";

function createDemoRound(): RoundState {
  const round = startRound({ seed, dealer: 0 });

  return {
    ...round,
    players: round.players.map((player) => ({
      ...player,
      missingSuit: player.id === localSeatId ? detectHeavenlyMissingSuit(player.hand) : null,
    })),
  };
}

function createDemoRoom(): RoomState {
  return createRoom({ id: roomId, seed });
}

export function App() {
  const [room, setRoom] = useState(createDemoRoom);
  const [tableMode, setTableMode] = useState<TableMode>("room");
  const [viewingPlayerId, setViewingPlayerId] = useState(localPlayerId);
  const [standaloneRound, setStandaloneRound] = useState(createDemoRound);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([
    {
      id: 1,
      text: "等待房间开局。开局后这里会记录摸牌、定缺、出牌和胡牌提示。",
    },
  ]);
  const autoDrawKeys = useRef(new Set<string>());

  const tableStarted = tableMode === "standalone" || room.round !== null;
  const round = tableMode === "room" && room.round !== null ? room.round : standaloneRound;
  const visibleRoom = tableMode === "room" ? toClientVisibleRoomState(room, viewingPlayerId) : null;
  const visibleRound = visibleRoom?.round ?? null;
  const visiblePlayers =
    tableMode === "room" && visibleRound !== null
      ? visibleRound.players
      : round.players.map((player) => toVisiblePlayerState(player));
  const currentPlayer = round.players[round.currentPlayer];
  const localPlayer = round.players[localSeatId];
  const viewedSeatId = tableMode === "room" ? visibleRoom?.localSeatId : localSeatId;
  const viewedPlayer = viewedSeatId === null || viewedSeatId === undefined ? localPlayer : round.players[viewedSeatId];
  const visibleViewedPlayer =
    viewedSeatId === null || viewedSeatId === undefined ? null : visiblePlayers[viewedSeatId];
  const visibleViewedHand = visibleViewedPlayer?.hand ?? (tableMode === "standalone" ? viewedPlayer.hand : []);
  const currentPhase = getTurnPhase(currentPlayer);
  const localPhase = getTurnPhase(localPlayer);
  const isLocalTurn = round.currentPlayer === localSeatId;
  const isViewingExecutionPlayer = tableMode !== "room" || viewingPlayerId === localPlayerId;
  const currentHu = isLocalTurn ? checkCurrentPlayerHu(round) : null;
  const sortedVisibleHand = useMemo(() => sortHand(visibleViewedHand), [visibleViewedHand]);
  const viewingPlayerIndex = demoPlayers.findIndex((player) => player.playerId === viewingPlayerId);
  const viewingPlayerLabel = viewingPlayerIndex >= 0 ? `玩家 ${viewingPlayerIndex + 1}` : "未入座";

  const totalDiscards = useMemo(
    () => visiblePlayers.reduce((sum, player) => sum + player.discards.length, 0),
    [visiblePlayers],
  );

  useEffect(() => {
    if (!tableStarted) {
      return;
    }

    const player = round.players[round.currentPlayer];

    if (getTurnPhase(player) !== "draw") {
      return;
    }

    const autoDrawKey = `${tableMode}:${round.currentPlayer}:${round.wall.length}:${player.hand.length}:${player.discards.length}`;

    if (autoDrawKeys.current.has(autoDrawKey)) {
      return;
    }

    autoDrawKeys.current.add(autoDrawKey);

    const result = drawTile(round);

    if (!result.ok) {
      addGameLog(`系统摸牌失败：${reasonText(result.reason)}。`);
      return;
    }

    commitRound(result.round);
    addGameLog(`系统给玩家 ${player.id + 1} 发了一张牌。${player.id === localSeatId ? "轮到你出牌。" : "等待该玩家出牌。"}`);
  }, [round, tableMode, tableStarted]);

  function addGameLog(text: string) {
    setGameLogs((items) => [...items, { id: (items.at(-1)?.id ?? 0) + 1, text }].slice(-12));
  }

  function commitRound(nextRound: RoundState) {
    if (tableMode === "room" && room.round !== null) {
      setRoom((value) => ({ ...value, round: nextRound }));
      return;
    }

    setStandaloneRound(nextRound);
  }

  function handleJoinLocalPlayer() {
    const result = joinRoom(room, demoPlayers[0]);

    if (!result.ok) {
      addGameLog(`房间操作失败：${roomReasonText(result.reason)}。`);
      return;
    }

    setRoom(result.room);
  }

  function handleTakeLocalSeat() {
    const result = takeSeat(room, localPlayerId, localSeatId);

    if (!result.ok) {
      addGameLog(`房间操作失败：${roomReasonText(result.reason)}。`);
      return;
    }

    setRoom(result.room);
  }

  function handleFillDemoPlayers() {
    const result = demoPlayers.reduce((nextRoom, player, index) => {
      let memberRoom = nextRoom;

      if (!memberRoom.members.some((member) => member.playerId === player.playerId)) {
        const joinResult = joinRoom(memberRoom, player);
        memberRoom = joinResult.ok ? joinResult.room : memberRoom;
      }

      if (memberRoom.seats.some((seat) => seat.playerId === player.playerId)) {
        return memberRoom;
      }

      const seatResult = takeSeat(memberRoom, player.playerId, index as PlayerId);
      return seatResult.ok ? seatResult.room : memberRoom;
    }, room);

    setRoom(result);
  }

  function handleToggleReady(playerId: string) {
    const result = toggleReady(room, playerId);

    if (!result.ok) {
      addGameLog(`房间操作失败：${roomReasonText(result.reason)}。`);
      return;
    }

    setRoom(result.room);
  }

  function handleReadyAll() {
    const result = demoPlayers.reduce((nextRoom, player) => {
      const seat = nextRoom.seats.find((value) => value.playerId === player.playerId);

      if (seat === undefined || seat.ready) {
        return nextRoom;
      }

      const readyResult = toggleReady(nextRoom, player.playerId);
      return readyResult.ok ? readyResult.room : nextRoom;
    }, room);

    setRoom(result);
  }

  function handleStartRoomRound() {
    const result = startRoomRound(room, localSeatId);

    if (!result.ok) {
      addGameLog(`房间开局失败：${roomReasonText(result.reason)}。`);
      return;
    }

    setRoom(result.room);
    setTableMode("room");
    autoDrawKeys.current.clear();
    addGameLog("房间已开局。下面进入牌桌体验，仍然是本地模拟联机，还没有真实网络。");
  }

  function handleStandaloneDemo() {
    setTableMode("standalone");
    setStandaloneRound(createDemoRound());
    setViewingPlayerId(localPlayerId);
    autoDrawKeys.current.clear();
    addGameLog("已进入单机演示牌桌。这个模式绕过房间流程，只用于快速展示。");
  }

  function handleReset() {
    autoDrawKeys.current.clear();
    setViewingPlayerId(localPlayerId);

    if (tableMode === "room") {
      setRoom(createDemoRoom());
      setTableMode("room");
      setGameLogs((items) => [
        {
          id: (items.at(-1)?.id ?? 0) + 1,
          text: "本地模拟房间已重置。请重新加入、占座、准备并开局。",
        },
      ]);
      return;
    }

    setStandaloneRound(createDemoRound());
    setGameLogs((items) => [
      {
        id: (items.at(-1)?.id ?? 0) + 1,
        text: "单机演示牌局已重置。你需要先选择定缺，除非起手天缺。",
      },
    ]);
  }

  function handleViewingPlayerChange(playerId: string) {
    setViewingPlayerId(playerId);
  }

  function handleChooseMissingSuit(suit: Suit) {
    if (!isViewingExecutionPlayer) {
      addGameLog("当前正在演示其他客户端视角，请切回玩家 1 再操作本地模拟牌局。");
      return;
    }

    commitRound(updatePlayer(round, localSeatId, { ...round.players[localSeatId], missingSuit: suit }));
    addGameLog(`你选择定缺 ${suitText(suit)}。`);
  }

  function handleDiscard(tile: Tile) {
    if (!isViewingExecutionPlayer) {
      addGameLog("当前正在演示其他客户端视角，请切回玩家 1 再操作本地模拟牌局。");
      return;
    }

    if (!isLocalTurn) {
      addGameLog(`现在是玩家 ${round.currentPlayer + 1} 的回合，联机模式下只能操作自己的座位。`);
      return;
    }

    if (localPhase === "chooseMissingSuit") {
      addGameLog("请先选择定缺，再开始出牌。");
      return;
    }

    if (localPhase === "draw") {
      addGameLog("系统会自动给你摸牌，请稍等。");
      return;
    }

    const result = discardTile(round, localSeatId, tile);

    if (!result.ok) {
      addGameLog(`打出 ${tileText(tile)} 失败：${reasonText(result.reason)}。`);
      return;
    }

    const discardChecks = result.round.players
      .filter((player) => player.id !== localSeatId && !player.hasWon)
      .map((player) => ({ player, check: checkDiscardHu(round, player.id, tile) }))
      .filter(({ check }) => check.canHu);

    commitRound(result.round);

    if (discardChecks.length > 0) {
      addGameLog(
        `你打出 ${tileText(tile)}。${discardChecks
          .map(({ player, check }) => `玩家 ${player.id + 1} 可胡 ${check.canHu ? check.score.cappedPoints : 0} 分`)
          .join("；")}。`,
      );
      return;
    }

    addGameLog(`你打出 ${tileText(tile)}。轮到玩家 ${result.nextPlayer + 1}。`);
  }

  function handleAdvanceRemoteTurn() {
    if (isLocalTurn) {
      addGameLog("现在轮到你，不需要模拟远端玩家。");
      return;
    }

    const result = advanceRemoteTurn(round);
    commitRound(result.round);
    result.logs.forEach(addGameLog);
  }

  return (
    <main className="app-shell">
      <section className="table-area" aria-label="乐山麻将牌桌">
        <header className="top-bar">
          <div>
            <h1>乐山麻将 Lab</h1>
            <p>八鸡赖子规则的本地模拟联机桌</p>
          </div>
          <div className="round-stats">
            <Stat label="房间" value={tableMode === "room" ? room.id : "单机"} />
            <Stat
              label="当前视角"
              value={tableMode === "room" ? viewingPlayerLabel : "玩家 1"}
            />
            <Stat label="模拟操作" value={`玩家 ${localSeatId + 1}`} />
            <Stat label="当前回合" value={tableStarted ? `玩家 ${round.currentPlayer + 1}` : "待开局"} />
            <Stat
              label="牌墙"
              value={tableStarted ? (visibleRound?.wallCount ?? round.wall.length).toString() : "-"}
            />
          </div>
        </header>

        <div className="mode-banner">
          <div>
            <strong>本地模拟联机</strong>
            <span>
              当前客户端视角只影响可见信息；牌局动作仍由玩家 1 的本地模拟执行，还没有真实网络连接。
            </span>
          </div>
          {tableMode === "room" && (
            <ClientViewSelector value={viewingPlayerId} onChange={handleViewingPlayerChange} />
          )}
        </div>

        {tableMode === "room" && room.round === null ? (
          <RoomPanel
            room={room}
            onJoinLocalPlayer={handleJoinLocalPlayer}
            onTakeLocalSeat={handleTakeLocalSeat}
            onFillDemoPlayers={handleFillDemoPlayers}
            onToggleReady={handleToggleReady}
            onReadyAll={handleReadyAll}
            onStartRound={handleStartRoomRound}
            onStandaloneDemo={handleStandaloneDemo}
          />
        ) : (
          <>
            <div className="seats">
              {visiblePlayers.map((player) => (
                <PlayerSeat
                  key={player.id}
                  player={player}
                  current={player.id === round.currentPlayer}
                  local={player.id === viewedSeatId}
                />
              ))}
            </div>

            <section className="action-panel" aria-label="我的操作区">
              <div>
                <h2>当前视角手牌</h2>
                <p>
                  视角：玩家 {viewedPlayer.id + 1} · 定缺：{suitText(viewedPlayer.missingSuit)} · 弃牌：{totalDiscards}
                </p>
              </div>
              <div className="actions">
                {!isLocalTurn && (
                  <button type="button" onClick={handleAdvanceRemoteTurn}>
                    模拟远端一手
                  </button>
                )}
                <button type="button" onClick={handleReset}>
                  {tableMode === "room" ? "重置房间" : "重置牌局"}
                </button>
              </div>

              {tableMode === "room" && !isViewingExecutionPlayer && (
                <div className="view-only-note">
                  正在查看玩家 {viewedPlayer.id + 1} 客户端：只能展示该玩家手牌，不能用这个视角操作牌局。
                </div>
              )}

              <MissingSuitPanel
                player={localPlayer}
                onChoose={handleChooseMissingSuit}
                disabled={!isViewingExecutionPlayer}
              />

              <div className="turn-hint" data-phase={currentPhase} data-local={isLocalTurn}>
                {turnHintText(isLocalTurn, currentPhase, tableMode)}
              </div>

              <div className="hu-status" data-ready={isViewingExecutionPlayer && (currentHu?.canHu ?? false)}>
                {!isViewingExecutionPlayer
                  ? `正在查看玩家 ${viewedPlayer.id + 1} 的客户端视角；胡牌判断和出牌操作仍由玩家 1 的本地模拟执行。`
                  : currentHu === null
                    ? `当前是玩家 ${round.currentPlayer + 1} 的回合，等待远端玩家操作。`
                    : currentHu.canHu
                      ? `可以自摸胡：${currentHu.score.cappedPoints} 分，牌型 ${currentHu.patterns.map(patternText).join("、")}`
                      : `暂不能自摸：${reasonText(currentHu.reason)}`}
              </div>

              <div className="hand" aria-label="按条筒万排序的我的手牌">
                {sortedVisibleHand.map((tile, index) => (
                  <button
                    className="tile-button"
                    key={`${tileText(tile)}-${index}`}
                    type="button"
                    onClick={() => handleDiscard(tile)}
                    title={
                      isViewingExecutionPlayer && isLocalTurn && localPhase === "discard"
                        ? `打出 ${tileText(tile)}`
                        : tileText(tile)
                    }
                    disabled={!isViewingExecutionPlayer || !isLocalTurn || localPhase !== "discard"}
                    data-yaoji={isYaoJiTile(tile)}
                  >
                    <TileFace tile={tile} />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </section>

      <aside className="log-panel" aria-label="事件记录">
        <h2>事件记录</h2>
        <section className="log-section" aria-label="房间日志">
          <h3>房间日志</h3>
          <div className="log-list">
            {room.eventLog.map((event, index) => (
              <p key={`${event.type}-${index}`}>
                <span>#{index + 1}</span>
                {roomEventText(event, room)}
              </p>
            ))}
          </div>
        </section>
        <section className="log-section" aria-label="牌局日志">
          <h3>牌局日志</h3>
          <div className="log-list">
            {gameLogs.map((log, index) => (
              <p key={log.id}>
                <span>#{index + 1}</span>
                {log.text}
              </p>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}

function ClientViewSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (playerId: string) => void;
}) {
  return (
    <label className="view-switcher">
      <span>当前客户端视角</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {demoPlayers.map((player, index) => (
          <option key={player.playerId} value={player.playerId}>
            玩家 {index + 1} · {player.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function RoomPanel({
  room,
  onJoinLocalPlayer,
  onTakeLocalSeat,
  onFillDemoPlayers,
  onToggleReady,
  onReadyAll,
  onStartRound,
  onStandaloneDemo,
}: {
  room: RoomState;
  onJoinLocalPlayer: () => void;
  onTakeLocalSeat: () => void;
  onFillDemoPlayers: () => void;
  onToggleReady: (playerId: string) => void;
  onReadyAll: () => void;
  onStartRound: () => void;
  onStandaloneDemo: () => void;
}) {
  const localJoined = room.members.some((member) => member.playerId === localPlayerId);
  const localSeated = room.seats.some((seat) => seat.playerId === localPlayerId);
  const occupiedSeats = room.seats.filter((seat) => seat.playerId !== null).length;
  const readySeats = room.seats.filter((seat) => seat.ready).length;

  return (
    <section className="room-panel" aria-label="本地模拟联机房间">
      <div className="room-header">
        <div>
          <h2>房间模式</h2>
          <p>房间号 {room.id} · 本地 reducer 模拟 · 暂无真实网络连接</p>
        </div>
        <div className="room-summary">
          <Stat label="成员" value={room.members.length.toString()} />
          <Stat label="座位" value={`${occupiedSeats}/4`} />
          <Stat label="准备" value={`${readySeats}/4`} />
        </div>
      </div>

      <div className="room-actions">
        <button type="button" onClick={onJoinLocalPlayer} disabled={localJoined}>
          加入我
        </button>
        <button type="button" onClick={onTakeLocalSeat} disabled={!localJoined || localSeated}>
          坐到玩家 1
        </button>
        <button type="button" onClick={onFillDemoPlayers}>
          补齐演示玩家
        </button>
        <button type="button" onClick={onReadyAll}>
          全员准备
        </button>
        <button type="button" onClick={onStartRound}>
          开始牌局
        </button>
        <button type="button" onClick={onStandaloneDemo}>
          直接单机演示
        </button>
      </div>

      <div className="room-seat-grid">
        {room.seats.map((seat) => (
          <RoomSeatCard key={seat.seatId} seat={seat} onToggleReady={onToggleReady} />
        ))}
      </div>
    </section>
  );
}

function RoomSeatCard({ seat, onToggleReady }: { seat: SeatState; onToggleReady: (playerId: string) => void }) {
  return (
    <article className="room-seat-card" data-occupied={seat.playerId !== null} data-ready={seat.ready}>
      <div className="seat-title">
        <h2>玩家 {seat.seatId + 1}</h2>
        <span>{seat.ready ? "已准备" : seat.playerId === null ? "空座" : "未准备"}</span>
      </div>
      <div className="seat-meta">
        <span>{seat.displayName ?? "等待加入"}</span>
        <span>{seat.connected ? "在线" : "未连接"}</span>
      </div>
      {seat.playerId !== null && (
        <button type="button" onClick={() => onToggleReady(seat.playerId!)}>
          {seat.ready ? "取消准备" : "准备"}
        </button>
      )}
    </article>
  );
}

function MissingSuitPanel({
  player,
  onChoose,
  disabled = false,
}: {
  player: PlayerState;
  onChoose: (suit: Suit) => void;
  disabled?: boolean;
}) {
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
          <button key={suit} type="button" onClick={() => onChoose(suit)} disabled={disabled}>
            {suitText(suit)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerSeat({ player, current, local }: { player: VisiblePlayerState; current: boolean; local: boolean }) {
  return (
    <article className="seat" data-current={current} data-local={local}>
      <div className="seat-title">
        <h2>{local ? "我" : `玩家 ${player.id + 1}`}</h2>
        <span>{current ? "当前回合" : "等待"}</span>
      </div>
      <div className="seat-meta">
        <span>{player.handCount} 张手牌</span>
        <span>定缺 {suitText(player.missingSuit)}</span>
      </div>
      {!local && (
        <div className="hand-backs" aria-label={`玩家 ${player.id + 1} 盖住的手牌`}>
          {Array.from({ length: Math.min(player.handCount, 14) }, (_, index) => (
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

function toVisiblePlayerState(player: PlayerState): VisiblePlayerState {
  return {
    id: player.id,
    hand: player.hand,
    handCount: player.hand.length,
    discards: player.discards,
    hasWon: player.hasWon,
    missingSuit: player.missingSuit,
  };
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

  if (nextPlayer.id === localSeatId) {
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

function turnHintText(isLocalTurn: boolean, phase: TurnPhase, tableMode: TableMode): string {
  if (!isLocalTurn) {
    return tableMode === "room"
      ? "等待其他玩家操作。当前仍是本地模拟，可用按钮推进远端回合。"
      : "等待其他玩家操作。当前单机演示可用模拟按钮推进。";
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

function roomEventText(event: RoomEvent, room: RoomState): string {
  switch (event.type) {
    case "roomCreated":
      return `创建房间 ${event.roomId}。`;
    case "playerJoined":
      return `${event.displayName} 加入房间。`;
    case "seatTaken":
      return `${roomPlayerName(room, event.playerId)} 坐到玩家 ${event.seatId + 1}。`;
    case "readyChanged":
      return `${roomPlayerName(room, event.playerId)} ${event.ready ? "已准备" : "取消准备"}。`;
    case "roundStarted":
      return `房间开局，庄家是玩家 ${event.dealer + 1}。`;
  }
}

function roomPlayerName(room: RoomState, playerId: string): string {
  return room.members.find((member) => member.playerId === playerId)?.displayName ?? playerId;
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

function roomReasonText(reason: string): string {
  const reasons: Record<string, string> = {
    roomAlreadyStarted: "房间已经开局",
    playerAlreadyJoined: "玩家已经加入",
    playerNotInRoom: "玩家还没有加入房间",
    seatOccupied: "座位已经有人",
    playerAlreadySeated: "玩家已经入座",
    playerNotSeated: "玩家还没有入座",
    notEnoughPlayers: "还没有坐满四人",
    notAllPlayersReady: "还有玩家没有准备",
  };
  return reasons[reason] ?? "原因待确认";
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
