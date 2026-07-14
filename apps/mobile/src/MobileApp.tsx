import type {
  ClientLegalAction,
  ClientRoomViewModel,
  ClientSeatViewModel,
  ClientTransportActionResult,
  ClientVisibleMeld,
  ClientVisibleRoomState,
  PersistedRoomSession,
  PlayerId,
  Suit,
  Tile,
} from "@leshan-mahjong/client-core";
import {
  canUseAction,
  descriptorForAction,
  legalTilesForAction,
  nextAutomaticDrawAction,
  suitLabel,
  tileLabel,
  toClientRoomViewModel,
} from "@leshan-mahjong/client-core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  connectMobileRoomGateway,
  latestServerEventId,
  type MobileRoomGateway,
} from "./roomGateway";
import { mobileRoomSessionStore } from "./sessionStore";
import { TileFace } from "./TileFace";

type ConnectionStatus = "idle" | "connecting" | "online" | "background" | "offline" | "error";
type Identity = { playerId: string; sessionToken: string };
type SelectedDiscard = { tile: Tile; actionId: string };
type SelectedGang = {
  action: "claimAnGang" | "claimBaGang";
  tile: Tile;
  actionId: string;
};

const seatIds: PlayerId[] = [0, 1, 2, 3];
const suits: Suit[] = ["bamboos", "dots", "characters"];

