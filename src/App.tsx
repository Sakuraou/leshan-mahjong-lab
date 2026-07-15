import { useEffect, useMemo, useRef, useState } from "react";
import {
  checkCurrentPlayerHu,
  checkDiscardHu,
  type ClientVisibleRoomState,
  discardTile,
  drawTile,
  startRound,
  type PlayerId,
  type Meld,
  type PlayerState,
  type RoomEvent,
  type RoomState,
  type SeatState,
  type RoundState,
  type Suit,
  type Tile,
  type VisiblePlayerState,
} from "./game/index.ts";
import {
  createLocalRoomSession,
  createLocalRoomTransport,
  getLocalRoomClientView,
  getLocalRoomSessionToken,
  joinLocalRoomSession,
  replaceLocalRoomTransportRoom,
  startLocalRoomRound,
  takeLocalRoomSeat,
  toggleLocalRoomReady,
  type LocalRoomTransportResult,
} from "./localRoomTransport.ts";
import {
  createWebSocketRoomTransport,
  type WebSocketRoomTransport,
  type WebSocketRoomTransportActionResult,
  type WebSocketRoomTransportState,
} from "./webSocketRoomTransport.ts";

const seed = "portfolio-demo-001";
const roomId = "LSMJ-001";
const webSocketExperimentUrl = "ws://127.0.0.1:8787";
const localPlayerId = "player-1";
const localSeatId: PlayerId = 0;
const suitOrder: Suit[] = ["bamboos", "dots", "characters"];
const webSocketStepOrder: WebSocketStepKey[] = [
  "connection",
  "create",
  "join",
  "seat",
  "ready",
  "start",
  "dingque",
  "draw",
  "discard",
  "claim",
  "resume",
];
const webSocketRecoveryStoragePrefix = "leshan-mahjong-lab.websocketRecovery.";
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

type WebSocketStepKey =
  | "connection"
  | "create"
  | "join"
  | "seat"
  | "ready"
  | "start"
  | "dingque"
  | "draw"
  | "discard"
  | "claim"
  | "resume";
type WebSocketStepStatus = "idle" | "running" | "success" | "error";
type WebSocketConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";
type WebSocketStepState = {
  label: string;
  status: WebSocketStepStatus;
  message: string;
};
type WebSocketStepStates = Record<WebSocketStepKey, WebSocketStepState>;
type WebSocketRecoveryRecord = {
  playerId: string;
  roomId: string;
  url: string;
  sessionToken: string;
  lastEventId: number;
};
type WebSocketPreviewState = {
  host: WebSocketRoomTransportState | null;
  guest: WebSocketRoomTransportState | null;
  helpers: WebSocketRoomTransportState[];
};
type WebSocketPreviewClient = {
  title: string;
  playerId: string;
  state: WebSocketRoomTransportState | null;
  snapshot: ClientVisibleRoomState | null;
  sessionToken: string | null;
};
type WebSocketPreviewActions = {
  chooseMissingSuit: (playerId: string, suit: Suit) => Promise<void>;
  drawTile: (playerId: string) => Promise<void>;
  drawGangTile: (playerId: string) => Promise<void>;
  discardTile: (playerId: string, tile: Tile) => Promise<void>;
  passClaim: (playerId: string) => Promise<void>;
  claimHu: (playerId: string) => Promise<void>;
  claimSelfDrawHu: (playerId: string) => Promise<void>;
  claimPeng: (playerId: string) => Promise<void>;
  claimMingGang: (playerId: string) => Promise<void>;
  claimAnGang: (playerId: string, tile: Tile) => Promise<void>;
  claimBaGang: (playerId: string, tile: Tile) => Promise<void>;
  passQiangGang: (playerId: string) => Promise<void>;
  claimQiangGangHu: (playerId: string) => Promise<void>;
};

type TableMode = "room" | "standalone" | "websocketPreview";
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

export function App() {
  const [transport, setTransport] = useState(() => createLocalRoomTransport({ roomId, seed }));
  const [tableMode, setTableMode] = useState<TableMode>("room");
  const [viewingPlayerId, setViewingPlayerId] = useState(localPlayerId);
  const [webSocketPreview, setWebSocketPreview] = useState<WebSocketPreviewState>({
    host: null,
    guest: null,
    helpers: [],
  });
  const webSocketPreviewActions = useRef<WebSocketPreviewActions | null>(null);
  const [standaloneRound, setStandaloneRound] = useState(createDemoRound);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([
    {
      id: 1,
      text: "等待房间开局。开局后这里会记录摸牌、定缺、出牌和胡牌提示。",
    },
  ]);
  const autoDrawKeys = useRef(new Set<string>());

  const room = transport.room;
  const tableStarted = tableMode === "standalone" || (tableMode === "room" && room.round !== null);
  const round = tableMode === "room" && room.round !== null ? room.round : standaloneRound;
  const visibleRoom = tableMode === "room" ? getLocalRoomClientView(transport, viewingPlayerId) : null;
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
  const webSocketPreviewPrimary = getWebSocketPreviewPrimary(webSocketPreview);
  const webSocketPreviewRoomId = webSocketPreviewPrimary?.roomId ?? "未连接";
  const webSocketPreviewSnapshot = getWebSocketPreviewSnapshot(webSocketPreviewPrimary, "player-1");

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
      setTransport((value) => replaceLocalRoomTransportRoom(value, { ...value.room, round: nextRound }));
      return;
    }

    setStandaloneRound(nextRound);
  }

  function applyTransportResult(result: LocalRoomTransportResult) {
    setTransport(result.state);
    result.rejectedMessages.forEach((message) => {
      addGameLog(`本地模拟传输拒绝：${roomReasonText(message.payload.code)}。`);
    });
  }

  function handleJoinLocalPlayer() {
    applyTransportResult(createLocalRoomSession(transport, { displayName: demoPlayers[0].displayName }));
  }

  function handleTakeLocalSeat() {
    applyTransportResult(takeLocalRoomSeat(transport, localPlayerId, localSeatId));
  }

  function handleFillDemoPlayers() {
    const rejectedMessages: LocalRoomTransportResult["rejectedMessages"] = [];
    let nextTransport = transport;

    demoPlayers.forEach((player, index) => {
      if (getLocalRoomSessionToken(nextTransport, player.playerId) === undefined) {
        const joinResult =
          index === 0
            ? createLocalRoomSession(nextTransport, { displayName: player.displayName })
            : joinLocalRoomSession(nextTransport, { displayName: player.displayName });
        nextTransport = joinResult.state;
        rejectedMessages.push(...joinResult.rejectedMessages);
      }

      if (!nextTransport.room.seats.some((seat) => seat.playerId === player.playerId)) {
        const seatResult = takeLocalRoomSeat(nextTransport, player.playerId, index as PlayerId);
        nextTransport = seatResult.state;
        rejectedMessages.push(...seatResult.rejectedMessages);
      }
    });

    applyTransportResult({ state: nextTransport, messages: [], rejectedMessages });
  }

  function handleToggleReady(playerId: string) {
    applyTransportResult(toggleLocalRoomReady(transport, playerId));
  }

  function handleReadyAll() {
    const rejectedMessages: LocalRoomTransportResult["rejectedMessages"] = [];
    let nextTransport = transport;

    demoPlayers.forEach((player) => {
      const seat = nextTransport.room.seats.find((value) => value.playerId === player.playerId);
      if (seat === undefined || seat.ready) {
        return;
      }

      const readyResult = toggleLocalRoomReady(nextTransport, player.playerId);
      nextTransport = readyResult.state;
      rejectedMessages.push(...readyResult.rejectedMessages);
    });

    applyTransportResult({ state: nextTransport, messages: [], rejectedMessages });
  }

  function handleStartRoomRound() {
    const result = startLocalRoomRound(transport, localPlayerId, localSeatId);

    if (result.rejectedMessages.length > 0) {
      applyTransportResult(result);
      return;
    }

    setTransport(result.state);
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

  function handleWebSocketPreviewMode() {
    setTableMode("websocketPreview");
    addGameLog("已切换到真实 WebSocket 桌面预览。这里读取 roomSnapshot，并只接入定缺/摸牌/出牌，不接碰杠胡。");
  }

  function handleReset() {
    autoDrawKeys.current.clear();
    setViewingPlayerId(localPlayerId);

    if (tableMode === "room") {
      setTransport(createLocalRoomTransport({ roomId, seed }));
      setTableMode("room");
      setGameLogs((items) => [
        {
          id: (items.at(-1)?.id ?? 0) + 1,
          text: "本地模拟房间已重置。请重新加入、占座、准备并开局。",
        },
      ]);
      return;
    }

    if (tableMode === "websocketPreview") {
      setTableMode("room");
      setGameLogs((items) => [
        {
          id: (items.at(-1)?.id ?? 0) + 1,
          text: "已退出真实 WebSocket 预览，回到本地模拟房间。",
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
          .map(({ player, check }) =>
            `玩家 ${player.id + 1} 可胡 ${check.canHu ? `${check.score.cappedPoints} 分${genText(check.score.genCount)}` : "0 分"}`,
          )
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
            <Stat
              label="房间"
              value={tableMode === "websocketPreview" ? webSocketPreviewRoomId : tableMode === "room" ? room.id : "单机"}
            />
            <Stat
              label="当前视角"
              value={
                tableMode === "websocketPreview"
                  ? "WebSocket 预览"
                  : tableMode === "room"
                    ? viewingPlayerLabel
                    : "玩家 1"
              }
            />
            <Stat label="模拟操作" value={tableMode === "websocketPreview" ? "旁路" : `玩家 ${localSeatId + 1}`} />
            <Stat
              label="当前回合"
              value={
                tableMode === "websocketPreview"
                  ? webSocketPreviewSnapshot?.status ?? "待快照"
                  : tableStarted
                    ? `玩家 ${round.currentPlayer + 1}`
                    : "待开局"
              }
            />
            <Stat
              label="牌墙"
              value={
                tableMode === "websocketPreview"
                  ? (webSocketPreviewSnapshot?.round?.wallCount?.toString() ?? "-")
                  : tableStarted
                    ? (visibleRound?.wallCount ?? round.wall.length).toString()
                    : "-"
              }
            />
          </div>
        </header>

        <div className="mode-banner">
          <div>
            <strong>{tableMode === "websocketPreview" ? "真实 WebSocket 旁路预览" : "本地模拟传输"}</strong>
            <span>
              {tableMode === "websocketPreview"
                ? "主牌桌正在读取真实 WebSocket roomSnapshot；这里已接入定缺/摸牌/出牌，但不接碰杠胡。"
                : "房间流程已通过本地 mock transport 和 roomSocketAdapter 驱动；牌局动作仍由玩家 1 本地模拟执行，还没有真实网络连接。"}
            </span>
          </div>
          {tableMode === "room" && (
            <ClientViewSelector value={viewingPlayerId} onChange={handleViewingPlayerChange} />
          )}
          <button className="mode-link-button" type="button" onClick={handleWebSocketPreviewMode}>
            真实 WebSocket 桌面预览
          </button>
        </div>

        <WebSocketExperimentPanel onPreviewChange={setWebSocketPreview} actionsRef={webSocketPreviewActions} />

        {tableMode === "websocketPreview" ? (
          <WebSocketTablePreview
            preview={webSocketPreview}
            onExit={() => setTableMode("room")}
            onChooseMissingSuit={(playerId, suit) => webSocketPreviewActions.current?.chooseMissingSuit(playerId, suit)}
            onDrawTile={(playerId) => webSocketPreviewActions.current?.drawTile(playerId)}
            onDrawGangTile={(playerId) => webSocketPreviewActions.current?.drawGangTile(playerId)}
            onDiscardTile={(playerId, tile) => webSocketPreviewActions.current?.discardTile(playerId, tile)}
            onPassClaim={(playerId) => webSocketPreviewActions.current?.passClaim(playerId)}
            onClaimHu={(playerId) => webSocketPreviewActions.current?.claimHu(playerId)}
            onClaimSelfDrawHu={(playerId) => webSocketPreviewActions.current?.claimSelfDrawHu(playerId)}
            onClaimPeng={(playerId) => webSocketPreviewActions.current?.claimPeng(playerId)}
            onClaimMingGang={(playerId) => webSocketPreviewActions.current?.claimMingGang(playerId)}
            onClaimAnGang={(playerId, tile) => webSocketPreviewActions.current?.claimAnGang(playerId, tile)}
            onClaimBaGang={(playerId, tile) => webSocketPreviewActions.current?.claimBaGang(playerId, tile)}
            onPassQiangGang={(playerId) => webSocketPreviewActions.current?.passQiangGang(playerId)}
            onClaimQiangGangHu={(playerId) => webSocketPreviewActions.current?.claimQiangGangHu(playerId)}
          />
        ) : tableMode === "room" && room.round === null ? (
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
                      ? `可以自摸胡：${currentHu.score.cappedPoints} 分，牌型 ${currentHu.patterns.map(patternText).join("、")}${genText(currentHu.score.genCount)}`
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

function WebSocketTablePreview({
  preview,
  onExit,
  onChooseMissingSuit,
  onDrawTile,
  onDrawGangTile,
  onDiscardTile,
  onPassClaim,
  onClaimHu,
  onClaimSelfDrawHu,
  onClaimPeng,
  onClaimMingGang,
  onClaimAnGang,
  onClaimBaGang,
  onPassQiangGang,
  onClaimQiangGangHu,
}: {
  preview: WebSocketPreviewState;
  onExit: () => void;
  onChooseMissingSuit: (playerId: string, suit: Suit) => void;
  onDrawTile: (playerId: string) => void;
  onDrawGangTile: (playerId: string) => void;
  onDiscardTile: (playerId: string, tile: Tile) => void;
  onPassClaim: (playerId: string) => void;
  onClaimHu: (playerId: string) => void;
  onClaimSelfDrawHu: (playerId: string) => void;
  onClaimPeng: (playerId: string) => void;
  onClaimMingGang: (playerId: string) => void;
  onClaimAnGang: (playerId: string, tile: Tile) => void;
  onClaimBaGang: (playerId: string, tile: Tile) => void;
  onPassQiangGang: (playerId: string) => void;
  onClaimQiangGangHu: (playerId: string) => void;
}) {
  const clients = getWebSocketPreviewClients(preview);
  const primary = clients.find((client) => client.snapshot !== null) ?? clients[0];
  const snapshot = primary?.snapshot ?? null;
  const round = snapshot?.round ?? null;
  const occupiedSeats = snapshot?.seats.filter((seat) => seat.playerId !== null).length ?? 0;
  const readySeats = snapshot?.seats.filter((seat) => seat.ready).length ?? 0;
  const remainingPlayers = round?.players.filter((player) => !player.hasWon).length ?? 0;
  const chaJiao = snapshot?.chaJiao ?? null;
  const recentSettlements = snapshot?.settlementLedger.slice(-6).reverse() ?? [];
  const recentGangSettlements = snapshot?.gangSettlements.slice(-4).reverse() ?? [];
  const responseWindow = snapshot?.responseWindow ?? null;
  const latestPresence = snapshot?.eventLog.findLast((event) => event.type === "presenceChanged") ?? null;
  const [deadlineNow, setDeadlineNow] = useState(Date.now());
  const latestExpiry = snapshot?.eventLog.findLast((event) => event.type === "responseWindowExpired") ?? null;
  const responseSnapshotReceivedAt = primary?.state?.snapshotReceivedAtByPlayerId[primary.playerId] ?? deadlineNow;

  useEffect(() => {
    setDeadlineNow(Date.now());

    if (responseWindow === null) {
      return;
    }

    const timer = window.setInterval(() => setDeadlineNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [responseWindow?.windowId]);

  const remainingSeconds =
    responseWindow === null
      ? null
      : Math.ceil(
          Math.max(0, responseWindow.remainingMs - (deadlineNow - responseSnapshotReceivedAt)) / 1_000,
        );

  return (
    <section className="websocket-table-preview" aria-label="真实 WebSocket 桌面预览">
      <div className="preview-header">
        <div>
          <h2>真实 WebSocket 桌面预览</h2>
          <p>读取 WebSocket roomSnapshot 展示房间状态；当前已接真实定缺、摸牌、出牌、胡/碰/明杠响应骨架。</p>
        </div>
        <button type="button" onClick={onExit}>
          回到本地模拟
        </button>
      </div>

      <div className="preview-summary">
        <Stat label="真实房间" value={primary?.state?.roomId ?? "未连接"} />
        <Stat label="房间状态" value={snapshot?.status ?? "待快照"} />
        <Stat label="座位" value={`${occupiedSeats}/4`} />
        <Stat label="准备" value={`${readySeats}/4`} />
        <Stat label="未胡" value={round === null ? "-" : `${remainingPlayers}`} />
        <Stat label="牌墙" value={round?.wallCount?.toString() ?? "-"} />
        <Stat label="查叫" value={chaJiao === null ? "未生成" : "已生成"} />
        <Stat
          label="响应倒计时"
          value={responseWindow === null ? "-" : `${remainingSeconds} 秒`}
        />
      </div>

      {responseWindow !== null && (
        <div className="preview-deadline-status">
          <strong>{responseWindow.kind === "qiangGang" ? "等待抢杠胡" : "等待碰杠胡响应"}</strong>
          <span>窗口：{responseWindow.windowId}</span>
          <span>到期后未响应玩家由服务端自动过牌</span>
        </div>
      )}

      {responseWindow === null && latestExpiry?.type === "responseWindowExpired" && (
        <div className="preview-deadline-status" data-expired="true">
          <strong>最近一次响应已自动收束</strong>
          <span>
            {latestExpiry.kind === "qiangGang" ? "抢杠" : "出牌"}窗口 {latestExpiry.windowId}：
            {latestExpiry.outcome === "allPassed" ? "全部过牌" : latestExpiry.outcome === "claimed" ? "胡牌成立" : "抢杠胡成立"}
          </span>
        </div>
      )}

      {latestPresence?.type === "presenceChanged" && (
        <div className="preview-presence-status" data-connected={latestPresence.connected}>
          <strong>{latestPresence.connected ? "玩家已恢复连接" : "玩家已离线"}</strong>
          <span>
            {snapshot?.members.find((member) => member.playerId === latestPresence.playerId)?.displayName ?? latestPresence.playerId}
            {latestPresence.seatId === null ? "（未入座）" : `（座位 ${latestPresence.seatId + 1}）`}
          </span>
        </div>
      )}

      <div className="preview-settlement-ledger" aria-label="已成立杠分">
        <strong>已成立杠分</strong>
        {recentGangSettlements.length === 0 ? (
          <span>暂无已成立杠分</span>
        ) : (
          recentGangSettlements.map((fact, index) => (
            <span key={`${fact.gangType}-${fact.gangSeatId}-${index}`}>
              玩家 {fact.gangSeatId + 1} {settlementReasonText(fact.gangType)}：
              {fact.payerSeatIds.length} 位付款人，每人 {fact.pointsPerPayer} 分
              {fact.usesLaizi ? "（使用赖子）" : "（未使用赖子）"}
              {fact.targetTile === null ? "（牌面隐藏）" : `（${tileText(fact.targetTile)}）`}
            </span>
          ))
        )}
      </div>

      <div className="preview-settlement-ledger" aria-label="最近输赢积分">
        <strong>最近输赢</strong>
        {recentSettlements.length === 0 ? (
          <span>暂无胡牌、鸡钱、杠分或查叫记录</span>
        ) : (
          recentSettlements.map((entry) => (
            <span key={entry.id}>
              #{entry.batchId} 玩家 {entry.loserSeatId + 1} → 玩家 {entry.winnerSeatId + 1}：
              {settlementReasonText(entry.reason)} {entry.finalPoints} 分
              {"chickenSuit" in entry ? `（${entry.chickenSuit === "bamboos" ? "一条" : "一筒"}）` : ""}
              {entry.rawPoints !== entry.finalPoints ? `（封顶前 ${entry.rawPoints}）` : ""}
            </span>
          ))
        )}
      </div>

      {(snapshot?.roundEnd ?? null) !== null && (
        <div className="preview-empty">
          牌局结束：{snapshot?.roundEnd?.reason === "onePlayerLeft" ? "只剩一位未胡玩家" : "牌墙已摸完"}
          {chaJiao !== null && (
            <div className="preview-cha-jiao">
              <strong>流局查叫结算：</strong>
              {chaJiao.players.length === 0 ? (
                <span>暂无未胡玩家需要查叫。</span>
              ) : (
                chaJiao.players.map((player) => (
                  <span key={player.seatId}>
                    玩家 {player.seatId + 1}：
                    {player.isListening
                      ? `已听牌，最大点炮 ${player.maxHuPoints ?? "-"} 分（${player.patterns.map(patternText).join("、") || "普通牌型"}${genText(player.genCount)}）`
                      : "未听牌"}
                  </span>
                ))
              )}
              <span>未听玩家分别向每位已听玩家付款；鸡钱和杠分保持独立结算。</span>
            </div>
          )}
        </div>
      )}

      {snapshot === null ? (
        <div className="preview-empty">
          请先在上方“真实 WebSocket 连接演示”里运行 create/join/ready/start，预览区会读取最新 redacted snapshot。
        </div>
      ) : (
        <>
          <div className="preview-seat-grid">
            {snapshot.seats.map((seat) => (
              <WebSocketPreviewSeatCard
                key={seat.seatId}
                seat={seat}
                player={round?.players[seat.seatId] ?? null}
                score={snapshot.scores[seat.seatId]}
              />
            ))}
          </div>

          <div className="preview-client-grid">
            {clients.map((client) => (
              <WebSocketPreviewClientCard
                key={client.playerId}
                client={client}
                onChooseMissingSuit={onChooseMissingSuit}
                onDrawTile={onDrawTile}
                onDrawGangTile={onDrawGangTile}
                onDiscardTile={onDiscardTile}
                onPassClaim={onPassClaim}
                onClaimHu={onClaimHu}
                onClaimSelfDrawHu={onClaimSelfDrawHu}
                onClaimPeng={onClaimPeng}
                onClaimMingGang={onClaimMingGang}
                onClaimAnGang={onClaimAnGang}
                onClaimBaGang={onClaimBaGang}
                onPassQiangGang={onPassQiangGang}
                onClaimQiangGangHu={onClaimQiangGangHu}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function WebSocketPreviewSeatCard({
  seat,
  player,
  score,
}: {
  seat: SeatState;
  player: VisiblePlayerState | null;
  score: ClientVisibleRoomState["scores"][number];
}) {
  const handText =
    player === null
      ? "未开局"
      : player.hand !== null
        ? `${player.hand.length} 张可见`
        : `${player.handCount} 张隐藏`;

  return (
    <article
      className="preview-seat-card"
      data-ready={seat.ready}
      data-occupied={seat.playerId !== null}
      data-connected={seat.connected}
    >
      <div>
        <h3>座位 {seat.seatId + 1}</h3>
        <div className="preview-seat-badges">
          <span>{seat.ready ? "已准备" : "未准备"}</span>
          <span className="presence-badge" data-connected={seat.connected}>
            {seat.playerId === null ? "空位" : seat.connected ? "在线" : "离线"}
          </span>
        </div>
      </div>
      <p>{seat.displayName ?? "空位"}</p>
      <p>积分：{score.points > 0 ? `+${score.points}` : score.points}</p>
      <p>手牌：{handText}</p>
      <p>定缺：{suitText(player?.missingSuit ?? null)}</p>
      <p>副露：{player?.melds.length ?? 0}</p>
    </article>
  );
}

function WebSocketPreviewClientCard({
  client,
  onChooseMissingSuit,
  onDrawTile,
  onDrawGangTile,
  onDiscardTile,
  onPassClaim,
  onClaimHu,
  onClaimSelfDrawHu,
  onClaimPeng,
  onClaimMingGang,
  onClaimAnGang,
  onClaimBaGang,
  onPassQiangGang,
  onClaimQiangGangHu,
}: {
  client: WebSocketPreviewClient;
  onChooseMissingSuit: (playerId: string, suit: Suit) => void;
  onDrawTile: (playerId: string) => void;
  onDrawGangTile: (playerId: string) => void;
  onDiscardTile: (playerId: string, tile: Tile) => void;
  onPassClaim: (playerId: string) => void;
  onClaimHu: (playerId: string) => void;
  onClaimSelfDrawHu: (playerId: string) => void;
  onClaimPeng: (playerId: string) => void;
  onClaimMingGang: (playerId: string) => void;
  onClaimAnGang: (playerId: string, tile: Tile) => void;
  onClaimBaGang: (playerId: string, tile: Tile) => void;
  onPassQiangGang: (playerId: string) => void;
  onClaimQiangGangHu: (playerId: string) => void;
}) {
  const snapshot = client.snapshot;
  const round = snapshot?.round ?? null;
  const claimWindow = snapshot?.claimWindow ?? null;
  const baGangClaimWindow = snapshot?.baGangClaimWindow ?? null;
  const gangDraw = snapshot?.gangDraw ?? null;
  const roundEnd = snapshot?.roundEnd ?? null;
  const chaJiao = snapshot?.chaJiao ?? null;
  const localSeat = snapshot?.localSeatId;
  const phase = snapshot?.phase ?? null;
  const legalActions = snapshot?.legalActions ?? [];
  const players = round?.players ?? [];
  const localPlayer = localSeat === null || localSeat === undefined ? null : round?.players[localSeat];
  const canChooseMissingSuit = legalActions.includes("chooseMissingSuit") && client.sessionToken !== null;
  const canDrawTile = legalActions.includes("drawTile") && client.sessionToken !== null;
  const canDiscardTile =
    legalActions.includes("discardTile") &&
    localPlayer?.hand !== null &&
    localPlayer?.hand !== undefined &&
    client.sessionToken !== null;
  const canPassClaim = legalActions.includes("passClaim") && client.sessionToken !== null;
  const canPassQiangGang = legalActions.includes("passQiangGang") && client.sessionToken !== null;
  const canClaimQiangGangHu = legalActions.includes("claimQiangGangHu") && client.sessionToken !== null;
  const localClaimHuCheck = getLocalClaimHuCheck(snapshot, localSeat);
  const localSelfDrawHuCheck = getLocalSelfDrawHuCheck(snapshot, localSeat);
  const canClaimHu = legalActions.includes("claimHu") && client.sessionToken !== null;
  const huPriorityActive = claimWindowHasHuPriority(snapshot);
  const canClaimSelfDrawHu = legalActions.includes("claimSelfDrawHu") && client.sessionToken !== null;
  const canClaimPeng = legalActions.includes("claimPeng") && client.sessionToken !== null;
  const canClaimMingGang = legalActions.includes("claimMingGang") && client.sessionToken !== null;
  const activeAnGangCandidates = getActiveAnGangCandidates(
    round,
    localSeat,
    localPlayer,
    legalActions.includes("claimAnGang"),
  );
  const activeBaGangCandidates = getActiveBaGangCandidates(
    round,
    localSeat,
    localPlayer,
    legalActions.includes("claimBaGang"),
  );
  const canDrawGangTile = legalActions.includes("drawGangTile") && client.sessionToken !== null;
  const visibleHand = localPlayer?.hand ?? [];
  const remainingPlayerCount = players.filter((player) => !player.hasWon).length;
  const localMember = snapshot?.members.find((member) => member.playerId === client.playerId) ?? null;
  const latestLocalPresence = snapshot?.eventLog.findLast(
    (event) => event.type === "presenceChanged" && event.playerId === client.playerId,
  );
  const presenceLabel =
    localMember === null
      ? "未加入"
      : !localMember.connected
        ? "离线"
        : latestLocalPresence?.type === "presenceChanged" && latestLocalPresence.reason === "sessionResumed"
          ? "已恢复"
          : "在线";

  return (
    <article className="preview-client-card">
      <h3>{client.title}</h3>
      <p className="preview-client-presence" data-connected={localMember?.connected ?? false}>
        连接状态：<strong>{presenceLabel}</strong>
      </p>
      <p>session：{client.sessionToken ?? "暂无"}</p>
      <p>本地座位：{localSeat === null || localSeat === undefined ? "-" : localSeat + 1}</p>
      <p>房间状态：{snapshot?.status ?? "待快照"}</p>
      <p>牌局阶段：{phase ?? "未开始"}</p>
      <p>可用动作：{legalActions.length === 0 ? "暂无" : legalActions.join("、")}</p>
      <p>血战状态：{round === null ? "未开局" : `未胡 ${remainingPlayerCount} 人，${localPlayer?.hasWon ? "本家已胡" : "本家未胡"}`}</p>
      <p>牌局结束：{roundEnd === null ? "未结束" : roundEnd.reason === "onePlayerLeft" ? "只剩一位未胡玩家" : "牌墙已摸完"}</p>
      <p>查叫状态：{chaJiao === null ? "未生成" : `已结算 ${chaJiao.players.length} 位未胡玩家`}</p>
      <p>定缺状态：{round === null ? "开局后可选" : suitText(localPlayer?.missingSuit ?? null)}</p>
      <p>摸牌状态：{webSocketDrawHint(round, phase, localSeat, localPlayer)}</p>
      <p>出牌状态：{webSocketDiscardHint(round, phase, localSeat, localPlayer)}</p>
      <p>杠后状态：{gangDraw === null ? "暂无杠后补牌" : `玩家 ${gangDraw.seatId + 1} 等待补牌`}</p>
      <p>响应状态：{webSocketClaimHint(snapshot, localSeat)}</p>
      <p>
        抢杠状态：
        {baGangClaimWindow === null
          ? "暂无抢杠胡窗口"
          : `等待抢 ${tileText(baGangClaimWindow.tile)}；剩余 ${baGangClaimWindow.pendingResponderCount} 人响应；${baGangClaimWindow.hasRespondedByMe ? `我的选择：${clientResponseText(baGangClaimWindow.responseByMe, true)}` : "我尚未响应"}`}
      </p>
      <p>胡优先：{claimWindow === null ? "暂无响应窗口" : huPriorityActive ? "胡牌响应优先，碰/明杠暂时不可用" : "暂无胡牌优先锁定"}</p>
      <p>胡牌提示：{webSocketClaimHuHint(localClaimHuCheck, canPassClaim)}</p>
      <p>自摸提示：{webSocketClaimHuHint(localSelfDrawHuCheck, canClaimSelfDrawHu)}</p>
      <p>碰牌提示：{canPassClaim ? (canClaimPeng ? "可碰，服务端会移出两张牌并记录副露" : "当前不能碰") : "暂无可响应碰牌"}</p>
      <p>杠牌提示：{canPassClaim ? (canClaimMingGang ? "可明杠，服务端会记录副露并进入杠后摸牌" : "当前不能杠") : "暂无可响应杠牌"}</p>
      <p>
        主动杠提示：
        {activeAnGangCandidates.length > 0 || activeBaGangCandidates.length > 0
          ? "当前出牌阶段可尝试暗杠或巴杠"
          : "摸牌后如满足牌型会显示暗杠/巴杠"}
      </p>
      <div className="preview-missing-actions">
        {suitOrder.map((suit) => (
          <button
            key={suit}
            type="button"
            disabled={!canChooseMissingSuit}
            onClick={() => onChooseMissingSuit(client.playerId, suit)}
          >
            {suitText(suit)}
          </button>
        ))}
      </div>
      <button
        className="preview-draw-button"
        type="button"
        disabled={!canDrawTile}
        onClick={() => onDrawTile(client.playerId)}
      >
        服务端摸牌
      </button>
      <button
        className="preview-draw-button"
        type="button"
        disabled={!canDrawGangTile}
        onClick={() => onDrawGangTile(client.playerId)}
      >
        杠后补牌
      </button>
      <div className="preview-discard-actions" aria-label={`${client.title} 可见手牌出牌`}>
        {visibleHand.length === 0 ? (
          <span>只有当前客户端自己的手牌可用于出牌</span>
        ) : (
          sortHand(visibleHand).map((tile, index) => (
            <button
              key={`${tileText(tile)}-${index}`}
              type="button"
              disabled={!canDiscardTile}
              onClick={() => onDiscardTile(client.playerId, tile)}
            >
              <TileFace tile={tile} compact />
            </button>
          ))
        )}
      </div>
      <div className="preview-claim-actions">
        {activeAnGangCandidates.map((tile, index) => (
          <button key={`an-${tileText(tile)}-${index}`} type="button" onClick={() => onClaimAnGang(client.playerId, tile)}>
            暗杠 {tileText(tile)}
          </button>
        ))}
        {activeBaGangCandidates.map((tile, index) => (
          <button key={`ba-${tileText(tile)}-${index}`} type="button" onClick={() => onClaimBaGang(client.playerId, tile)}>
            巴杠 {tileText(tile)}
          </button>
        ))}
        <button type="button" disabled={!canClaimHu} onClick={() => onClaimHu(client.playerId)}>
          胡牌
        </button>
        <button type="button" disabled={!canClaimSelfDrawHu} onClick={() => onClaimSelfDrawHu(client.playerId)}>
          自摸胡
        </button>
        <button type="button" disabled={!canClaimPeng} onClick={() => onClaimPeng(client.playerId)}>
          碰牌
        </button>
        <button type="button" disabled={!canClaimMingGang} onClick={() => onClaimMingGang(client.playerId)}>
          杠牌
        </button>
        <button type="button" disabled={!canPassClaim} onClick={() => onPassClaim(client.playerId)}>
          过牌
        </button>
        <button type="button" disabled={!canClaimQiangGangHu} onClick={() => onClaimQiangGangHu(client.playerId)}>
          抢杠胡
        </button>
        <button type="button" disabled={!canPassQiangGang} onClick={() => onPassQiangGang(client.playerId)}>
          抢杠过牌
        </button>
      </div>
      <div>
        {players.length === 0 ? (
          <span>开局后显示 redacted 手牌数量</span>
        ) : (
          players.map((player) => (
            <span key={player.id}>
              玩家 {player.id + 1}：
              {player.hand !== null ? `${player.hand.length} 张可见` : `${player.handCount} 张隐藏`}
              · 副露 {player.melds.length}
              {player.hasWon ? " · 已胡" : ""}
            </span>
          ))
        )}
      </div>
    </article>
  );
}

function webSocketDrawHint(
  round: ClientVisibleRoomState["round"],
  phase: ClientVisibleRoomState["phase"],
  localSeat: PlayerId | null | undefined,
  localPlayer: VisiblePlayerState | null | undefined,
): string {
  if (round === null) {
    return "开局后等待服务端判断";
  }

  if (localSeat === null || localSeat === undefined || localPlayer === null || localPlayer === undefined) {
    return "尚未入座";
  }

  if (phase === "dingque") {
    return "等待所有玩家定缺";
  }

  if (phase === "claim") {
    return "等待碰杠胡响应结束";
  }

  if (phase === "gangDraw") {
    return "当前处于杠后补牌阶段";
  }

  if (localSeat !== round.currentPlayer) {
    return `等待玩家 ${round.currentPlayer + 1}`;
  }

  if (phase !== "draw") {
    return "当前不是摸牌阶段";
  }

  return "当前玩家可请求服务端摸牌";
}

function webSocketDiscardHint(
  round: ClientVisibleRoomState["round"],
  phase: ClientVisibleRoomState["phase"],
  localSeat: PlayerId | null | undefined,
  localPlayer: VisiblePlayerState | null | undefined,
): string {
  if (round === null) {
    return "开局后等待服务端判断";
  }

  if (localSeat === null || localSeat === undefined || localPlayer === null || localPlayer === undefined) {
    return "尚未入座";
  }

  if (phase === "dingque") {
    return "等待所有玩家定缺";
  }

  if (phase === "claim" || phase === "gangDraw" || phase === "qiangGang") {
    return "等待碰杠胡响应结束";
  }

  if (localSeat !== round.currentPlayer) {
    return `等待玩家 ${round.currentPlayer + 1}`;
  }

  if (phase !== "discard") {
    return "当前不是出牌阶段";
  }

  if (localPlayer.hand === null) {
    return "当前客户端不可见该手牌";
  }

  return "当前玩家可选择可见手牌出牌";
}

function webSocketClaimHint(
  snapshot: ClientVisibleRoomState | null,
  _localSeat: PlayerId | null | undefined,
): string {
  const claimWindow = snapshot?.claimWindow ?? null;

  if (claimWindow === null) {
    return "暂无响应窗口";
  }

  if (claimWindow.hasRespondedByMe) {
    return `你已选择${clientResponseText(claimWindow.responseByMe)}，等待剩余 ${claimWindow.pendingResponderCount} 人响应`;
  }

  if (snapshot?.legalActions.includes("passClaim")) {
    return `你可以响应 ${tileText(claimWindow.tile)}，胡牌优先；剩余 ${claimWindow.pendingResponderCount} 人`;
  }

  return `等待其他客户端响应 ${tileText(claimWindow.tile)}；剩余 ${claimWindow.pendingResponderCount} 人`;
}

function clientResponseText(
  response: "pass" | "hu" | "peng" | "mingGang" | null,
  qiangGang = false,
): string {
  if (response === "hu") return qiangGang ? "抢杠胡" : "胡牌";
  if (response === "peng") return "碰牌";
  if (response === "mingGang") return "明杠";
  return "过牌";
}

function getLocalClaimHuCheck(
  snapshot: ClientVisibleRoomState | null,
  localSeat: PlayerId | null | undefined,
): ReturnType<typeof checkDiscardHu> | null {
  if (
    snapshot?.round === null ||
    snapshot?.round === undefined ||
    snapshot.claimWindow === null ||
    localSeat === null ||
    localSeat === undefined
  ) {
    return null;
  }

  const localPlayer = snapshot.round.players[localSeat];

  if (localPlayer.hand === null || !snapshot.legalActions.includes("passClaim")) {
    return null;
  }

  return checkDiscardHu(
    {
      seed: "client-redacted",
      dealer: snapshot.round.dealer,
      currentPlayer: snapshot.round.currentPlayer,
      wall: [],
      players: snapshot.round.players.map((player) => ({
        id: player.id,
        hand: player.id === localSeat ? localPlayer.hand ?? [] : [],
        discards: player.discards,
        melds: visibleMeldsToInternal(player.melds),
        hasWon: player.hasWon,
        claimedWinningTile: null,
        missingSuit: player.missingSuit,
      })),
    },
    localSeat,
    snapshot.claimWindow.tile,
  );
}

function getLocalSelfDrawHuCheck(
  snapshot: ClientVisibleRoomState | null,
  localSeat: PlayerId | null | undefined,
): ReturnType<typeof checkCurrentPlayerHu> | null {
  if (
    snapshot?.round === null ||
    snapshot?.round === undefined ||
    localSeat === null ||
    localSeat === undefined ||
    snapshot.round.currentPlayer !== localSeat
  ) {
    return null;
  }

  const localPlayer = snapshot.round.players[localSeat];

  if (localPlayer.hand === null) {
    return null;
  }

  return checkCurrentPlayerHu({
    seed: "client-redacted",
    dealer: snapshot.round.dealer,
    currentPlayer: snapshot.round.currentPlayer,
    wall: [],
    players: snapshot.round.players.map((player) => ({
      id: player.id,
      hand: player.id === localSeat ? localPlayer.hand ?? [] : [],
      discards: player.discards,
      melds: visibleMeldsToInternal(player.melds),
      hasWon: player.hasWon,
      claimedWinningTile: null,
      missingSuit: player.missingSuit,
    })),
  });
}

function webSocketClaimHuHint(check: ReturnType<typeof checkDiscardHu> | null, canRespond: boolean): string {
  if (!canRespond) {
    return "暂无可响应胡牌";
  }

  if (check === null) {
    return "等待服务端校验";
  }

  if (!check.canHu) {
    return "当前不能点炮胡";
  }

  return `可胡，约 ${check.score.cappedPoints} 分 · ${check.patterns.map(patternText).join("、")}${genText(check.score.genCount, " · ")}`;
}

function claimWindowHasHuPriority(snapshot: ClientVisibleRoomState | null): boolean {
  return snapshot?.claimWindow !== null && snapshot?.claimWindow !== undefined;
}

function getActiveAnGangCandidates(
  round: ClientVisibleRoomState["round"],
  localSeat: PlayerId | null | undefined,
  localPlayer: VisiblePlayerState | null | undefined,
  allowed: boolean,
): Tile[] {
  if (!canTryActiveGang(round, localSeat, localPlayer, allowed)) {
    return [];
  }

  const hand = localPlayer.hand ?? [];
  return uniqueTiles(hand).filter((tile) => countUsableGangTiles(hand, tile) >= 4);
}

function getActiveBaGangCandidates(
  round: ClientVisibleRoomState["round"],
  localSeat: PlayerId | null | undefined,
  localPlayer: VisiblePlayerState | null | undefined,
  allowed: boolean,
): Tile[] {
  if (!canTryActiveGang(round, localSeat, localPlayer, allowed)) {
    return [];
  }

  const hand = localPlayer.hand ?? [];
  return visibleMeldsToInternal(localPlayer.melds)
    .filter((meld) => meld.type === "peng" && countUsableGangTiles(hand, meld.tile) >= 1)
    .map((meld) => meld.tile);
}

function canTryActiveGang(
  round: ClientVisibleRoomState["round"],
  localSeat: PlayerId | null | undefined,
  localPlayer: VisiblePlayerState | null | undefined,
  allowed: boolean,
): localPlayer is VisiblePlayerState & { hand: Tile[] } {
  return (
    round !== null &&
    localSeat === round.currentPlayer &&
    localPlayer !== null &&
    localPlayer !== undefined &&
    localPlayer.hand !== null &&
    allowed
  );
}

function uniqueTiles(tiles: Tile[]): Tile[] {
  return tiles.filter((tile, index) => tiles.findIndex((value) => tilesEqual(value, tile)) === index);
}

function visibleMeldsToInternal(melds: VisiblePlayerState["melds"]): Meld[] {
  return melds.filter((meld): meld is Meld => meld.tile !== null);
}

function countUsableGangTiles(hand: Tile[], target: Tile): number {
  return hand.filter((tile) => tilesEqual(tile, target) || (isYaoJiTile(tile) && !tilesEqual(tile, target))).length;
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

function WebSocketExperimentPanel({
  onPreviewChange,
  actionsRef,
}: {
  onPreviewChange: (preview: WebSocketPreviewState) => void;
  actionsRef: { current: WebSocketPreviewActions | null };
}) {
  const hostTransport = useRef<WebSocketRoomTransport | null>(null);
  const guestTransport = useRef<WebSocketRoomTransport | null>(null);
  const helperTransports = useRef<WebSocketRoomTransport[]>([]);
  const [serverUrl, setServerUrl] = useState(webSocketExperimentUrl);
  const [experimentRoomId, setExperimentRoomId] = useState(createWebSocketExperimentRoomId);
  const [connectionStatus, setConnectionStatus] = useState<WebSocketConnectionStatus>("idle");
  const [hostState, setHostState] = useState<WebSocketRoomTransportState | null>(null);
  const [guestState, setGuestState] = useState<WebSocketRoomTransportState | null>(null);
  const [helperStates, setHelperStates] = useState<WebSocketRoomTransportState[]>([]);
  const [stepStates, setStepStates] = useState<WebSocketStepStates>(createInitialWebSocketStepStates);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, text: "真实 WebSocket 实验区尚未连接；当前牌桌仍使用本地 mock transport。" },
  ]);

  useEffect(
    () => () => {
      hostTransport.current?.close();
      guestTransport.current?.close();
      helperTransports.current.forEach((transport) => transport.close());
    },
    [],
  );

  useEffect(() => {
    if (connectionStatus !== "connected") {
      return;
    }

    const timer = window.setInterval(() => {
      const primaryTransports = [hostTransport.current, guestTransport.current].filter(
        (transport): transport is WebSocketRoomTransport => transport !== null,
      );

      if (primaryTransports.some((transport) => transport.getState().status === "closed")) {
        setConnectionStatus("error");
        setWebSocketStep("connection", "error", "连接已中断，当前客户端已离线，可使用 session 恢复。");
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [connectionStatus]);

  useEffect(() => {
    actionsRef.current = {
      chooseMissingSuit: handleChooseWebSocketMissingSuit,
      drawTile: handleDrawWebSocketTile,
      drawGangTile: handleDrawWebSocketGangTile,
      discardTile: handleDiscardWebSocketTile,
      passClaim: handlePassWebSocketClaim,
      claimHu: handleClaimWebSocketHu,
      claimSelfDrawHu: handleClaimWebSocketSelfDrawHu,
      claimPeng: handleClaimWebSocketPeng,
      claimMingGang: handleClaimWebSocketMingGang,
      claimAnGang: handleClaimWebSocketAnGang,
      claimBaGang: handleClaimWebSocketBaGang,
      passQiangGang: handlePassWebSocketQiangGang,
      claimQiangGangHu: handleClaimWebSocketQiangGangHu,
    };

    return () => {
      actionsRef.current = null;
    };
  });

  const connected = connectionStatus === "connected";

  function setWebSocketStep(key: WebSocketStepKey, status: WebSocketStepStatus, message: string) {
    setStepStates((items) => ({
      ...items,
      [key]: {
        ...items[key],
        status,
        message,
      },
    }));
  }

  async function ensureExperimentTransports(): Promise<{
    host: WebSocketRoomTransport;
    guest: WebSocketRoomTransport;
  }> {
    if (hostTransport.current !== null && guestTransport.current !== null) {
      setWebSocketStep("connection", "success", "已连接本地 dev server。");
      return { host: hostTransport.current, guest: guestTransport.current };
    }

    setConnectionStatus("connecting");
    setWebSocketStep("connection", "running", "正在连接本地 dev server。");
    appendWebSocketLog("正在连接本地 WebSocket dev server。");

    try {
      const [host, guest] = await Promise.all([
        createWebSocketRoomTransport({ url: serverUrl, roomId: experimentRoomId }),
        createWebSocketRoomTransport({ url: serverUrl, roomId: experimentRoomId }),
      ]);
      hostTransport.current = host;
      guestTransport.current = guest;
      setConnectionStatus("connected");
      setWebSocketStep("connection", "success", "已建立 host/guest 两条连接。");
      syncTransportState();
      appendWebSocketLog("已建立 host/guest 两条真实 WebSocket 连接。");
      return { host, guest };
    } catch {
      setConnectionStatus("error");
      setWebSocketStep("connection", "error", "连接失败：请先运行 npm run dev:server。");
      appendWebSocketLog("连接失败：请先运行 npm run dev:server，或检查服务器地址。");
      throw new Error("WebSocket connection failed.");
    }
  }

  function syncTransportState() {
    const nextHostState = hostTransport.current?.getState() ?? null;
    const nextGuestState = guestTransport.current?.getState() ?? null;
    setHostState(nextHostState);
    setGuestState(nextGuestState);
    const nextHelperStates = helperTransports.current.map((transport) => transport.getState());
    setHelperStates(nextHelperStates);
    onPreviewChange({
      host: nextHostState,
      guest: nextGuestState,
      helpers: nextHelperStates,
    });
    saveWebSocketRecoveryRecord(nextHostState, "player-1");
    saveWebSocketRecoveryRecord(nextGuestState, "player-2");
  }

  function appendWebSocketLog(text: string) {
    setLogs((items) => [...items, { id: (items.at(-1)?.id ?? 0) + 1, text }].slice(-6));
  }

  async function handleConnectWebSocket() {
    await ensureExperimentTransports().catch(() => undefined);
  }

  async function handleCreateWebSocketRoom() {
    const transports = await ensureExperimentTransports().catch(() => null);

    if (transports === null) {
      syncTransportState();
      return;
    }

    setWebSocketStep("create", "running", "Host 正在向服务端发送 createRoom。");
    const duplicateCreate = transports.host.getSessionToken("player-1") !== undefined;
    const result = await transports.host.createRoomSession({ displayName: "WebSocket 玩家 1" });

    if (result.ok) {
      await waitForWebSocketView(transports.host, "player-1", (view) =>
        view.eventLog.some((event) => event.type === "playerJoined"),
      );
      setWebSocketStep("create", "success", "房间创建成功，Host 已拿到房主 session。");
    } else if (duplicateCreate) {
      setWebSocketStep("create", "error", `重复创建被拒绝：${webSocketActionErrorText(result)}。`);
    } else {
      setWebSocketStep("create", "error", `创建失败：${webSocketActionErrorText(result)}。`);
    }

    appendWebSocketLog(`createRoom：${webSocketActionText(result)}。`);
    syncTransportState();

    if (result.ok) {
      appendWebSocketLog("Host 已具备房主 session。");
    }
  }

  async function ensureWebSocketRoomCreated(): Promise<{
    host: WebSocketRoomTransport;
    guest: WebSocketRoomTransport;
  } | null> {
    const transports = await ensureExperimentTransports().catch(() => null);

    if (transports === null) {
      return null;
    }

    if (transports.host.getSessionToken("player-1") === undefined) {
      setWebSocketStep("create", "running", "Host 正在创建房间。");
      const result = await transports.host.createRoomSession({ displayName: "WebSocket 玩家 1" });
      if (!result.ok) {
        setWebSocketStep("create", "error", `创建失败：${webSocketActionErrorText(result)}。`);
        appendWebSocketLog(`createRoom：${webSocketActionText(result)}。`);
        return null;
      }
      await waitForWebSocketView(transports.host, "player-1", (view) => view.eventLog.some((event) => event.type === "playerJoined"));
      setWebSocketStep("create", "success", "房间创建成功。");
      appendWebSocketLog(`createRoom：${webSocketActionText(result)}。`);
    }

    return transports;
  }

  async function handleJoinWebSocketRoom() {
    const transports = await ensureGuestJoined();
    syncTransportState();

    if (transports !== null) {
      appendWebSocketLog("Guest 已具备玩家 2 session。");
    }
  }

  async function ensureGuestJoined(): Promise<{
    host: WebSocketRoomTransport;
    guest: WebSocketRoomTransport;
  } | null> {
    const transports = await ensureWebSocketRoomCreated();

    if (transports === null) {
      return null;
    }

    if (transports.guest.getSessionToken("player-2") === undefined) {
      setWebSocketStep("join", "running", "Guest 正在加入房间。");
      const result = await transports.guest.joinRoomSession({ displayName: "WebSocket 玩家 2" });
      if (!result.ok) {
        setWebSocketStep("join", "error", `加入失败：${webSocketActionErrorText(result)}。`);
        appendWebSocketLog(`joinRoom：${webSocketActionText(result)}。`);
        return null;
      }
      await waitForWebSocketView(transports.guest, "player-2", (view) => view.eventLog.at(-1)?.type === "playerJoined");
      await waitForWebSocketView(transports.host, "player-1", (view) =>
        view.eventLog.some((event) => event.type === "playerJoined" && event.playerId === "player-2"),
      );
      setWebSocketStep("join", "success", "Guest 已加入，Host 也收到广播。");
      appendWebSocketLog(`joinRoom：${webSocketActionText(result)}。`);
    }

    return transports;
  }

  async function handleHostTakeSeat() {
    const transports = await ensureWebSocketRoomCreated();

    if (transports === null) {
      return;
    }

    await takeWebSocketSeat(transports.host, "player-1", 0, "Host");
    syncTransportState();
  }

  async function handleGuestTakeSeat() {
    const transports = await ensureGuestJoined();

    if (transports === null) {
      return;
    }

    await takeWebSocketSeat(transports.guest, "player-2", 1, "Guest");
    syncTransportState();
  }

  async function handleHostReady() {
    const transports = await ensureWebSocketRoomCreated();

    if (transports === null) {
      return;
    }

    await ensureWebSocketSeat(transports.host, "player-1", 0, "Host");
    await readyWebSocketPlayer(transports.host, "player-1", 0, "Host");
    syncTransportState();
  }

  async function handleGuestReady() {
    const transports = await ensureGuestJoined();

    if (transports === null) {
      return;
    }

    await ensureWebSocketSeat(transports.guest, "player-2", 1, "Guest");
    await readyWebSocketPlayer(transports.guest, "player-2", 1, "Guest");
    syncTransportState();
  }

  async function handleStartWebSocketRound() {
    setWebSocketStep("start", "running", "正在补齐四人并请求开局。");
    const transports = await ensureFullWebSocketRoomReady();

    if (transports === null) {
      setWebSocketStep("start", "error", "开局失败：需要先完成连接、创建、加入、占座和准备。");
      return;
    }

    const result = await transports.host.startRound("player-1", 0);
    appendWebSocketLog(`startRound：${webSocketActionText(result)}。`);
    if (result.ok) {
      await waitForRoundSnapshots([transports.host, transports.guest, ...helperTransports.current]);
      setWebSocketStep("start", "success", "开局成功，四个客户端都收到 redacted snapshot。");
    } else {
      setWebSocketStep("start", "error", `开局失败：${webSocketActionErrorText(result)}。`);
    }
    syncTransportState();
  }

  async function ensureHelperPlayersJoined(): Promise<WebSocketRoomTransport[] | null> {
    const transports = await ensureExperimentTransports().catch(() => null);

    if (transports === null) {
      return null;
    }

    while (helperTransports.current.length < 2) {
      const playerNumber = helperTransports.current.length + 3;
      const helper = await createWebSocketRoomTransport({ url: serverUrl, roomId: experimentRoomId });
      helperTransports.current = [...helperTransports.current, helper];
      const result = await helper.joinRoomSession({ displayName: `WebSocket 玩家 ${playerNumber}` });
      if (!result.ok) {
        setWebSocketStep("join", "error", `玩家 ${playerNumber} 加入失败：${webSocketActionErrorText(result)}。`);
        appendWebSocketLog(`玩家 ${playerNumber} joinRoom：${webSocketActionText(result)}。`);
        return null;
      }
      await waitForWebSocketView(helper, `player-${playerNumber}`, (view) => view.eventLog.at(-1)?.type === "playerJoined");
      setWebSocketStep("join", "success", `玩家 ${playerNumber} 已加入，当前用于补齐四人流程。`);
      appendWebSocketLog(`玩家 ${playerNumber} joinRoom：${webSocketActionText(result)}。`);
    }

    return helperTransports.current;
  }

  async function ensureFullWebSocketRoomReady(): Promise<{
    host: WebSocketRoomTransport;
    guest: WebSocketRoomTransport;
  } | null> {
    const transports = await ensureGuestJoined();

    if (transports === null) {
      return null;
    }

    await ensureWebSocketSeat(transports.host, "player-1", 0, "Host");
    await readyWebSocketPlayer(transports.host, "player-1", 0, "Host");
    await ensureWebSocketSeat(transports.guest, "player-2", 1, "Guest");
    await readyWebSocketPlayer(transports.guest, "player-2", 1, "Guest");

    const helpers = await ensureHelperPlayersJoined();

    if (helpers === null) {
      return null;
    }

    for (const [index, helper] of helpers.entries()) {
      const seatId = (index + 2) as PlayerId;
      const playerId = `player-${index + 3}`;
      await ensureWebSocketSeat(helper, playerId, seatId, `玩家 ${index + 3}`);
      await readyWebSocketPlayer(helper, playerId, seatId, `玩家 ${index + 3}`);
    }

    syncTransportState();
    return transports;
  }

  async function takeWebSocketSeat(
    transport: WebSocketRoomTransport,
    playerId: string,
    seatId: PlayerId,
    label: string,
  ) {
    setWebSocketStep("seat", "running", `${label} 正在占座。`);
    const result = await transport.takeSeat(playerId, seatId);
    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => view.seats[seatId].playerId === playerId).catch(() => undefined);
      setWebSocketStep("seat", "success", `${label} 已坐到 ${seatId + 1} 号位。`);
    } else {
      setWebSocketStep("seat", "error", `${label} 占座失败：${webSocketActionErrorText(result)}。`);
    }
    appendWebSocketLog(`${label} 占座：${webSocketActionText(result)}。`);
  }

  async function ensureWebSocketSeat(
    transport: WebSocketRoomTransport,
    playerId: string,
    seatId: PlayerId,
    label: string,
  ) {
    const view = transport.getClientView(playerId);

    if (view?.seats[seatId].playerId === playerId) {
      return;
    }

    await takeWebSocketSeat(transport, playerId, seatId, label);
  }

  async function readyWebSocketPlayer(
    transport: WebSocketRoomTransport,
    playerId: string,
    seatId: PlayerId,
    label: string,
  ) {
    const view = transport.getClientView(playerId);

    if (view?.seats[seatId].ready) {
      setWebSocketStep("ready", "success", `${label} 已经是准备状态。`);
      return;
    }

    setWebSocketStep("ready", "running", `${label} 正在准备。`);
    const result = await transport.toggleReady(playerId);
    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (nextView) => nextView.seats[seatId].ready).catch(() => undefined);
      setWebSocketStep("ready", "success", `${label} 已准备。`);
    } else {
      setWebSocketStep("ready", "error", `${label} 准备失败：${webSocketActionErrorText(result)}。`);
    }
    appendWebSocketLog(`${label} 准备：${webSocketActionText(result)}。`);
  }

  async function handleChooseWebSocketMissingSuit(playerId: string, suit: Suit) {
    const transport = webSocketTransportForPlayer(playerId);

    if (transport === null) {
      setWebSocketStep("dingque", "error", `定缺失败：${playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`chooseMissingSuit：${playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    setWebSocketStep("dingque", "running", `${playerId} 正在提交定缺 ${suitText(suit)}。`);
    const result = await transport.chooseMissingSuit(playerId, suit);
    appendWebSocketLog(`chooseMissingSuit：${playerId} 选择 ${suitText(suit)}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => {
        const seatId = view.localSeatId;
        return seatId !== null && seatId !== undefined && view.round?.players[seatId].missingSuit === suit;
      }).catch(() => undefined);
      setWebSocketStep("dingque", "success", `${playerId} 已由服务端确认定缺 ${suitText(suit)}。`);
    } else {
      setWebSocketStep("dingque", "error", `定缺失败：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handleDrawWebSocketTile(playerId: string) {
    const transport = webSocketTransportForPlayer(playerId);

    if (transport === null) {
      setWebSocketStep("draw", "error", `摸牌失败：${playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`drawTile：${playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    const beforeView = transport.getClientView(playerId);
    const beforeLocalSeat = beforeView?.localSeatId;
    const beforeHandCount =
      beforeLocalSeat === null || beforeLocalSeat === undefined ? null : beforeView?.round?.players[beforeLocalSeat].handCount;

    setWebSocketStep("draw", "running", `${playerId} 正在请求服务端摸牌。`);
    const result = await transport.drawTile(playerId);
    appendWebSocketLog(`drawTile：${playerId}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => {
        const seatId = view.localSeatId;
        if (seatId === null || seatId === undefined) {
          return false;
        }

        return beforeHandCount == null || view.round?.players[seatId].handCount === beforeHandCount + 1;
      }).catch(() => undefined);
      setWebSocketStep("draw", "success", `${playerId} 已由服务端摸牌并收到更新后的 redacted snapshot。`);
    } else {
      setWebSocketStep("draw", "error", `摸牌失败：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handleDrawWebSocketGangTile(playerId: string) {
    const transport = webSocketTransportForPlayer(playerId);

    if (transport === null) {
      setWebSocketStep("draw", "error", `杠后补牌失败：${playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`drawGangTile：${playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    const beforeView = transport.getClientView(playerId);
    const beforeLocalSeat = beforeView?.localSeatId;
    const beforeHandCount =
      beforeLocalSeat === null || beforeLocalSeat === undefined
        ? null
        : beforeView?.round?.players[beforeLocalSeat].handCount;

    setWebSocketStep("draw", "running", `${playerId} 正在请求杠后补牌。`);
    const result = await transport.drawGangTile(playerId);
    appendWebSocketLog(`drawGangTile：${playerId}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => {
        const seatId = view.localSeatId;
        if (seatId === null || seatId === undefined) {
          return false;
        }

        return (
          view.gangDraw === null &&
          (beforeHandCount == null || view.round?.players[seatId].handCount === beforeHandCount + 1)
        );
      }).catch(() => undefined);
      setWebSocketStep("draw", "success", `${playerId} 已完成杠后补牌，进入出牌阶段。`);
    } else {
      setWebSocketStep("draw", "error", `杠后补牌失败：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handleDiscardWebSocketTile(playerId: string, tile: Tile) {
    const transport = webSocketTransportForPlayer(playerId);

    if (transport === null) {
      setWebSocketStep("discard", "error", `出牌失败：${playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`discardTile：${playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    const beforeView = transport.getClientView(playerId);
    const beforeLocalSeat = beforeView?.localSeatId;
    const beforeDiscardCount =
      beforeLocalSeat === null || beforeLocalSeat === undefined
        ? null
        : beforeView?.round?.players[beforeLocalSeat].discards.length;

    setWebSocketStep("discard", "running", `${playerId} 正在请求服务端打出 ${tileText(tile)}。`);
    const result = await transport.discardTile(playerId, tile);
    appendWebSocketLog(`discardTile：${playerId} 打出 ${tileText(tile)}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => {
        const seatId = view.localSeatId;
        if (seatId === null || seatId === undefined) {
          return false;
        }

        return beforeDiscardCount == null || view.round?.players[seatId].discards.length === beforeDiscardCount + 1;
      }).catch(() => undefined);
      setWebSocketStep("discard", "success", `${playerId} 已由服务端确认打出 ${tileText(tile)}。`);
    } else {
      setWebSocketStep("discard", "error", `出牌失败：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handlePassWebSocketClaim(playerId: string) {
    const transport = webSocketTransportForPlayer(playerId);

    if (transport === null) {
      setWebSocketStep("claim", "error", `过牌失败：${playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`passClaim：${playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    setWebSocketStep("claim", "running", `${playerId} 正在提交过牌。`);
    const result = await transport.passClaim(playerId);
    appendWebSocketLog(`passClaim：${playerId}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => {
        return view.claimWindow === null || (
          view.claimWindow.hasRespondedByMe && view.claimWindow.responseByMe === "pass"
        );
      }).catch(() => undefined);
      setWebSocketStep("claim", "success", `${playerId} 已由服务端确认过牌。`);
    } else {
      setWebSocketStep("claim", "error", `过牌失败：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handleClaimWebSocketHu(playerId: string) {
    const transport = webSocketTransportForPlayer(playerId);

    if (transport === null) {
      setWebSocketStep("claim", "error", `胡牌失败：${playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`claimHu：${playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    setWebSocketStep("claim", "running", `${playerId} 正在请求点炮胡。`);
    const result = await transport.claimHu(playerId);
    appendWebSocketLog(`claimHu：${playerId}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => {
        return view.claimWindow === null || (
          view.claimWindow.hasRespondedByMe && view.claimWindow.responseByMe === "hu"
        );
      }).catch(() => undefined);
      setWebSocketStep("claim", "success", `${playerId} 已由服务端确认点炮胡。`);
    } else {
      setWebSocketStep("claim", "error", `胡牌失败：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handleClaimWebSocketSelfDrawHu(playerId: string) {
    const transport = webSocketTransportForPlayer(playerId);

    if (transport === null) {
      setWebSocketStep("claim", "error", `自摸胡失败：${playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`claimSelfDrawHu：${playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    setWebSocketStep("claim", "running", `${playerId} 正在请求自摸胡。`);
    const result = await transport.claimSelfDrawHu(playerId);
    appendWebSocketLog(`claimSelfDrawHu：${playerId}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => {
        const seatId = view.localSeatId;
        return seatId !== null && seatId !== undefined && (view.round?.players[seatId].hasWon ?? false);
      }).catch(() => undefined);
      setWebSocketStep("claim", "success", `${playerId} 已由服务端确认自摸胡，血战继续。`);
    } else {
      setWebSocketStep("claim", "error", `自摸胡失败：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handleClaimWebSocketPeng(playerId: string) {
    await handleClaimWebSocketMeld({
      playerId,
      actionName: "claimPeng",
      missingSessionText: "碰牌失败",
      runningText: `${playerId} 正在请求碰牌。`,
      successText: `${playerId} 已由服务端确认碰牌，现在轮到该玩家出牌。`,
      errorText: "碰牌失败",
      send: (transport) => transport.claimPeng(playerId),
    });
  }

  async function handleClaimWebSocketMingGang(playerId: string) {
    await handleClaimWebSocketMeld({
      playerId,
      actionName: "claimMingGang",
      missingSessionText: "明杠失败",
      runningText: `${playerId} 正在请求明杠。`,
      successText: `${playerId} 已由服务端确认明杠，现在进入杠后摸牌状态。`,
      errorText: "明杠失败",
      send: (transport) => transport.claimMingGang(playerId),
    });
  }

  async function handleClaimWebSocketAnGang(playerId: string, tile: Tile) {
    await handleActiveWebSocketGang({
      playerId,
      tile,
      actionName: "claimAnGang",
      missingSessionText: "暗杠失败",
      runningText: `${playerId} 正在请求暗杠 ${tileText(tile)}。`,
      successText: `${playerId} 已由服务端确认暗杠 ${tileText(tile)}。`,
      errorText: "暗杠失败",
      send: (transport) => transport.claimAnGang(playerId, tile),
    });
  }

  async function handleClaimWebSocketBaGang(playerId: string, tile: Tile) {
    await handleActiveWebSocketGang({
      playerId,
      tile,
      actionName: "claimBaGang",
      missingSessionText: "巴杠失败",
      runningText: `${playerId} 正在请求巴杠 ${tileText(tile)}。`,
      successText: `${playerId} 已由服务端确认巴杠 ${tileText(tile)}，已预留抢杠胡窗口。`,
      errorText: "巴杠失败",
      send: (transport) => transport.claimBaGang(playerId, tile),
    });
  }

  async function handleActiveWebSocketGang(input: {
    playerId: string;
    tile: Tile;
    actionName: "claimAnGang" | "claimBaGang";
    missingSessionText: string;
    runningText: string;
    successText: string;
    errorText: string;
    send: (transport: WebSocketRoomTransport) => Promise<WebSocketRoomTransportActionResult>;
  }) {
    const transport = webSocketTransportForPlayer(input.playerId);

    if (transport === null) {
      setWebSocketStep("claim", "error", `${input.missingSessionText}：${input.playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`${input.actionName}：${input.playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    const beforeView = transport.getClientView(input.playerId);
    const beforeLocalSeat = beforeView?.localSeatId;
    const beforeMeldCount =
      beforeLocalSeat === null || beforeLocalSeat === undefined
        ? null
        : beforeView?.round?.players[beforeLocalSeat].melds.length;

    setWebSocketStep("claim", "running", input.runningText);
    const result = await input.send(transport);
    appendWebSocketLog(`${input.actionName}：${input.playerId} ${tileText(input.tile)}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, input.playerId, (view) => {
        const seatId = view.localSeatId;

        if (seatId === null || seatId === undefined) {
          return false;
        }

        if (input.actionName === "claimBaGang") {
          return view.phase === "qiangGang" && view.baGangClaimWindow?.upgradedBySeatId === seatId;
        }

        return beforeMeldCount == null || view.round?.players[seatId].melds.length === beforeMeldCount + 1;
      }).catch(() => undefined);
      setWebSocketStep("claim", "success", input.successText);
    } else {
      setWebSocketStep("claim", "error", `${input.errorText}：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handlePassWebSocketQiangGang(playerId: string) {
    const transport = webSocketTransportForPlayer(playerId);

    if (transport === null) {
      setWebSocketStep("claim", "error", `抢杠过牌失败：${playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`passQiangGang：${playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    setWebSocketStep("claim", "running", `${playerId} 正在提交抢杠过牌。`);
    const result = await transport.passQiangGang(playerId);
    appendWebSocketLog(`passQiangGang：${playerId}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => {
        return view.baGangClaimWindow === null || (
          view.baGangClaimWindow.hasRespondedByMe && view.baGangClaimWindow.responseByMe === "pass"
        );
      }).catch(() => undefined);
      setWebSocketStep("claim", "success", `${playerId} 已由服务端确认抢杠过牌。`);
    } else {
      setWebSocketStep("claim", "error", `抢杠过牌失败：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handleClaimWebSocketQiangGangHu(playerId: string) {
    const transport = webSocketTransportForPlayer(playerId);

    if (transport === null) {
      setWebSocketStep("claim", "error", `抢杠胡失败：${playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`claimQiangGangHu：${playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    setWebSocketStep("claim", "running", `${playerId} 正在请求抢杠胡。`);
    const result = await transport.claimQiangGangHu(playerId);
    appendWebSocketLog(`claimQiangGangHu：${playerId}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, playerId, (view) => {
        return view.baGangClaimWindow === null || (
          view.baGangClaimWindow.hasRespondedByMe && view.baGangClaimWindow.responseByMe === "hu"
        );
      }).catch(() => undefined);
      setWebSocketStep("claim", "success", `${playerId} 已由服务端确认抢杠胡。`);
    } else {
      setWebSocketStep("claim", "error", `抢杠胡失败：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  async function handleClaimWebSocketMeld(input: {
    playerId: string;
    actionName: "claimPeng" | "claimMingGang";
    missingSessionText: string;
    runningText: string;
    successText: string;
    errorText: string;
    send: (transport: WebSocketRoomTransport) => Promise<WebSocketRoomTransportActionResult>;
  }) {
    const transport = webSocketTransportForPlayer(input.playerId);

    if (transport === null) {
      setWebSocketStep("claim", "error", `${input.missingSessionText}：${input.playerId} 还没有可用的 WebSocket session。`);
      appendWebSocketLog(`${input.actionName}：${input.playerId} 缺少 WebSocket session。`);
      syncTransportState();
      return;
    }

    const beforeView = transport.getClientView(input.playerId);
    const beforeLocalSeat = beforeView?.localSeatId;
    const beforeMeldCount =
      beforeLocalSeat === null || beforeLocalSeat === undefined
        ? null
        : beforeView?.round?.players[beforeLocalSeat].melds.length;

    setWebSocketStep("claim", "running", input.runningText);
    const result = await input.send(transport);
    appendWebSocketLog(`${input.actionName}：${input.playerId}，${webSocketActionText(result)}。`);

    if (result.ok) {
      await waitForWebSocketView(transport, input.playerId, (view) => {
        const seatId = view.localSeatId;

        if (seatId === null || seatId === undefined) {
          return false;
        }

        return (
          view.claimWindow === null &&
          view.round?.currentPlayer === seatId &&
          (beforeMeldCount == null || view.round.players[seatId].melds.length === beforeMeldCount + 1)
        );
      }).catch(() => undefined);
      setWebSocketStep("claim", "success", input.successText);
    } else {
      setWebSocketStep("claim", "error", `${input.errorText}：${webSocketActionErrorText(result)}。`);
    }

    syncTransportState();
  }

  function webSocketTransportForPlayer(playerId: string): WebSocketRoomTransport | null {
    if (playerId === "player-1") {
      return hostTransport.current;
    }

    if (playerId === "player-2") {
      return guestTransport.current;
    }

    const helperIndex = Number(playerId.replace("player-", "")) - 3;
    return helperTransports.current[helperIndex] ?? null;
  }

  async function handleRunWebSocketDemo() {
    setWebSocketStep("start", "running", "正在补齐四人并开局。");
    const transports = await ensureFullWebSocketRoomReady();

    if (transports === null) {
      setWebSocketStep("start", "error", "完整流程失败：请确认本地 server 已启动，且房间还能继续加入/开局。");
      return;
    }

    const result = await transports.host.startRound("player-1", 0);
    appendWebSocketLog(`startRound：${webSocketActionText(result)}。`);
    if (result.ok) {
      await waitForRoundSnapshots([transports.host, transports.guest, ...helperTransports.current]);
      setWebSocketStep("start", "success", "完整流程成功，四个客户端已进入定缺阶段。");
    } else {
      setWebSocketStep("start", "error", `开局失败：${webSocketActionErrorText(result)}。`);
    }
    syncTransportState();
  }

  async function handleSimulateRefreshAndResume() {
    const hostRecord = loadWebSocketRecoveryRecord("player-1");
    const guestRecord = loadWebSocketRecoveryRecord("player-2");

    if (hostRecord === null || guestRecord === null) {
      const missingLabel = hostRecord === null && guestRecord === null ? "host/guest" : hostRecord === null ? "host" : "guest";
      setWebSocketStep("resume", "error", `恢复失败：缺少 ${missingLabel} 本地 session，请先完成创建和加入。`);
      appendWebSocketLog(`恢复失败：localStorage 里缺少 ${missingLabel} 的 sessionToken 和 lastEventId。`);
      return;
    }

    setWebSocketStep("resume", "running", "正在模拟页面刷新，并用本地 session 恢复 host/guest。");
    setConnectionStatus("reconnecting");
    setWebSocketStep("connection", "running", "正在重连并恢复 host/guest session。");
    appendWebSocketLog("模拟刷新：关闭 host/guest 连接，保留本地 sessionToken。");

    hostTransport.current?.close();
    guestTransport.current?.close();
    hostTransport.current = null;
    guestTransport.current = null;
    setHostState(null);
    setGuestState(null);

    try {
      setServerUrl(hostRecord.url);
      setExperimentRoomId(hostRecord.roomId);
      const [nextHost, nextGuest] = await Promise.all([
        createWebSocketRoomTransport({ url: hostRecord.url, roomId: hostRecord.roomId }),
        createWebSocketRoomTransport({ url: guestRecord.url, roomId: guestRecord.roomId }),
      ]);

      hostTransport.current = nextHost;
      guestTransport.current = nextGuest;

      const hostResult = await nextHost.resumeSession({
        sessionToken: hostRecord.sessionToken,
        lastSeenEventId: hostRecord.lastEventId,
      });
      const guestResult = await nextGuest.resumeSession({
        sessionToken: guestRecord.sessionToken,
        lastSeenEventId: guestRecord.lastEventId,
      });

      if (!hostResult.ok || !guestResult.ok) {
        const reason = !hostResult.ok ? webSocketResumeFailureText(hostResult) : webSocketResumeFailureText(guestResult);
        setWebSocketStep("resume", "error", `恢复失败：${reason}。`);
        setConnectionStatus("error");
        setWebSocketStep("connection", "error", "连接已建立，但 session 恢复失败。");
        appendWebSocketLog(`resumeSession：恢复失败，${reason}。`);
        syncTransportState();
        return;
      }

      await Promise.all([
        waitForWebSocketView(nextHost, "player-1", (view) => view.localSeatId !== undefined),
        waitForWebSocketView(nextGuest, "player-2", (view) => view.localSeatId !== undefined),
      ]);
      const missedEvents = countWebSocketResumeEvents(nextHost.getState(), "player-1") + countWebSocketResumeEvents(nextGuest.getState(), "player-2");
      setConnectionStatus("connected");
      setWebSocketStep("connection", "success", "host/guest 连接正常，session 已恢复。");
      setWebSocketStep("resume", "success", `恢复成功：host/guest 已拉回 redacted snapshot，补回 ${missedEvents} 条 missed events。`);
      appendWebSocketLog(`resumeSession：恢复成功，补回 ${missedEvents} 条 missed events。`);
      syncTransportState();
    } catch {
      setConnectionStatus("error");
      setWebSocketStep("resume", "error", "恢复失败：连接失败，请确认 dev server 仍在运行。");
      appendWebSocketLog("恢复失败：WebSocket 连接失败，请确认 npm run dev:server 已启动且地址正确。");
    }
  }

  function handleClearSavedWebSocketSessions() {
    clearWebSocketRecoveryRecords();
    setWebSocketStep("resume", "success", "已清除 host/guest 本地 session；再次恢复会提示缺少本地 session。");
    appendWebSocketLog("已清除 localStorage 中保存的 host/guest session。");
  }

  function handleResetWebSocketExperiment() {
    hostTransport.current?.close();
    guestTransport.current?.close();
    helperTransports.current.forEach((transport) => transport.close());
    hostTransport.current = null;
    guestTransport.current = null;
    helperTransports.current = [];
    setConnectionStatus("idle");
    setExperimentRoomId(createWebSocketExperimentRoomId());
    setHostState(null);
    setGuestState(null);
    setHelperStates([]);
    onPreviewChange({ host: null, guest: null, helpers: [] });
    setStepStates(createInitialWebSocketStepStates());
    clearWebSocketRecoveryRecords();
    setLogs([{ id: 1, text: "真实 WebSocket 实验区已重置；当前牌桌仍使用本地 mock transport。" }]);
  }

  return (
    <section className="websocket-panel" aria-label="真实 WebSocket 连接演示">
      <div className="websocket-header">
        <div>
          <h2>真实 WebSocket 连接演示</h2>
          <p>实验性真实传输，只验证房间消息链路，不影响当前 mock 牌桌。</p>
        </div>
        <span data-status={connectionStatus}>{webSocketStatusText(connectionStatus)}</span>
      </div>

      <div className="websocket-controls">
        <label>
          <span>服务器地址</span>
          <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} disabled={connected} />
        </label>
        <Stat label="实验房间" value={experimentRoomId} />
        <Stat label="Host 消息" value={(hostState?.messages.length ?? 0).toString()} />
        <Stat label="Guest 消息" value={(guestState?.messages.length ?? 0).toString()} />
      </div>

      <div className="websocket-actions">
        <button type="button" onClick={handleConnectWebSocket} disabled={connected || connectionStatus === "connecting"}>
          连接
        </button>
        <button type="button" onClick={handleCreateWebSocketRoom}>
          createRoom
        </button>
        <button type="button" onClick={handleJoinWebSocketRoom}>
          joinRoom
        </button>
        <button type="button" onClick={handleHostTakeSeat}>
          Host 占座
        </button>
        <button type="button" onClick={handleGuestTakeSeat}>
          Guest 占座
        </button>
        <button type="button" onClick={handleHostReady}>
          Host 准备
        </button>
        <button type="button" onClick={handleGuestReady}>
          Guest 准备
        </button>
        <button type="button" onClick={handleStartWebSocketRound}>
          补齐并开局
        </button>
        <button type="button" onClick={handleRunWebSocketDemo}>
          一键完整流程
        </button>
        <button type="button" onClick={handleSimulateRefreshAndResume}>
          模拟刷新后恢复
        </button>
        <button type="button" onClick={handleClearSavedWebSocketSessions}>
          清除已保存 session
        </button>
        <button type="button" onClick={handleResetWebSocketExperiment}>
          重置实验
        </button>
      </div>

      <div className="websocket-steps" aria-label="WebSocket 房间流程状态">
        {webSocketStepOrder.map((key) => (
          <WebSocketStepBadge key={key} step={stepStates[key]} />
        ))}
      </div>

      <div className="websocket-snapshots">
        <WebSocketSnapshotCard title="Host 客户端" state={hostState} playerId="player-1" />
        <WebSocketSnapshotCard title="Guest 客户端" state={guestState} playerId="player-2" />
        {helperStates.map((state, index) => (
          <WebSocketSnapshotCard
            key={`helper-${index + 3}`}
            title={`辅助客户端 ${index + 3}`}
            state={state}
            playerId={`player-${index + 3}`}
          />
        ))}
      </div>

      <div className="websocket-log">
        {logs.map((log) => (
          <p key={log.id}>{log.text}</p>
        ))}
      </div>
    </section>
  );
}

async function waitForWebSocketView(
  transport: WebSocketRoomTransport,
  playerId: string,
  predicate: (view: ClientVisibleRoomState) => boolean,
  timeoutMs = 3_000,
): Promise<ClientVisibleRoomState> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const view = transport.getClientView(playerId);

    if (view !== undefined && predicate(view)) {
      return view;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for ${playerId} WebSocket view.`);
}

async function waitForRoundSnapshots(transports: WebSocketRoomTransport[], timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const allStarted = transports.every((transport, index) => transport.getClientView(`player-${index + 1}`)?.round != null);

    if (allStarted) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Timed out waiting for WebSocket round snapshots.");
}

function WebSocketSnapshotCard({
  title,
  state,
  playerId,
}: {
  title: string;
  state: WebSocketRoomTransportState | null;
  playerId: string;
}) {
  const sessionToken = state?.sessionTokenByPlayerId[playerId];
  const snapshot = state?.snapshotByPlayerId[playerId];
  const occupiedSeats = snapshot?.seats.filter((seat) => seat.playerId !== null).length ?? 0;
  const readySeats = snapshot?.seats.filter((seat) => seat.ready).length ?? 0;
  const localSeat = snapshot?.localSeatId;
  const localPlayer = localSeat === null || localSeat === undefined ? null : snapshot?.round?.players[localSeat];
  const hiddenHands = snapshot?.round?.players.filter((player) => player.hand === null).length ?? 0;

  return (
    <article className="websocket-snapshot-card">
      <h3>{title}</h3>
      <span>{sessionToken ?? "暂无 session"}</span>
      <p>状态：{state?.status ?? "未连接"}</p>
      <p>座位：{occupiedSeats}/4 · 准备：{readySeats}/4</p>
      <p>房间状态：{snapshot?.status ?? "未连接"} · 本地座位：{localSeat === null || localSeat === undefined ? "-" : localSeat + 1}</p>
      <p>定缺：{suitText(localPlayer?.missingSuit ?? null)}</p>
      <p>手牌摘要：{localPlayer?.hand?.length ?? 0} 张可见 · {hiddenHands} 家隐藏</p>
      <p>最新事件：{snapshot?.eventLog.at(-1)?.type ?? "暂无"}</p>
    </article>
  );
}

function WebSocketStepBadge({ step }: { step: WebSocketStepState }) {
  return (
    <article className="websocket-step" data-status={step.status}>
      <strong>{step.label}</strong>
      <span>{webSocketStepStatusText(step.status)}</span>
      <p>{step.message}</p>
    </article>
  );
}

function createInitialWebSocketStepStates(): WebSocketStepStates {
  return {
    connection: {
      label: "连接",
      status: "idle",
      message: "等待连接本地 dev server。",
    },
    create: {
      label: "创建",
      status: "idle",
      message: "连接后由 Host 创建房间。",
    },
    join: {
      label: "加入",
      status: "idle",
      message: "房间创建后 Guest 加入。",
    },
    seat: {
      label: "占座",
      status: "idle",
      message: "玩家加入后选择座位。",
    },
    ready: {
      label: "准备",
      status: "idle",
      message: "玩家占座后切换准备状态。",
    },
    start: {
      label: "开局",
      status: "idle",
      message: "四人准备后由 Host 发起开局。",
    },
    dingque: {
      label: "定缺",
      status: "idle",
      message: "开局后玩家可在 WebSocket 桌面预览里提交定缺。",
    },
    draw: {
      label: "摸牌",
      status: "idle",
      message: "定缺完成后，当前摸牌阶段玩家可请求服务端摸牌。",
    },
    discard: {
      label: "出牌",
      status: "idle",
      message: "当前出牌阶段玩家可选择自己的可见手牌交给服务端校验。",
    },
    claim: {
      label: "响应",
      status: "idle",
      message: "出牌后等待其他玩家碰杠胡响应；当前骨架只实现过牌和超时。",
    },
    resume: {
      label: "恢复",
      status: "idle",
      message: "保存 session 后可以模拟刷新恢复。",
    },
  };
}

function saveWebSocketRecoveryRecord(state: WebSocketRoomTransportState | null, playerId: string) {
  if (state === null || !canUseLocalStorage()) {
    return;
  }

  const sessionToken = state.sessionTokenByPlayerId[playerId];
  const snapshot = state.snapshotByPlayerId[playerId];

  if (sessionToken === undefined || snapshot === undefined) {
    return;
  }

  const record: WebSocketRecoveryRecord = {
    playerId,
    roomId: state.roomId,
    url: state.url,
    sessionToken,
    lastEventId: snapshot.eventLog.length,
  };
  const snapshotMessage = state.messages.findLast(
    (message) => message.type === "roomSnapshot" && message.payload.playerId === playerId,
  );

  if (snapshotMessage?.type === "roomSnapshot") {
    record.lastEventId = snapshotMessage.payload.lastEventId;
  }

  window.localStorage.setItem(webSocketRecoveryStorageKey(playerId), JSON.stringify(record));
}

function loadWebSocketRecoveryRecord(playerId: string): WebSocketRecoveryRecord | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(webSocketRecoveryStorageKey(playerId));

  if (raw === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WebSocketRecoveryRecord>;

    if (
      parsed.playerId !== playerId ||
      typeof parsed.roomId !== "string" ||
      typeof parsed.url !== "string" ||
      typeof parsed.sessionToken !== "string" ||
      typeof parsed.lastEventId !== "number"
    ) {
      return null;
    }

    return {
      playerId: parsed.playerId,
      roomId: parsed.roomId,
      url: parsed.url,
      sessionToken: parsed.sessionToken,
      lastEventId: parsed.lastEventId,
    };
  } catch {
    return null;
  }
}

function clearWebSocketRecoveryRecords() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(webSocketRecoveryStorageKey("player-1"));
  window.localStorage.removeItem(webSocketRecoveryStorageKey("player-2"));
}

function webSocketRecoveryStorageKey(playerId: string): string {
  return `${webSocketRecoveryStoragePrefix}${playerId}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && window.localStorage !== undefined;
}

function countWebSocketResumeEvents(state: WebSocketRoomTransportState, playerId: string): number {
  const snapshot = state.messages.findLast((message) => message.type === "roomSnapshot" && message.payload.playerId === playerId);

  return snapshot?.type === "roomSnapshot" ? snapshot.payload.events.length : 0;
}

function getWebSocketPreviewPrimary(preview: WebSocketPreviewState): WebSocketRoomTransportState | null {
  return preview.host ?? preview.guest ?? preview.helpers[0] ?? null;
}

function getWebSocketPreviewSnapshot(
  state: WebSocketRoomTransportState | null,
  playerId: string,
): ClientVisibleRoomState | null {
  return state?.snapshotByPlayerId[playerId] ?? null;
}

function getWebSocketPreviewClients(preview: WebSocketPreviewState): WebSocketPreviewClient[] {
  const baseClients: Array<{ title: string; playerId: string; state: WebSocketRoomTransportState | null }> = [
    { title: "Host 客户端", playerId: "player-1", state: preview.host },
    { title: "Guest 客户端", playerId: "player-2", state: preview.guest },
    ...preview.helpers.map((state, index) => ({
      title: `辅助客户端 ${index + 3}`,
      playerId: `player-${index + 3}`,
      state,
    })),
  ];

  return baseClients.map((client) => ({
    ...client,
    snapshot: getWebSocketPreviewSnapshot(client.state, client.playerId),
    sessionToken: client.state?.sessionTokenByPlayerId[client.playerId] ?? null,
  }));
}

function createWebSocketExperimentRoomId(): string {
  return `WS-${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function webSocketActionText(result: WebSocketRoomTransportActionResult): string {
  if (result.ok) {
    return "服务端已接受";
  }

  if (result.reason === "actionRejected") {
    return `服务端拒绝 ${result.rejectedMessage?.payload.code ?? "unknown"}`;
  }

  if (result.reason === "missingSessionToken") {
    return "缺少 sessionToken";
  }

  if (result.reason === "closed") {
    return "连接已关闭";
  }

  return "等待响应超时";
}

function webSocketActionErrorText(result: WebSocketRoomTransportActionResult): string {
  if (result.ok) {
    return "没有错误";
  }

  if (result.reason === "actionRejected") {
    return webSocketErrorCodeText(result.rejectedMessage?.payload.code ?? "unknown");
  }

  if (result.reason === "missingSessionToken") {
    return "缺少 sessionToken，请先创建或加入房间";
  }

  if (result.reason === "closed") {
    return "连接已关闭，请重置实验后重新连接";
  }

  return "等待服务端响应超时";
}

function webSocketResumeFailureText(result: WebSocketRoomTransportActionResult): string {
  if (result.ok) {
    return "没有错误";
  }

  if (result.reason === "actionRejected") {
    const code = result.rejectedMessage?.payload.code;

    if (code === "roomNotFound") {
      return "房间已不存在，可能是 dev server 重启或服务端房间状态被清空";
    }

    if (code === "invalidSession") {
      return "session 无效或已过期，请重新创建/加入房间";
    }

    return webSocketErrorCodeText(code ?? "unknown");
  }

  if (result.reason === "timeout") {
    return "服务端没有返回恢复结果，可能是旧 session 没有可投递连接";
  }

  if (result.reason === "closed") {
    return "连接已关闭，请重新连接后再恢复";
  }

  return webSocketActionErrorText(result);
}

function webSocketErrorCodeText(code: string): string {
  const messages: Record<string, string> = {
    roomNotFound: "房间不存在，请先创建房间",
    roomAlreadyExists: "房间已经存在，不能重复创建",
    roomAlreadyStarted: "房间已经开局",
    roomFull: "房间已满",
    playerAlreadyJoined: "玩家已经加入房间",
    playerNotInRoom: "玩家还没有加入房间",
    seatOccupied: "座位已被占用",
    playerAlreadySeated: "玩家已经占座",
    playerNotSeated: "玩家还没有占座",
    notAllPlayersReady: "还有玩家没有准备",
    roundNotStarted: "牌局还没有开局，开局后才能定缺",
    missingSuitNotSet: "还有玩家没有完成定缺",
    missingSuitAlreadyChosen: "该玩家已经定缺，不能重复提交",
    notCurrentPlayer: "还没轮到该玩家",
    notDrawPhase: "当前不是摸牌阶段",
    notDiscardPhase: "当前不是出牌阶段",
    roundFinished: "本局已经结束",
    gangDrawPending: "当前正在等待杠后补牌",
    noGangDraw: "当前没有杠后补牌状态",
    wallEmpty: "牌墙已经摸完",
    playerAlreadyWon: "该玩家已经胡牌",
    tileNotInHand: "手里没有这张牌",
    mustDiscardMissingSuitFirst: "手里还有缺门牌，必须先打缺门",
    cannotDiscardYaoJi: "幺鸡/赖子不能主动打出",
    claimWindowOpen: "正在等待碰杠胡响应，暂时不能摸牌或出牌",
    noClaimWindow: "当前没有响应窗口",
    noQiangGangWindow: "当前没有抢杠胡响应窗口",
    claimNotAllowed: "这个玩家不能响应当前出牌",
    claimAlreadyResponded: "这个玩家已经响应过",
    cannotAnGang: "当前不能暗杠这张牌",
    cannotBaGang: "当前不能巴杠这张牌",
    cannotHu: "当前不能点炮胡",
    cannotPeng: "当前不能碰这张牌",
    cannotMingGang: "当前不能明杠这张牌",
    invalidSession: "session 无效，请重新加入房间",
    unknown: "未知错误",
  };
  return messages[code] ?? code;
}

function webSocketStatusText(status: WebSocketConnectionStatus): string {
  const names = {
    idle: "已离线",
    connecting: "正在连接",
    connected: "连接正常",
    reconnecting: "正在重连",
    error: "已离线",
  };
  return names[status];
}

function webSocketStepStatusText(status: WebSocketStepStatus): string {
  const names = {
    idle: "待开始",
    running: "进行中",
    success: "成功",
    error: "失败",
  };
  return names[status];
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
          <p>房间号 {room.id} · 本地 mock transport · roomSocketAdapter · 暂无真实网络连接</p>
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
    melds: player.melds,
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

  const drawHandSize = 13 - player.melds.length * 3;
  return player.hand.length === drawHandSize ? "draw" : "discard";
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

function tilesEqual(left: Tile, right: Tile): boolean {
  return left.suit === right.suit && left.rank === right.rank;
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
    case "presenceChanged":
      return `${roomPlayerName(room, event.playerId)}${event.connected ? "已恢复连接" : "已离线"}。`;
    case "roundStarted":
      return `房间开局，庄家是玩家 ${event.dealer + 1}。`;
    case "missingSuitChosen":
      return `${roomPlayerName(room, event.playerId)} ${event.source === "heavenly" ? "天缺自动定缺" : "定缺"} ${suitText(event.suit)}。`;
    case "tileDrawn":
      return `${roomPlayerName(room, event.playerId)} 已由服务端摸牌。`;
    case "gangTileDrawn":
      return `${roomPlayerName(room, event.playerId)} 已完成杠后补牌。`;
    case "tileDiscarded":
      return `${roomPlayerName(room, event.playerId)} 打出 ${tileText(event.tile)}。`;
    case "claimWindowOpened":
      return `等待 ${event.pendingResponderCount} 位玩家响应 ${tileText(event.tile)}。`;
    case "claimPassed":
      return `${roomPlayerName(room, event.playerId)} 过牌。`;
    case "huClaimed":
      return `${roomPlayerName(room, event.playerId)} 点炮胡 ${tileText(event.tile)}，约 ${event.points} 分${genText(event.genCount)}。`;
    case "selfDrawHuClaimed":
      return `${roomPlayerName(room, event.playerId)} 自摸胡，约 ${event.points} 分${genText(event.genCount)}。`;
    case "pengClaimed":
      return `${roomPlayerName(room, event.playerId)} 碰 ${tileText(event.tile)}。`;
    case "mingGangClaimed":
      return `${roomPlayerName(room, event.playerId)} 明杠 ${tileText(event.tile)}。`;
    case "anGangClaimed":
      return `${roomPlayerName(room, event.playerId)} 暗杠 ${tileText(event.tile)}。`;
    case "baGangDeclared":
      return `${roomPlayerName(room, event.playerId)} 声明巴杠 ${tileText(event.tile)}，等待其他玩家抢杠胡。`;
    case "baGangClaimed":
      return `${roomPlayerName(room, event.playerId)} 巴杠 ${tileText(event.tile)}。`;
    case "qiangGangPassed":
      return `${roomPlayerName(room, event.playerId)} 对抢杠胡过牌。`;
    case "qiangGangHuClaimed":
      return `${roomPlayerName(room, event.playerId)} 抢杠胡 ${tileText(event.tile)}，责任玩家为 ${roomPlayerName(room, event.responsiblePlayerId)}，约 ${event.points} 分${genText(event.genCount)}。`;
    case "qiangGangWindowClosed":
      return event.reason === "robbed" || event.reason === "timeoutRobbed"
        ? `${event.reason === "timeoutRobbed" ? "抢杠响应超时，" : ""}抢杠胡成立，原碰牌保持不变。`
        : `${event.reason === "timeoutAllPassed" ? "抢杠响应超时，" : ""}无人抢胡，巴杠正式提交。`;
    case "responseWindowExpired":
      return `${event.kind === "qiangGang" ? "抢杠" : "出牌"}响应窗口超时，玩家 ${event.timedOutPlayerIds.map((seatId) => seatId + 1).join("、") || "无"} 自动过牌。`;
    case "roundEnded":
      return event.reason === "onePlayerLeft"
        ? `血战结束，只剩玩家 ${event.remainingPlayerIds.map((seatId) => seatId + 1).join("、")} 未胡。`
        : "血战结束，牌墙已摸完。";
    case "claimWindowClosed":
      return event.reason === "timeout"
        ? `响应窗口超时，轮到玩家 ${event.nextPlayer + 1} 摸牌。`
        : event.reason === "claimed"
          ? `响应已确认，轮到玩家 ${event.nextPlayer + 1} 继续操作。`
          : `全部过牌，轮到玩家 ${event.nextPlayer + 1} 摸牌。`;
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
    roomNotFound: "房间不存在",
    roomAlreadyExists: "房间已经创建",
    invalidSession: "本地会话无效",
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
    cannotDecompose: "暂时无法拆成四组一对或七对",
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
    sanLongQiDui: "三龙七",
  };
  return names[pattern] ?? pattern;
}

function settlementReasonText(reason: ClientVisibleRoomState["settlementLedger"][number]["reason"]): string {
  const labels = {
    selfDrawHu: "自摸",
    discardHu: "点炮胡",
    qiangGangHu: "抢杠胡",
    sanJi: "三鸡",
    siJi: "四鸡",
    qiangGangSanJiLiability: "抢杠三鸡包赔",
    mingGang: "明杠",
    anGang: "暗杠",
    baGang: "巴杠",
    chaJiao: "查叫",
  } as const;

  return labels[reason];
}

function genText(genCount: number, separator = "，"): string {
  return genCount > 0 ? `${separator}${genCount} 根` : "";
}