export function MobileApp() {
  const [serverUrl, setServerUrl] = useState("ws://127.0.0.1:8787");
  const [roomId, setRoomId] = useState("LSMJ-MOBILE");
  const [displayName, setDisplayName] = useState("手机玩家");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [statusText, setStatusText] = useState("尚未连接");
  const [gateway, setGateway] = useState<MobileRoomGateway | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [snapshot, setSnapshot] = useState<ClientVisibleRoomState | null>(null);
  const [storedSession, setStoredSession] = useState<PersistedRoomSession | null>(null);
  const [selectedDiscard, setSelectedDiscard] = useState<SelectedDiscard | null>(null);
  const [selectedGang, setSelectedGang] = useState<SelectedGang | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const gatewayRef = useRef<MobileRoomGateway | null>(null);
  const sessionRef = useRef<PersistedRoomSession | null>(null);
  const connectionGeneration = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastPersistedEventId = useRef(-1);
  const autoDrawInFlight = useRef<string | null>(null);
  const viewModel = useMemo(
    () => (snapshot === null ? null : toClientRoomViewModel(snapshot)),
    [snapshot],
  );

  useEffect(() => {
    void mobileRoomSessionStore.load().then((record) => {
      if (record === null) {
        return;
      }

      sessionRef.current = record;
      setStoredSession(record);
      setServerUrl(record.serverUrl);
      setRoomId(record.roomId);
      setStatusText("发现可恢复的安全会话");
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "background" || nextState === "inactive") {
        const activeGateway = gatewayRef.current;
        const activeSession = sessionRef.current;

        if (activeGateway !== null && activeSession !== null) {
          void persistSession(activeGateway, activeSession);
          activeGateway.close();
          gatewayRef.current = null;
          setGateway(null);
          resetTransientTurnState();
          setConnectionStatus("background");
          setStatusText("应用已进入后台，会话已安全保存");
        }
        return;
      }

      if (nextState === "active" && previousState !== "active" && sessionRef.current !== null) {
        void resumeStoredSession(sessionRef.current, "已从后台恢复连接");
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (gateway === null) {
      return;
    }

    return gateway.subscribe((transportState) => {
      if (transportState.snapshot !== null) {
        setSnapshot(transportState.snapshot);
        const record = sessionRef.current;
        if (record !== null && transportState.lastEventId !== lastPersistedEventId.current) {
          void persistSession(gateway, record);
        }
      }
      if (transportState.status === "closed" || transportState.status === "error") {
        setConnectionStatus("offline");
        setStatusText(transportState.lastError ?? "连接已断开，可使用恢复会话重新进入");
      }
    });
  }, [gateway]);

  useEffect(() => {
    const drawAction = nextAutomaticDrawAction(
      snapshot,
      autoDrawInFlight.current,
      sessionRef.current?.lastCompletedAutoDrawActionId,
    );
    if (gateway === null || drawAction === null) {
      return;
    }

    const actionId = drawAction.actionId;
    autoDrawInFlight.current = actionId;
    setStatusText(drawAction.action === "drawGangTile" ? "系统正在发放杠后补牌" : "轮到你了，系统正在自动摸牌");
    const request = drawAction.action === "drawGangTile"
      ? gateway.drawGangTile(actionId)
      : gateway.drawTile(actionId);
    void request.then(async (result) => {
      if (!result.ok) {
        setStatusText(actionFailureText(result.reason));
        return;
      }
      const record = sessionRef.current;
      if (record !== null) {
        const nextRecord = { ...record, lastCompletedAutoDrawActionId: actionId };
        sessionRef.current = nextRecord;
        setStoredSession(nextRecord);
        await mobileRoomSessionStore.save(nextRecord);
      }
      setStatusText("已自动摸牌，请选择一张合法手牌打出");
    }).finally(() => {
      autoDrawInFlight.current = null;
    });
  }, [gateway, snapshot]);

  useEffect(() => {
    if (selectedDiscard === null) {
      return;
    }
    const descriptor = descriptorForAction(snapshot, "discardTile");
    const stillLegal = descriptor?.actionId === selectedDiscard.actionId
      && legalTilesForAction(snapshot, "discardTile").some((tile) => sameTile(tile, selectedDiscard.tile));
    if (!stillLegal) {
      setSelectedDiscard(null);
    }
  }, [selectedDiscard, snapshot]);

  useEffect(() => {
    if (selectedGang === null) {
      return;
    }
    const descriptor = descriptorForAction(snapshot, selectedGang.action);
    const stillLegal = descriptor?.actionId === selectedGang.actionId
      && legalTilesForAction(snapshot, selectedGang.action).some((tile) => sameTile(tile, selectedGang.tile));
    if (!stillLegal) {
      setSelectedGang(null);
    }
  }, [selectedGang, snapshot]);

  async function createOrJoinRoom(mode: "create" | "join") {
    if (serverUrl.trim() === "" || roomId.trim() === "" || displayName.trim() === "") {
      setConnectionStatus("error");
      setStatusText("请填写服务器、房间号和昵称");
      return;
    }

    const generation = ++connectionGeneration.current;
    closeCurrentGateway();
    setConnectionStatus("connecting");
    setStatusText(mode === "create" ? "正在创建房间" : "正在加入房间");

    try {
      const nextGateway = await connectMobileRoomGateway({ serverUrl, roomId });
      const result = mode === "create"
        ? await nextGateway.createRoomSession({ displayName: displayName.trim() })
        : await nextGateway.joinRoomSession({ displayName: displayName.trim() });

      if (generation !== connectionGeneration.current) {
        nextGateway.close();
        return;
      }

      if (!result.ok) {
        nextGateway.close();
        setConnectionStatus("error");
        setStatusText(actionFailureText(result.reason));
        return;
      }

      await attachAuthenticatedGateway(nextGateway, result.playerId, result.sessionToken);
      setStatusText(mode === "create" ? "房间已创建" : "已加入房间");
    } catch {
      setConnectionStatus("offline");
      setStatusText("连接失败，请检查服务器地址和本地服务");
    }
  }

  async function resumeStoredSession(
    record: PersistedRoomSession | null = storedSession,
    successText = "会话恢复成功",
  ) {
    if (record === null) {
      setConnectionStatus("error");
      setStatusText("没有可恢复的会话");
      return;
    }

    const generation = ++connectionGeneration.current;
    closeCurrentGateway();
    setConnectionStatus("connecting");
    setStatusText("正在恢复会话");

    try {
      const nextGateway = await connectMobileRoomGateway(record);
      const result = await nextGateway.resumeSession({
        sessionToken: record.sessionToken,
        lastSeenEventId: record.lastEventId,
      });

      if (generation !== connectionGeneration.current) {
        nextGateway.close();
        return;
      }

      if (!result.ok) {
        nextGateway.close();

        if (result.reason === "actionRejected") {
          await clearStoredSession();
        }

        setConnectionStatus("error");
        setStatusText(actionFailureText(result.reason));
        return;
      }

      await attachAuthenticatedGateway(nextGateway, result.playerId, result.sessionToken);
      setStatusText(successText);
    } catch {
      setConnectionStatus("offline");
      setStatusText("恢复失败，服务器当前不可用");
    }
  }

  async function attachAuthenticatedGateway(
    nextGateway: MobileRoomGateway,
    playerId: string,
    sessionToken: string,
  ) {
    const nextSnapshot = await nextGateway.waitForSnapshot();
    const previousRecord = sessionRef.current;
    const record: PersistedRoomSession = {
      serverUrl: nextGateway.getState().url,
      roomId: nextGateway.getState().roomId,
      playerId,
      sessionToken,
      lastEventId: latestServerEventId(nextGateway),
      lastCompletedAutoDrawActionId: previousRecord?.sessionToken === sessionToken
        ? previousRecord.lastCompletedAutoDrawActionId
        : undefined,
    };

    gatewayRef.current = nextGateway;
    sessionRef.current = record;
    setGateway(nextGateway);
    setIdentity({ playerId, sessionToken });
    setSnapshot(nextSnapshot);
    setStoredSession(record);
    setConnectionStatus("online");
    resetTransientTurnState();
    await mobileRoomSessionStore.save(record);
    lastPersistedEventId.current = record.lastEventId;
  }

  async function runRoomAction(
    action: ClientLegalAction,
    callback: (activeGateway: MobileRoomGateway) => Promise<ClientTransportActionResult>,
  ) {
    if (gateway === null || identity === null || snapshot === null || !canUseAction(snapshot, action)) {
      setStatusText("服务端当前未开放此操作");
      return;
    }

    setActionBusy(true);
    let result: ClientTransportActionResult;
    try {
      result = await callback(gateway);
    } catch {
      setConnectionStatus("offline");
      setStatusText("连接中断，操作未确认，请恢复会话后查看服务端状态");
      return;
    } finally {
      setActionBusy(false);
    }

    if (!result.ok) {
      setStatusText(actionFailureText(result.reason));
      return;
    }

    await persistSession(gateway, sessionRef.current);
    setStatusText(actionSuccessText(action));
  }

  async function chooseSuit(suit: Suit) {
    await runRoomAction("chooseMissingSuit", (activeGateway) => activeGateway.chooseMissingSuit(suit));
  }

  async function confirmDiscard() {
    if (selectedDiscard === null) {
      return;
    }
    const { tile, actionId } = selectedDiscard;
    await runRoomAction("discardTile", (activeGateway) => activeGateway.discardTile(tile, actionId));
    setSelectedDiscard(null);
  }

  async function confirmGang() {
    if (selectedGang === null) {
      return;
    }
    const { action, tile, actionId } = selectedGang;
    await runRoomAction(action, (activeGateway) => action === "claimAnGang"
      ? activeGateway.claimAnGang(tile, actionId)
      : activeGateway.claimBaGang(tile, actionId));
    setSelectedGang(null);
  }

  async function clearStoredSession() {
    connectionGeneration.current += 1;
    closeCurrentGateway();
    sessionRef.current = null;
    setStoredSession(null);
    setIdentity(null);
    setSnapshot(null);
    resetTransientTurnState();
    setConnectionStatus("idle");
    setStatusText("已清除本机保存的会话");
    await mobileRoomSessionStore.clear();
  }

  function closeCurrentGateway() {
    gatewayRef.current?.close();
    gatewayRef.current = null;
    setGateway(null);
    resetTransientTurnState();
  }

  function resetTransientTurnState() {
    setSelectedDiscard(null);
    setSelectedGang(null);
    autoDrawInFlight.current = null;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "right", "bottom", "left"]}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>乐山麻将</Text>
            <Text style={styles.subtitle}>八鸡联机桌</Text>
          </View>
          <StatusBadge status={connectionStatus} />
        </View>

        <View style={styles.statusBand}>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>

        <Section title="服务器与房间">
          <Field label="服务器地址" value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" />
          <View style={styles.fieldRow}>
            <View style={styles.flexField}>
              <Field label="房间号" value={roomId} onChangeText={setRoomId} autoCapitalize="characters" />
            </View>
            <View style={styles.flexField}>
              <Field label="昵称" value={displayName} onChangeText={setDisplayName} />
            </View>
          </View>
          <View style={styles.actionRow}>
            <CommandButton label="创建房间" onPress={() => void createOrJoinRoom("create")} disabled={connectionStatus === "connecting"} />
            <CommandButton label="加入房间" onPress={() => void createOrJoinRoom("join")} disabled={connectionStatus === "connecting"} tone="secondary" />
          </View>
          <View style={styles.actionRow}>
            <CommandButton label="恢复会话" onPress={() => void resumeStoredSession()} disabled={storedSession === null || connectionStatus === "connecting"} tone="quiet" />
            <CommandButton label="清除会话" onPress={() => void clearStoredSession()} disabled={storedSession === null} tone="danger" />
          </View>
        </Section>

        <Section title="四人座位" trailing={viewModel === null ? "未进入房间" : `房间 ${viewModel.roomId}`}>
          <View style={styles.seatGrid}>
            {seatIds.map((seatId) => (
              <SeatCard
                key={seatId}
                seat={viewModel?.seats[seatId] ?? null}
                seatId={seatId}
                canTakeSeat={canUseAction(viewModel, "takeSeat") && !actionBusy}
                onTakeSeat={() => void runRoomAction("takeSeat", (activeGateway) => activeGateway.takeSeat(seatId))}
              />
            ))}
          </View>
          <View style={styles.actionRow}>
            {canUseAction(viewModel, "toggleReady") ? (
              <CommandButton label={localSeat(viewModel)?.ready ? "取消准备" : "准备"} onPress={() => void runRoomAction("toggleReady", (activeGateway) => activeGateway.toggleReady())} disabled={actionBusy} />
            ) : null}
            {canUseAction(viewModel, "startRound") ? (
              <CommandButton label="开始牌局" onPress={() => void runRoomAction("startRound", (activeGateway) => activeGateway.startRound())} disabled={actionBusy} tone="secondary" />
            ) : null}
          </View>
        </Section>

        {canUseAction(viewModel, "chooseMissingSuit") ? (
          <Section title="定缺">
            <View style={styles.segmentedControl}>
              {suits.map((suit) => (
                <Pressable key={suit} disabled={actionBusy} style={({ pressed }) => [styles.segment, actionBusy && styles.disabled, pressed && !actionBusy && styles.pressed]} onPress={() => void chooseSuit(suit)} accessibilityRole="button">
                  <Text style={styles.segmentText}>缺{suitLabel(suit)}</Text>
                </Pressable>
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="牌桌预览" trailing={phaseText(viewModel)}>
          {viewModel === null || snapshot?.round === null ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>等待牌局开始</Text>
              <Text style={styles.emptyMeta}>牌墙与手牌将在服务端开局后显示</Text>
            </View>
          ) : (
            <>
              <View style={styles.tableMetaRow}>
                <MetaItem label="牌墙" value={`${viewModel.wallCount ?? 0} 张`} />
                <MetaItem label="当前座位" value={`${(snapshot?.round?.currentPlayer ?? 0) + 1}`} />
                <MetaItem label="可用动作" value={`${viewModel.legalActions.length}`} />
              </View>
              {viewModel.seats.map((seat) => (
                <TableSeat
                  key={seat.seatId}
                  seat={seat}
                  legalDiscardTiles={seat.isLocal ? legalTilesForAction(viewModel, "discardTile") : []}
                  selectedDiscard={seat.isLocal ? selectedDiscard?.tile ?? null : null}
                  onSelectDiscard={seat.isLocal ? (tile) => {
                    const descriptor = descriptorForAction(viewModel, "discardTile");
                    if (descriptor !== null) {
                      setSelectedGang(null);
                      setSelectedDiscard({ tile, actionId: descriptor.actionId });
                    }
                  } : undefined}
                />
              ))}
              {canUseAction(viewModel, "discardTile") ? (
                <View style={styles.turnActionBand}>
                  <Text style={styles.turnActionTitle}>
                    {selectedDiscard === null ? "请选择亮起的手牌" : `准备打出 ${tileLabel(selectedDiscard.tile)}`}
                  </Text>
                  <CommandButton
                    label={selectedDiscard === null ? "确认出牌" : `打出 ${tileLabel(selectedDiscard.tile)}`}
                    onPress={() => void confirmDiscard()}
                    disabled={selectedDiscard === null || actionBusy}
                  />
                </View>
              ) : null}
              {viewModel.phase === "draw" && canUseAction(viewModel, "drawTile") ? (
                <View style={styles.turnNotice}><Text style={styles.turnNoticeText}>系统正在自动摸牌，无需手动点击</Text></View>
              ) : null}
              <ActiveGangActions
                viewModel={viewModel}
                selected={selectedGang}
                busy={actionBusy}
                onSelect={(selection) => {
                  setSelectedDiscard(null);
                  setSelectedGang(selection);
                }}
                onConfirm={() => void confirmGang()}
              />
              {viewModel.responseWindow === null ? null : (
                <View style={styles.responseBand}>
                  <Text style={styles.responseTitle}>
                    {viewModel.responseWindow.kind === "qiangGang" ? "等待抢杠响应" : "等待碰、杠、胡响应"}
                  </Text>
                  <Text style={styles.responseMeta}>
                    剩余 {viewModel.pendingResponderCount} 人待响应
                    {viewModel.hasRespondedByMe ? " · 你的选择已提交" : " · 其他玩家的选择暂不公开"}
                  </Text>
                </View>
              )}
              <ResponseActions
                viewModel={viewModel}
                busy={actionBusy}
                run={(action, callback) => void runRoomAction(action, callback)}
              />
              <View style={styles.legalActionBand}>
                <Text style={styles.legalActionTitle}>服务端可用动作</Text>
                <Text style={styles.legalActionText}>
                  {viewModel.legalActions.length === 0
                    ? "等待其他玩家"
                    : viewModel.legalActions.map(actionLabel).join(" · ")}
                </Text>
              </View>
            </>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );

  async function persistSession(activeGateway: MobileRoomGateway, record: PersistedRoomSession | null) {
    if (record === null) {
      return;
    }

    const nextRecord = {
      ...record,
      lastEventId: latestServerEventId(activeGateway),
    };
    sessionRef.current = nextRecord;
    setStoredSession(nextRecord);
    lastPersistedEventId.current = nextRecord.lastEventId;
    await mobileRoomSessionStore.save(nextRecord);
  }
}

function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {trailing === undefined ? null : <Text style={styles.sectionTrailing}>{trailing}</Text>}
      </View>
      {children}
    </View>
  );
}

function Field({
  label,
  ...inputProps
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...inputProps} style={styles.input} placeholderTextColor="#747B73" />
    </View>
  );
}

function CommandButton({
  label,
  onPress,
  disabled = false,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "quiet" | "danger";
}) {
  const toneStyle = tone === "secondary"
    ? styles.buttonSecondary
    : tone === "quiet"
      ? styles.buttonQuiet
      : tone === "danger"
        ? styles.buttonDanger
        : styles.buttonPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, toneStyle, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function SeatCard({
  seat,
  seatId,
  canTakeSeat,
  onTakeSeat,
}: {
  seat: ClientSeatViewModel | null;
  seatId: PlayerId;
  canTakeSeat: boolean;
  onTakeSeat: () => void;
}) {
  const empty = seat?.playerId == null;

  return (
    <View style={[styles.seatCard, seat?.isLocal && styles.localSeat, seat?.isCurrentPlayer && styles.currentSeat]}>
      <View style={styles.seatTopLine}>
        <Text style={styles.seatName}>{empty ? `座位 ${seatId + 1}` : seat?.displayName}</Text>
        {seat?.isLocal ? <Text style={styles.meBadge}>我</Text> : null}
      </View>
      <Text style={styles.seatMeta}>
        {empty ? "空位" : `${seat?.connected ? "在线" : "离线"} · ${seat?.ready ? "已准备" : "未准备"}`}
      </Text>
      <Text style={styles.seatScore}>{seat?.score ?? 0} 分</Text>
      {empty && canTakeSeat ? <CommandButton label="坐这里" onPress={onTakeSeat} tone="quiet" /> : null}
    </View>
  );
}

function TableSeat({
  seat,
  legalDiscardTiles,
  selectedDiscard,
  onSelectDiscard,
}: {
  seat: ClientSeatViewModel;
  legalDiscardTiles: Tile[];
  selectedDiscard: Tile | null;
  onSelectDiscard?: (tile: Tile) => void;
}) {
  return (
    <View style={[styles.tableSeat, seat.isLocal && styles.tableSeatLocal]}>
      <View style={styles.tableSeatHeader}>
        <View>
          <Text style={styles.tableSeatName}>
            {seat.displayName}{seat.isDealer ? " · 庄" : ""}{seat.hasWon ? " · 已胡" : ""}
          </Text>
          <Text style={styles.tableSeatMeta}>
            {seat.connected ? "在线" : "离线"} · 缺{suitLabel(seat.missingSuit)} · {seat.score} 分
          </Text>
        </View>
        <Text style={styles.handCount}>{seat.handCount} 张</Text>
      </View>
      {seat.hand === null ? (
        <View style={styles.coveredRow} accessibilityLabel={`对手手牌 ${seat.handCount} 张`}>
          {Array.from({ length: Math.min(seat.handCount, 10) }, (_, index) => (
            <View key={index} style={styles.coveredTile} />
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handRow}>
          {seat.hand.map((tile, index) => {
            const selectable = legalDiscardTiles.some((candidate) => sameTile(candidate, tile));
            const selected = selectedDiscard !== null && sameTile(selectedDiscard, tile);
            return (
              <Pressable
                key={`${tile.suit}-${tile.rank}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`${tileLabel(tile)}${selectable ? "，可出牌" : "，当前不可出"}`}
                disabled={!selectable || onSelectDiscard === undefined}
                onPress={() => onSelectDiscard?.(tile)}
                style={[styles.handTileButton, !selectable && styles.handTileDisabled, selected && styles.handTileSelected]}
              >
                <TileFace tile={tile} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {seat.melds.length === 0 ? null : (
        <Text style={styles.meldText}>副露：{seat.melds.map(meldLabel).join(" · ")}</Text>
      )}
    </View>
  );
}

function ResponseActions({
  viewModel,
  busy,
  run,
}: {
  viewModel: ClientRoomViewModel;
  busy: boolean;
  run: (
    action: ClientLegalAction,
    callback: (gateway: MobileRoomGateway) => Promise<ClientTransportActionResult>,
  ) => void;
}) {
  const actions: Array<{
    action: ClientLegalAction;
    label: string;
    tone?: "primary" | "secondary" | "quiet" | "danger";
    callback: (gateway: MobileRoomGateway, actionId: string) => Promise<ClientTransportActionResult>;
  }> = [
    { action: "passClaim", label: "过", tone: "quiet", callback: (gateway, actionId) => gateway.passClaim(actionId) },
    { action: "claimPeng", label: "碰", tone: "secondary", callback: (gateway, actionId) => gateway.claimPeng(actionId) },
    { action: "claimMingGang", label: "杠", tone: "secondary", callback: (gateway, actionId) => gateway.claimMingGang(actionId) },
    { action: "claimHu", label: "胡", callback: (gateway, actionId) => gateway.claimHu(actionId) },
    { action: "claimSelfDrawHu", label: "自摸胡", callback: (gateway, actionId) => gateway.claimSelfDrawHu(actionId) },
    { action: "passQiangGang", label: "过", tone: "quiet", callback: (gateway, actionId) => gateway.passQiangGang(actionId) },
    { action: "claimQiangGangHu", label: "抢杠胡", callback: (gateway, actionId) => gateway.claimQiangGangHu(actionId) },
  ];
  const visible = actions.flatMap((entry) => {
    const descriptor = descriptorForAction(viewModel, entry.action);
    return canUseAction(viewModel, entry.action) && descriptor !== null
      ? [{ ...entry, actionId: descriptor.actionId }]
      : [];
  });
  if (visible.length === 0) {
    return null;
  }
  return (
    <View style={styles.responseActionRow}>
      {visible.map((entry) => (
        <CommandButton
          key={entry.action}
          label={entry.label}
          tone={entry.tone}
          disabled={busy}
          onPress={() => run(entry.action, (gateway) => entry.callback(gateway, entry.actionId))}
        />
      ))}
    </View>
  );
}

function ActiveGangActions({
  viewModel,
  selected,
  busy,
  onSelect,
  onConfirm,
}: {
  viewModel: ClientRoomViewModel;
  selected: SelectedGang | null;
  busy: boolean;
  onSelect: (selection: SelectedGang) => void;
  onConfirm: () => void;
}) {
  const candidates = (["claimAnGang", "claimBaGang"] as const).flatMap((action) => {
    const descriptor = descriptorForAction(viewModel, action);
    if (descriptor === null || !("tiles" in descriptor)) {
      return [];
    }
    return descriptor.tiles.map((tile) => ({ action, actionId: descriptor.actionId, tile }));
  });
  if (candidates.length === 0) {
    return null;
  }
  return (
    <View style={styles.turnActionBand}>
      <Text style={styles.turnActionTitle}>服务端可用杠牌</Text>
      <View style={styles.responseActionRow}>
        {candidates.map((candidate) => {
          const active = selected?.action === candidate.action && sameTile(selected.tile, candidate.tile);
          const label = `${candidate.action === "claimAnGang" ? "暗杠" : "巴杠"} ${tileLabel(candidate.tile)}`;
          return (
            <CommandButton
              key={`${candidate.action}-${candidate.tile.suit}-${candidate.tile.rank}`}
              label={active ? `已选 ${label}` : label}
              tone={active ? "primary" : "secondary"}
              disabled={busy}
              onPress={() => onSelect(candidate)}
            />
          );
        })}
      </View>
      {selected === null ? null : (
        <>
          <Text style={styles.turnNoticeText}>
            {selected.action === "claimBaGang"
              ? "确认后会进入抢杠胡等待；无人抢杠时系统自动补牌。"
              : "暗杠牌面只会向你本人显示，其他玩家仅看到安全摘要。"}
          </Text>
          <CommandButton
            label={`确认${selected.action === "claimAnGang" ? "暗杠" : "巴杠"} ${tileLabel(selected.tile)}`}
            onPress={onConfirm}
            disabled={busy}
          />
        </>
      )}
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const text = status === "online"
    ? "在线"
    : status === "connecting"
      ? "连接中"
      : status === "background"
        ? "后台"
        : status === "offline"
          ? "离线"
          : status === "error"
            ? "异常"
            : "未连接";

  return (
    <View style={[styles.statusBadge, status === "online" && styles.statusBadgeOnline]}>
      <Text style={styles.statusBadgeText}>{text}</Text>
    </View>
  );
}

function localSeat(viewModel: ClientRoomViewModel | null): ClientSeatViewModel | null {
  return viewModel?.seats.find((seat) => seat.isLocal) ?? null;
}

function sameTile(left: Tile, right: Tile): boolean {
  return left.suit === right.suit && left.rank === right.rank;
}

function phaseText(viewModel: ClientRoomViewModel | null): string {
  if (viewModel === null) {
    return "未连接";
  }

  const labels: Record<NonNullable<ClientRoomViewModel["phase"]>, string> = {
    dingque: "定缺",
    draw: "摸牌",
    discard: "出牌",
    claim: "响应",
    gangDraw: "杠后补牌",
    qiangGang: "抢杠",
    ended: "已结束",
  };
  return viewModel.phase === null ? "等待开局" : labels[viewModel.phase];
}

function actionLabel(action: ClientLegalAction): string {
  const labels: Record<ClientLegalAction, string> = {
    takeSeat: "占座",
    toggleReady: "准备",
    startRound: "开局",
    chooseMissingSuit: "定缺",
    drawTile: "摸牌",
    drawGangTile: "杠后补牌",
    discardTile: "出牌",
    passClaim: "过牌",
    claimHu: "胡牌",
    claimSelfDrawHu: "自摸",
    claimPeng: "碰",
    claimMingGang: "明杠",
    claimAnGang: "暗杠",
    claimBaGang: "巴杠",
    passQiangGang: "过抢杠",
    claimQiangGangHu: "抢杠胡",
  };
  return labels[action];
}

function actionSuccessText(action: ClientLegalAction): string {
  return `${actionLabel(action)}已提交`;
}

function actionFailureText(reason: string): string {
  const labels: Record<string, string> = {
    actionRejected: "服务端拒绝了本次操作",
    missingSessionToken: "会话已失效，请重新加入房间",
    timeout: "服务器响应超时",
    closed: "连接已关闭",
    staleAction: "这个操作已经过期，已按服务器最新牌局刷新",
  };
  return labels[reason] ?? `操作失败：${reason}`;
}

function meldLabel(meld: ClientVisibleMeld): string {
  if (meld.type === "anGang" && meld.tile === null) {
    return "暗杠";
  }

  const type = meld.type === "peng"
    ? "碰"
    : meld.type === "mingGang"
      ? "明杠"
      : meld.type === "baGang"
        ? "巴杠"
        : "暗杠";
  return `${type}${tileLabel(meld.tile)}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#173A2C",
  },
  page: {
    paddingBottom: 32,
    backgroundColor: "#F4F5F0",
  },
  header: {
    minHeight: 92,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: "#173A2C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#CFE0D6",
    fontSize: 13,
    lineHeight: 18,
  },
  statusBadge: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#4D5B54",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeOnline: {
    backgroundColor: "#24704B",
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  statusBand: {
    minHeight: 44,
    paddingHorizontal: 20,
    justifyContent: "center",
    backgroundColor: "#DCE8E1",
    borderBottomWidth: 1,
    borderBottomColor: "#C4D2C9",
  },
  statusText: {
    color: "#29463A",
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#D9DDD5",
  },
  sectionHeader: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    color: "#1F2924",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  sectionTrailing: {
    color: "#667068",
    fontSize: 12,
    lineHeight: 18,
  },
  field: {
    marginBottom: 10,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 10,
  },
  flexField: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    color: "#4F5953",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#C8CEC7",
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    color: "#1E2823",
    paddingHorizontal: 12,
    fontSize: 15,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: "#1F5A43",
  },
  buttonSecondary: {
    backgroundColor: "#2F6073",
  },
  buttonQuiet: {
    backgroundColor: "#52615A",
  },
  buttonDanger: {
    backgroundColor: "#9F3E3E",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.78,
  },
  seatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  seatCard: {
    width: "48%",
    minHeight: 132,
    borderWidth: 1,
    borderColor: "#CDD2CC",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  localSeat: {
    borderColor: "#24704B",
    borderWidth: 2,
  },
  currentSeat: {
    backgroundColor: "#EEF7F1",
  },
  seatTopLine: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seatName: {
    flex: 1,
    color: "#1F2924",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  meBadge: {
    color: "#FFFFFF",
    backgroundColor: "#24704B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: "800",
  },
  seatMeta: {
    color: "#677068",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  seatScore: {
    color: "#2F6073",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    marginVertical: 6,
  },
  segmentedControl: {
    flexDirection: "row",
    minHeight: 50,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#BFC7C0",
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#BFC7C0",
  },
  segmentText: {
    color: "#244A3A",
    fontSize: 16,
    fontWeight: "800",
  },
  emptyState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#BCC4BD",
    borderRadius: 8,
  },
  emptyTitle: {
    color: "#2A332F",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  emptyMeta: {
    color: "#6B746D",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  tableMetaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  metaItem: {
    flex: 1,
    minHeight: 58,
    borderRadius: 6,
    backgroundColor: "#E4ECE7",
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  metaLabel: {
    color: "#637069",
    fontSize: 11,
    lineHeight: 16,
  },
  metaValue: {
    color: "#18382B",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  tableSeat: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#D4D9D3",
  },
  tableSeatLocal: {
    backgroundColor: "#EFF6F1",
    marginHorizontal: -8,
    paddingHorizontal: 8,
  },
  tableSeatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  tableSeatName: {
    color: "#1F2924",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  tableSeatMeta: {
    color: "#68716B",
    fontSize: 11,
    lineHeight: 17,
  },
  handCount: {
    color: "#2F6073",
    fontSize: 14,
    fontWeight: "800",
  },
  handRow: {
    paddingRight: 8,
  },
  handTileButton: {
    minWidth: 42,
    minHeight: 58,
    marginRight: 3,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  handTileDisabled: {
    opacity: 0.34,
  },
  handTileSelected: {
    backgroundColor: "#CFE7D8",
    borderWidth: 2,
    borderColor: "#24704B",
    transform: [{ translateY: -6 }],
  },
  coveredRow: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
  },
  coveredTile: {
    width: 22,
    height: 34,
    marginRight: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#234D3B",
    backgroundColor: "#3C735D",
  },
  meldText: {
    color: "#59645E",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  legalActionBand: {
    marginTop: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#2F6073",
    backgroundColor: "#E8EEF0",
  },
  turnActionBand: {
    marginTop: 10,
    padding: 12,
    borderRadius: 6,
    backgroundColor: "#E2EEE7",
  },
  turnActionTitle: {
    color: "#214B38",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  turnNotice: {
    marginTop: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#24704B",
    backgroundColor: "#E7F2EB",
  },
  turnNoticeText: {
    color: "#214B38",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  responseBand: {
    marginTop: 10,
    padding: 12,
    borderRadius: 6,
    backgroundColor: "#F0E9D8",
  },
  responseTitle: {
    color: "#5A431B",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  responseMeta: {
    color: "#705E3B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  responseActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  legalActionTitle: {
    color: "#274652",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  legalActionText: {
    color: "#344F59",
    fontSize: 13,
    lineHeight: 19,
  },
  meldTile: {
    color: "#333333",
  },
});
