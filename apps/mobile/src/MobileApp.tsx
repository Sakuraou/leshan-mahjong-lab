import type {
  ClientBaGangCandidate,
  ClientLegalAction,
  ClientOwnedTile,
  ClientRoomViewModel,
  ClientSeatViewModel,
  ClientTransportActionResult,
  ClientVisibleMeld,
  ClientVisibleRoomState,
  ClientYaoJiExchangeCandidate,
  MobilePublicEvent,
  MobileDevelopmentTarget,
  MobileServerMode,
  PersistedRoomSession,
  PlayerId,
  ReconnectAttemptContext,
  ReconnectAttemptResult,
  ReconnectCoordinator,
  ReconnectState,
  Suit,
  Tile,
} from "@leshan-mahjong/client-core";
import {
  canUseAction,
  classifyMobileConnectionError,
  createReconnectCoordinator,
  defaultDevelopmentServerUrl,
  descriptorForAction,
  inferMobileDevelopmentTarget,
  inferMobileServerMode,
  legalTilesForAction,
  moveMobileHandTile,
  mobileConnectionDiagnosticText,
  nextAutomaticDrawAction,
  orderMobileHand,
  reconcileMobileHandOrder,
  suitLabel,
  tileLabel,
  toClientRoomViewModel,
  validateMobileServerUrl,
} from "@leshan-mahjong/client-core";
import NetInfo from "@react-native-community/netinfo";
import * as ScreenOrientation from "expo-screen-orientation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Animated,
  AppState,
  type AppStateStatus,
  type GestureResponderEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  connectMobileRoomGateway,
  latestServerEventId,
  type MobileRoomGateway,
} from "./roomGateway";
import { initialMobileServerConfig } from "./environment";
import { mobileRoomSessionStore } from "./sessionStore";
import { RoundIntermissionSection } from "./RoundIntermissionSection";
import { RoundResultSection } from "./RoundResultSection";
import { RoundTimelineSection } from "./RoundTimelineSection";
import { TileFace } from "./TileFace";

type ConnectionStatus =
  | "idle"
  | "connecting"
  | "background"
  | "offline"
  | "waiting"
  | "reconnecting"
  | "resuming"
  | "online"
  | "failed"
  | "error";
type Identity = { playerId: string };
type PendingActionConfirmation = {
  action: ClientLegalAction;
  actionId: string | null;
};
type SelectedDiscard = { tile: ClientOwnedTile; actionId: string };
type SelectedGang =
  | { action: "claimAnGang"; tile: Tile; actionId: string }
  | { action: "claimBaGang"; candidate: ClientBaGangCandidate; actionId: string }
  | { action: "exchangeGangYaoJi"; candidate: ClientYaoJiExchangeCandidate; actionId: string };

const seatIds: PlayerId[] = [0, 1, 2, 3];
const suits: Suit[] = ["bamboos", "dots", "characters"];
const serverModes: MobileServerMode[] = ["development", "lan", "production"];
const productionWebClient = Platform.OS === "web" && initialMobileServerConfig.mode === "production";
const initialReconnectState: ReconnectState = {
  phase: "offline",
  attempt: 0,
  maxAttempts: 4,
  generation: 0,
  nextRetryAt: null,
  retryDelayMs: null,
  lastError: null,
};

export function MobileApp() {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [serverMode, setServerMode] = useState<MobileServerMode>(initialMobileServerConfig.mode);
  const [developmentTarget, setDevelopmentTarget] = useState<MobileDevelopmentTarget>(
    initialMobileServerConfig.developmentTarget,
  );
  const [serverUrl, setServerUrl] = useState(initialMobileServerConfig.url);
  const [roomId, setRoomId] = useState(createInitialRoomId);
  const [displayName, setDisplayName] = useState("手机玩家");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [statusText, setStatusText] = useState("尚未连接");
  const [gateway, setGateway] = useState<MobileRoomGateway | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [snapshot, setSnapshot] = useState<ClientVisibleRoomState | null>(null);
  const [publicEvents, setPublicEvents] = useState<MobilePublicEvent[]>([]);
  const [storedSession, setStoredSession] = useState<PersistedRoomSession | null>(null);
  const [selectedDiscard, setSelectedDiscard] = useState<SelectedDiscard | null>(null);
  const [selectedGang, setSelectedGang] = useState<SelectedGang | null>(null);
  const [handOrderIds, setHandOrderIds] = useState<string[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingActionConfirmation | null>(null);
  const [reconnectState, setReconnectState] = useState<ReconnectState>(initialReconnectState);
  const [reconnectActive, setReconnectActive] = useState(false);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const [actionBusy, setActionBusy] = useState(false);
  const gatewayRef = useRef<MobileRoomGateway | null>(null);
  const pendingGatewayRef = useRef<MobileRoomGateway | null>(null);
  const sessionRef = useRef<PersistedRoomSession | null>(null);
  const publicEventsRef = useRef<MobilePublicEvent[]>([]);
  const connectionGeneration = useRef(0);
  const pendingConfirmationRef = useRef<PendingActionConfirmation | null>(null);
  const activeActionRef = useRef<PendingActionConfirmation | null>(null);
  const reconnectSuccessTextRef = useRef("会话恢复成功");
  const reconnectAttemptRef = useRef<
    (context: ReconnectAttemptContext) => Promise<ReconnectAttemptResult>
  >(async () => ({ ok: false, reason: "reconnectNotReady" }));
  const reconnectCoordinatorRef = useRef<ReconnectCoordinator | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const networkConnectedRef = useRef<boolean | null>(null);
  const lastPersistedEventId = useRef(-1);
  const autoDrawInFlight = useRef<string | null>(null);
  const handOrderIdsRef = useRef<string[]>([]);
  const viewModel = useMemo(() => {
    if (snapshot === null) {
      return null;
    }
    const model = toClientRoomViewModel(snapshot);
    const seat = model.seats.find((value) => value.isLocal);
    if (seat?.hand !== null && seat?.hand !== undefined) {
      seat.hand = orderMobileHand(seat.hand, handOrderIds);
    }
    return model;
  }, [snapshot, handOrderIds]);
  const roundInProgress = snapshot?.gameStatus === "playingRound" && snapshot.round !== null;
  const landscape = viewportWidth > viewportHeight;
  const gameWideLayout = roundInProgress && viewportWidth >= 680;
  const wideLayout = !roundInProgress && Platform.OS === "web" && viewportWidth >= 960;
  reconnectAttemptRef.current = performReconnectAttempt;
  if (reconnectCoordinatorRef.current === null) {
    reconnectCoordinatorRef.current = createReconnectCoordinator({
      attempt: (context) => reconnectAttemptRef.current(context),
    });
  }

  function selectServerMode(mode: MobileServerMode) {
    setServerMode(mode);
    if (mode === "development") {
      setServerUrl(defaultDevelopmentServerUrl(developmentTarget));
      return;
    }
    if (mode === "production") {
      const configured = initialMobileServerConfig.mode === "production" ? initialMobileServerConfig.url : "";
      setServerUrl(serverUrl.startsWith("wss://") ? serverUrl : configured);
      return;
    }
    const configured = initialMobileServerConfig.mode === "lan" ? initialMobileServerConfig.url : "";
    setServerUrl(inferMobileServerMode(serverUrl) === "lan" ? serverUrl : configured);
  }

  function selectDevelopmentTarget(target: MobileDevelopmentTarget) {
    setServerMode("development");
    setDevelopmentTarget(target);
    setServerUrl(defaultDevelopmentServerUrl(target));
  }

  useEffect(() => {
    void mobileRoomSessionStore.load().then((record) => {
      if (record === null) {
        return;
      }

      sessionRef.current = record;
      setStoredSession(record);
      setServerUrl(record.serverUrl);
      setServerMode(inferMobileServerMode(record.serverUrl));
      setDevelopmentTarget(inferMobileDevelopmentTarget(record.serverUrl));
      setRoomId(record.roomId);
      setStatusText("发现已保存会话，正在自动恢复");
      requestImmediateReconnect("startup", "牌局会话已自动恢复");
    }).catch(() => {
      setConnectionStatus("error");
      setStatusText("无法读取本机安全会话，请重新加入房间");
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }
    const lock = roundInProgress
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    void ScreenOrientation.lockAsync(lock).catch(() => undefined);
  }, [roundInProgress]);

  useEffect(() => {
    const coordinator = reconnectCoordinatorRef.current!;
    return coordinator.subscribe(setReconnectState);
  }, []);

  useEffect(() => {
    if (!reconnectActive) {
      return;
    }
    if (reconnectState.phase === "waiting") {
      setConnectionStatus("waiting");
      const seconds = reconnectState.nextRetryAt === null
        ? 0
        : Math.max(0, Math.ceil((reconnectState.nextRetryAt - countdownNow) / 1_000));
      setStatusText(`连接中断，${seconds} 秒后进行第 ${reconnectState.attempt + 1} 次重试`);
      return;
    }
    if (reconnectState.phase === "reconnecting") {
      setConnectionStatus("reconnecting");
      setStatusText(`正在进行第 ${reconnectState.attempt} 次重新连接`);
      return;
    }
    if (reconnectState.phase === "resuming") {
      setConnectionStatus("resuming");
      setStatusText("连接已建立，正在恢复服务端牌局快照");
      return;
    }
    if (reconnectState.phase === "failed") {
      setConnectionStatus("failed");
      setStatusText(reconnectState.lastError === null
        ? "自动重连失败，请检查网络或手动重新连接"
        : actionFailureText(reconnectState.lastError));
      return;
    }
    if (reconnectState.phase === "online") {
      setConnectionStatus("online");
      setStatusText(reconnectSuccessTextRef.current);
      setReconnectActive(false);
    }
  }, [countdownNow, reconnectActive, reconnectState]);

  useEffect(() => {
    const hasVisibleDeadline = (
      snapshot?.turnDeadline !== null && snapshot?.turnDeadline !== undefined
    ) || (
      snapshot?.responseWindow !== null && snapshot?.responseWindow !== undefined
    );
    if ((!reconnectActive || reconnectState.phase !== "waiting") && !hasVisibleDeadline) {
      return;
    }
    setCountdownNow(Date.now());
    const timer = setInterval(() => setCountdownNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [reconnectActive, reconnectState.phase, reconnectState.nextRetryAt, snapshot?.turnDeadline, snapshot?.responseWindow]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "background" || nextState === "inactive") {
        const activeGateway = gatewayRef.current;
        const activeSession = sessionRef.current;

        if (activeGateway !== null && activeSession !== null) {
          void persistSession(activeGateway, activeSession);
        }
        markActiveActionPending();
        reconnectCoordinatorRef.current?.pause("background");
        setReconnectActive(false);
        closeCurrentGateway();
        setConnectionStatus("background");
        setStatusText("应用已进入后台，会话已安全保存");
        return;
      }

      if (nextState === "active" && previousState !== "active" && sessionRef.current !== null) {
        requestImmediateReconnect("foreground", "已从后台恢复连接");
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => NetInfo.addEventListener((networkState) => {
    const connected = networkState.isConnected === true && networkState.isInternetReachable !== false;
    const wasConnected = networkConnectedRef.current;
    networkConnectedRef.current = connected;

    if (
      connected &&
      wasConnected === false &&
      appStateRef.current === "active" &&
      sessionRef.current !== null &&
      gatewayRef.current === null
    ) {
      requestImmediateReconnect("networkAvailable", "网络已恢复，牌局已重新连接");
      return;
    }

    if (!connected && wasConnected === true && gatewayRef.current !== null) {
      handleUnexpectedDisconnect(gatewayRef.current, "网络连接不可用");
    }
  }), []);

  useEffect(() => {
    if (gateway === null) {
      return;
    }

    return gateway.subscribe((transportState) => {
      if (gatewayRef.current !== gateway) {
        return;
      }
      if (transportState.snapshot !== null) {
        setSnapshot(transportState.snapshot);
        publicEventsRef.current = transportState.events;
        setPublicEvents(transportState.events);
        const record = sessionRef.current;
        if (record !== null && transportState.lastEventId !== lastPersistedEventId.current) {
          void persistSession(gateway, record);
        }
      }
      if (transportState.status === "closed" || transportState.status === "error") {
        handleUnexpectedDisconnect(
          gateway,
          transportState.lastError ?? "连接已断开",
        );
      }
    });
  }, [gateway]);

  useEffect(() => {
    const localSeatId = snapshot?.localSeatId;
    const hand = localSeatId === null || localSeatId === undefined
      ? null
      : snapshot?.round?.players[localSeatId]?.hand ?? null;
    if (hand === null) {
      return;
    }
    setHandOrderIds((previous) => reconcileMobileHandOrder(previous, hand));
  }, [snapshot]);

  useEffect(() => {
    handOrderIdsRef.current = handOrderIds;
    const record = sessionRef.current;
    if (record === null || snapshot === null) {
      return;
    }
    const nextRecord: PersistedRoomSession = {
      ...record,
      handOrderRoundNumber: snapshot.roundNumber,
      handOrderTileIds: [...handOrderIds],
    };
    sessionRef.current = nextRecord;
    setStoredSession(nextRecord);
    void mobileRoomSessionStore.save(nextRecord).catch(() => undefined);
  }, [handOrderIds, snapshot?.roundNumber]);

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
    const pendingAction = { action: drawAction.action, actionId } satisfies PendingActionConfirmation;
    autoDrawInFlight.current = actionId;
    activeActionRef.current = pendingAction;
    setStatusText(drawAction.action === "drawGangTile" ? "系统正在发放杠后补牌" : "轮到你了，系统正在自动摸牌");
    const request = drawAction.action === "drawGangTile"
      ? gateway.drawGangTile(actionId)
      : gateway.drawTile(actionId);
    void request.then(async (result) => {
      if (gatewayRef.current !== gateway) {
        markPendingConfirmation(pendingAction);
        return;
      }
      if (!result.ok) {
        if (isUncertainTransportResult(result)) {
          markPendingConfirmation(pendingAction);
        } else {
          activeActionRef.current = null;
        }
        setStatusText(actionFailureText(result.reason));
        return;
      }
      activeActionRef.current = null;
      const record = sessionRef.current;
      if (record !== null) {
        const nextRecord = { ...record, lastCompletedAutoDrawActionId: actionId };
        sessionRef.current = nextRecord;
        setStoredSession(nextRecord);
        try {
          await mobileRoomSessionStore.save(nextRecord);
        } catch {
          setStatusText("已自动摸牌，但本机暂时无法保存恢复进度");
          return;
        }
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
    const stillLegal = descriptor !== null
      && legalTilesForAction(snapshot, "discardTile").some((tile) => tile.tileId === selectedDiscard.tile.tileId);
    if (!stillLegal) {
      setSelectedDiscard(null);
      return;
    }
    if (descriptor.actionId !== selectedDiscard.actionId) {
      setSelectedDiscard({ tile: selectedDiscard.tile, actionId: descriptor.actionId });
    }
  }, [selectedDiscard, snapshot]);

  useEffect(() => {
    if (selectedGang === null) {
      return;
    }
    const descriptor = descriptorForAction(snapshot, selectedGang.action);
    const stillLegal = descriptor?.actionId === selectedGang.actionId && (
      selectedGang.action === "claimAnGang"
        ? descriptor.action === "claimAnGang" && descriptor.tiles.some((tile) => sameTile(tile, selectedGang.tile))
        : descriptor.action === selectedGang.action && descriptor.candidates.some(
            (candidate) => candidate.candidateId === selectedGang.candidate.candidateId,
          )
    );
    if (!stillLegal) {
      setSelectedGang(null);
    }
  }, [selectedGang, snapshot]);

  async function createOrJoinRoom(mode: "create" | "join") {
    const validation = validateMobileServerUrl(serverMode, serverUrl);
    if (!validation.ok) {
      setConnectionStatus("error");
      setStatusText(validation.message);
      return;
    }
    if (roomId.trim() === "" || displayName.trim() === "") {
      setConnectionStatus("error");
      setStatusText("请填写房间号和昵称");
      return;
    }

    reconnectCoordinatorRef.current?.pause("newRoomEntry");
    setReconnectActive(false);
    const generation = ++connectionGeneration.current;
    closeCurrentGateway();
    publicEventsRef.current = [];
    setPublicEvents([]);
    setHandOrderIds([]);
    setConnectionStatus("connecting");
    setStatusText(mode === "create" ? "正在创建房间" : "正在加入房间");

    let nextGateway: MobileRoomGateway | null = null;
    try {
      nextGateway = await connectMobileRoomGateway({
        serverUrl: validation.url,
        serverMode,
        roomId,
        initialEvents: [],
      });
      if (generation !== connectionGeneration.current) {
        nextGateway.close();
        return;
      }
      pendingGatewayRef.current = nextGateway;
      const result = mode === "create"
        ? await nextGateway.createRoomSession({ displayName: displayName.trim() })
        : await nextGateway.joinRoomSession({ displayName: displayName.trim() });

      if (generation !== connectionGeneration.current) {
        pendingGatewayRef.current = null;
        nextGateway.close();
        return;
      }

      if (!result.ok) {
        pendingGatewayRef.current = null;
        nextGateway.close();
        setConnectionStatus("error");
        setStatusText(actionFailureText(result.reason));
        return;
      }

      const attached = await attachAuthenticatedGateway(
        nextGateway,
        result.playerId,
        result.sessionToken,
        generation,
      );
      if (!attached) {
        return;
      }
      reconnectCoordinatorRef.current?.markOnline();
      setStatusText(mode === "create" ? "房间已创建" : "已加入房间");
    } catch (error) {
      if (pendingGatewayRef.current === nextGateway) {
        pendingGatewayRef.current = null;
      }
      nextGateway?.close();
      if (generation !== connectionGeneration.current) {
        return;
      }
      setConnectionStatus("offline");
      setStatusText(mobileConnectionDiagnosticText(classifyMobileConnectionError(error, {
        url: serverUrl,
        networkConnected: networkConnectedRef.current,
      })));
    }
  }

  function resumeStoredSession(
    record: PersistedRoomSession | null = storedSession,
    successText = "会话恢复成功",
  ) {
    if (record === null) {
      setConnectionStatus("error");
      setStatusText("没有可恢复的会话");
      return;
    }
    sessionRef.current = record;
    setStoredSession(record);
    requestImmediateReconnect("manualRetry", successText);
  }

  async function performReconnectAttempt(
    context: ReconnectAttemptContext,
  ): Promise<ReconnectAttemptResult> {
    const record = sessionRef.current;
    if (record === null) {
      return { ok: false, reason: "missingSession", terminal: true };
    }

    const generation = ++connectionGeneration.current;
    closeCurrentGateway();
    let nextGateway: MobileRoomGateway | null = null;
    try {
      nextGateway = await connectMobileRoomGateway({
        ...record,
        serverMode: inferMobileServerMode(record.serverUrl),
        initialEvents: publicEventsRef.current,
      });
      if (!context.isCurrent() || generation !== connectionGeneration.current) {
        nextGateway.close();
        return { ok: false, reason: "supersededReconnect", terminal: true };
      }
      pendingGatewayRef.current = nextGateway;
      if (!context.markResuming()) {
        pendingGatewayRef.current = null;
        nextGateway.close();
        return { ok: false, reason: "supersededReconnect", terminal: true };
      }

      const result = await nextGateway.resumeSession({
        sessionToken: record.sessionToken,
        lastSeenEventId: record.lastEventId,
      });
      if (!context.isCurrent() || generation !== connectionGeneration.current) {
        pendingGatewayRef.current = null;
        nextGateway.close();
        return { ok: false, reason: "supersededReconnect", terminal: true };
      }
      if (!result.ok) {
        pendingGatewayRef.current = null;
        nextGateway.close();
        const terminal = result.kind === "protocol" ||
          result.code === "invalidSession" || result.code === "roomNotFound";
        if (terminal) {
          await invalidateStoredSession();
        }
        return { ok: false, reason: result.reason, terminal };
      }

      const attached = await attachAuthenticatedGateway(
        nextGateway,
        result.playerId,
        result.sessionToken,
        generation,
        context.isCurrent,
      );
      return attached
        ? { ok: true }
        : { ok: false, reason: "supersededReconnect", terminal: true };
    } catch (error) {
      if (pendingGatewayRef.current === nextGateway) {
        pendingGatewayRef.current = null;
      }
      nextGateway?.close();
      const diagnostic = classifyMobileConnectionError(error, {
        url: record.serverUrl,
        networkConnected: networkConnectedRef.current,
      });
      return {
        ok: false,
        reason: diagnostic,
      };
    }
  }

  async function attachAuthenticatedGateway(
    nextGateway: MobileRoomGateway,
    playerId: string,
    sessionToken: string,
    expectedGeneration: number,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    const nextSnapshot = await nextGateway.waitForSnapshot();
    if (
      !isCurrent() ||
      expectedGeneration !== connectionGeneration.current ||
      pendingGatewayRef.current !== nextGateway
    ) {
      if (pendingGatewayRef.current === nextGateway) {
        pendingGatewayRef.current = null;
      }
      nextGateway.close();
      return false;
    }
    const previousRecord = sessionRef.current;
    const nextEvents = nextGateway.getState().events;
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

    pendingGatewayRef.current = null;
    gatewayRef.current = nextGateway;
    sessionRef.current = record;
    setGateway(nextGateway);
    setIdentity({ playerId });
    setHandOrderIds(
      previousRecord?.handOrderRoundNumber === nextSnapshot.roundNumber
        ? [...(previousRecord.handOrderTileIds ?? [])]
        : [],
    );
    setSnapshot(nextSnapshot);
    publicEventsRef.current = nextEvents;
    setPublicEvents(nextEvents);
    setStoredSession(record);
    setConnectionStatus("online");
    clearPendingConfirmation();
    resetTransientTurnState();
    try {
      await mobileRoomSessionStore.save(record);
    } catch {
      setStatusText("连接已恢复，但安全会话暂时无法保存到本机");
    }
    lastPersistedEventId.current = record.lastEventId;
    return true;
  }

  async function runRoomAction(
    action: ClientLegalAction,
    callback: (activeGateway: MobileRoomGateway) => Promise<ClientTransportActionResult>,
  ) {
    if (gateway === null || identity === null || snapshot === null || !canUseAction(snapshot, action)) {
      setStatusText("服务端当前未开放此操作");
      return;
    }

    const actionGateway = gateway;
    const pendingAction: PendingActionConfirmation = {
      action,
      actionId: descriptorForAction(snapshot, action)?.actionId ?? null,
    };
    activeActionRef.current = pendingAction;
    setActionBusy(true);
    let result: ClientTransportActionResult;
    try {
      result = await callback(actionGateway);
    } catch {
      markPendingConfirmation(pendingAction);
      if (gatewayRef.current === actionGateway) {
        handleUnexpectedDisconnect(actionGateway, "动作结果未确认");
      }
      return;
    } finally {
      setActionBusy(false);
    }

    if (gatewayRef.current !== actionGateway) {
      markPendingConfirmation(pendingAction);
      return;
    }
    if (!result.ok) {
      if (isUncertainTransportResult(result)) {
        markPendingConfirmation(pendingAction);
        handleUnexpectedDisconnect(actionGateway, actionFailureText(result.reason));
      } else {
        activeActionRef.current = null;
      }
      setStatusText(actionFailureText(result.reason));
      return;
    }

    activeActionRef.current = null;
    clearPendingConfirmation();
    await persistSession(actionGateway, sessionRef.current);
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
    if (selectedGang.action === "claimAnGang") {
      await runRoomAction("claimAnGang", (activeGateway) =>
        activeGateway.claimAnGang(selectedGang.tile, selectedGang.actionId));
    } else if (selectedGang.action === "claimBaGang") {
      await runRoomAction("claimBaGang", (activeGateway) =>
        activeGateway.claimBaGang(selectedGang.candidate.candidateId, selectedGang.actionId));
    } else {
      await runRoomAction("exchangeGangYaoJi", (activeGateway) =>
        activeGateway.exchangeGangYaoJi(selectedGang.candidate.candidateId, selectedGang.actionId));
    }
    setSelectedGang(null);
  }

  async function runIntermissionAction(
    action: "readyNextRound" | "startNextRound" | "finishGame",
    actionId: string,
  ) {
    await runRoomAction(action, (activeGateway) => {
      if (action === "readyNextRound") {
        return activeGateway.readyNextRound(actionId);
      }
      if (action === "startNextRound") {
        return activeGateway.startNextRound(actionId);
      }
      return activeGateway.finishGame(actionId);
    });
  }

  async function clearStoredSession() {
    reconnectCoordinatorRef.current?.pause("sessionCleared");
    setReconnectActive(false);
    connectionGeneration.current += 1;
    closeCurrentGateway();
    sessionRef.current = null;
    setStoredSession(null);
    setIdentity(null);
    setSnapshot(null);
    setHandOrderIds([]);
    publicEventsRef.current = [];
    setPublicEvents([]);
    clearPendingConfirmation();
    resetTransientTurnState();
    setConnectionStatus("idle");
    setStatusText("已清除本机保存的会话");
    await mobileRoomSessionStore.clear();
  }

  async function invalidateStoredSession() {
    sessionRef.current = null;
    setStoredSession(null);
    setIdentity(null);
    setSnapshot(null);
    publicEventsRef.current = [];
    setPublicEvents([]);
    clearPendingConfirmation();
    resetTransientTurnState();
    await mobileRoomSessionStore.clear();
  }

  function requestImmediateReconnect(reason: string, successText: string) {
    if (sessionRef.current === null) {
      setConnectionStatus("error");
      setStatusText("没有可恢复的会话");
      return;
    }
    reconnectSuccessTextRef.current = successText;
    setReconnectActive(true);
    reconnectCoordinatorRef.current?.retryNow(reason);
  }

  function handleUnexpectedDisconnect(activeGateway: MobileRoomGateway, reason: string) {
    if (gatewayRef.current !== activeGateway) {
      return;
    }
    markActiveActionPending();
    gatewayRef.current = null;
    setGateway(null);
    resetTransientTurnState();
    activeGateway.close();
    if (sessionRef.current === null || appStateRef.current !== "active") {
      setConnectionStatus("offline");
      setStatusText(reason);
      return;
    }
    reconnectSuccessTextRef.current = pendingConfirmationRef.current === null
      ? "连接已恢复"
      : "连接已恢复，操作结果已按服务器最新牌局确认";
    setReconnectActive(true);
    reconnectCoordinatorRef.current?.start(reason);
  }

  function markActiveActionPending() {
    if (activeActionRef.current !== null) {
      markPendingConfirmation(activeActionRef.current);
    }
  }

  function markPendingConfirmation(pending: PendingActionConfirmation) {
    activeActionRef.current = null;
    pendingConfirmationRef.current = pending;
    setPendingConfirmation(pending);
  }

  function clearPendingConfirmation() {
    activeActionRef.current = null;
    pendingConfirmationRef.current = null;
    setPendingConfirmation(null);
  }

  function closeCurrentGateway() {
    const activeGateway = gatewayRef.current;
    const pendingGateway = pendingGatewayRef.current;
    gatewayRef.current = null;
    pendingGatewayRef.current = null;
    setGateway(null);
    resetTransientTurnState();
    activeActionRef.current = null;
    activeGateway?.close();
    if (pendingGateway !== activeGateway) {
      pendingGateway?.close();
    }
  }

  function resetTransientTurnState() {
    setSelectedDiscard(null);
    setSelectedGang(null);
    autoDrawInFlight.current = null;
  }

  async function requestLandscapeMode() {
    if (Platform.OS !== "web") {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
      return;
    }

    const browser = globalThis as {
      document?: { documentElement?: { requestFullscreen?: () => Promise<void> } };
      screen?: { orientation?: { lock?: (orientation: "landscape") => Promise<void> } };
    };
    await browser.document?.documentElement?.requestFullscreen?.().catch(() => undefined);
    await browser.screen?.orientation?.lock?.("landscape").catch(() => undefined);
    setStatusText("牌桌已适配横屏；若浏览器未自动旋转，请将手机横过来");
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "right", "bottom", "left"]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.pageShell}>
        <View style={[styles.header, roundInProgress && styles.headerGame]}>
          <View>
            <Text style={styles.brand}>乐山麻将</Text>
            <Text style={styles.subtitle}>八鸡联机桌</Text>
          </View>
          <StatusBadge status={connectionStatus} />
        </View>

        <View style={[styles.statusBand, roundInProgress && styles.statusBandGame]}>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
        {pendingConfirmation === null ? null : (
          <View style={styles.pendingConfirmationBand}>
            <Text style={styles.pendingConfirmationTitle}>操作结果待确认</Text>
            <Text style={styles.pendingConfirmationText}>
              {actionLabel(pendingConfirmation.action)}请求可能已经到达服务端。恢复后将以最新牌局为准，不会自动重放。
            </Text>
          </View>
        )}

        {roundInProgress ? null : (
          <>
            <RoundResultSection snapshot={snapshot} />
            <RoundIntermissionSection
              snapshot={snapshot}
              busy={actionBusy}
              onAction={(action, actionId) => void runIntermissionAction(action, actionId)}
            />
          </>
        )}

        <View style={[
          styles.primaryLayout,
          wideLayout && styles.primaryLayoutWide,
          roundInProgress && styles.primaryLayoutGame,
        ]}>
          {roundInProgress ? null : (
          <View style={[styles.controlColumn, wideLayout && styles.controlColumnWide]}>
        <Section title="服务器与房间">
          {productionWebClient ? (
            <View style={styles.productionServerSummary}>
              <View style={styles.productionServerDot} />
              <View style={styles.productionServerCopy}>
                <Text style={styles.productionServerTitle}>生产联机服务器</Text>
                <Text style={styles.productionServerAddress}>{serverUrl}</Text>
              </View>
            </View>
          ) : (
            <>
          <View style={styles.serverModeControl}>
            {serverModes.map((mode) => (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityState={{ selected: serverMode === mode }}
                style={({ pressed }) => [
                  styles.serverModeButton,
                  serverMode === mode && styles.serverModeButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => selectServerMode(mode)}
              >
                <Text style={[
                  styles.serverModeText,
                  serverMode === mode && styles.serverModeTextActive,
                ]}>
                  {serverModeLabel(mode)}
                </Text>
              </Pressable>
            ))}
          </View>
          {serverMode !== "development" ? null : (
            <View style={styles.developmentTargetRow}>
              {(["local", "androidEmulator"] as const).map((target) => (
                <Pressable
                  key={target}
                  accessibilityRole="button"
                  accessibilityState={{ selected: developmentTarget === target }}
                  style={({ pressed }) => [
                    styles.developmentTargetButton,
                    developmentTarget === target && styles.developmentTargetButtonActive,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => selectDevelopmentTarget(target)}
                >
                  <Text style={styles.developmentTargetText}>
                    {target === "local" ? "本机" : "Android 模拟器"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Field label="服务器地址" value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" />
          <Text style={styles.serverModeHint}>{serverModeHint(serverMode)}</Text>
            </>
          )}
          <View style={styles.fieldRow}>
            <View style={styles.flexField}>
              <Field label="房间号" value={roomId} onChangeText={setRoomId} autoCapitalize="characters" />
            </View>
            <View style={styles.flexField}>
              <Field label="昵称" value={displayName} onChangeText={setDisplayName} />
            </View>
          </View>
          <View style={styles.actionRow}>
            <CommandButton label="创建房间" onPress={() => void createOrJoinRoom("create")} disabled={actionBusy || isConnectionBusy(connectionStatus)} />
            <CommandButton label="加入房间" onPress={() => void createOrJoinRoom("join")} disabled={actionBusy || isConnectionBusy(connectionStatus)} tone="secondary" />
          </View>
          <View style={styles.actionRow}>
            <CommandButton
              label={connectionStatus === "online"
                ? "已连接"
                : connectionStatus === "waiting" || connectionStatus === "failed"
                  ? "立即重新连接"
                  : "恢复会话"}
              onPress={() => resumeStoredSession()}
              disabled={storedSession === null || connectionStatus === "online" || isConnectionBusy(connectionStatus)}
              tone="quiet"
            />
            <CommandButton label="清除会话" onPress={() => void clearStoredSession()} disabled={storedSession === null || actionBusy} tone="danger" />
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

          </View>
          )}

          <View style={[
            styles.tableColumn,
            wideLayout && styles.tableColumnWide,
            roundInProgress && styles.tableColumnGame,
          ]}>

        <Section title={roundInProgress ? `第 ${snapshot?.roundNumber ?? 1} 局` : "牌桌预览"} trailing={phaseText(viewModel)} variant={roundInProgress ? "game" : "default"}>
          {viewModel === null || snapshot?.round === null ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>等待牌局开始</Text>
              <Text style={styles.emptyMeta}>牌墙与手牌将在服务端开局后显示</Text>
            </View>
          ) : (
            <>
              {roundInProgress && !landscape ? (
                <View style={styles.landscapePrompt}>
                  <View style={styles.landscapePromptCopy}>
                    <Text style={styles.landscapePromptTitle}>横屏可完整看到手牌</Text>
                    <Text style={styles.landscapePromptText}>将手机横过来，或点击右侧按钮尝试进入横屏。</Text>
                  </View>
                  <Pressable accessibilityRole="button" style={styles.landscapeButton} onPress={() => void requestLandscapeMode()}>
                    <Text style={styles.landscapeButtonText}>进入横屏</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.tableMetaRow}>
                <MetaItem label="牌墙" value={`${viewModel.wallCount ?? 0} 张`} />
                <MetaItem label="当前座位" value={`${(snapshot?.round?.currentPlayer ?? 0) + 1}`} />
                <MetaItem label="本步剩余" value={deadlineLabel(viewModel, countdownNow)} />
              </View>
              {viewModel.turnDeadline === null ? null : (
                <View style={styles.deadlineBand}>
                  <Text style={styles.deadlineTitle}>{turnDeadlineTitle(viewModel, countdownNow)}</Text>
                  <Text style={styles.deadlineMeta}>{turnDeadlineHint(viewModel)}</Text>
                </View>
              )}
              {canUseAction(viewModel, "chooseMissingSuit") ? (
                <View style={styles.dingqueBand}>
                  <Text style={styles.turnActionTitle}>请选择定缺花色</Text>
                  <View style={styles.segmentedControl}>
                    {suits.map((suit) => (
                      <Pressable key={suit} disabled={actionBusy} style={({ pressed }) => [styles.segment, actionBusy && styles.disabled, pressed && !actionBusy && styles.pressed]} onPress={() => void chooseSuit(suit)} accessibilityRole="button">
                        <Text style={styles.segmentText}>缺{suitLabel(suit)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <View style={[styles.tableSeats, gameWideLayout && styles.gameSeatGrid]}>
              {orderedTableSeats(viewModel.seats).map((seat) => (
                <TableSeat
                  key={seat.seatId}
                  seat={seat}
                  gameMode={roundInProgress}
                  wideGameMode={gameWideLayout}
                  legalDiscardTiles={seat.isLocal ? legalTilesForAction(viewModel, "discardTile") : []}
                  selectedDiscard={seat.isLocal ? selectedDiscard?.tile ?? null : null}
                  onSelectDiscard={seat.isLocal ? (tile) => {
                    const descriptor = descriptorForAction(viewModel, "discardTile");
                    if (descriptor !== null) {
                      setSelectedGang(null);
                      setSelectedDiscard({ tile, actionId: descriptor.actionId });
                    }
                  } : undefined}
                  onMoveHandTile={seat.isLocal ? (movingTileId, targetTileId) => {
                    setHandOrderIds((previous) => moveMobileHandTile(previous, movingTileId, targetTileId));
                  } : undefined}
                />
              ))}
              </View>
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
                    {` · ${remainingSeconds(viewModel.responseWindow.deadlineAt, countdownNow)} 秒`}
                    {viewModel.hasRespondedByMe ? " · 你的选择已提交" : ""}
                  </Text>
                </View>
              )}
              <ResponseActions
                viewModel={viewModel}
                busy={actionBusy}
                run={(action, callback) => void runRoomAction(action, callback)}
              />
            </>
          )}
        </Section>
        {roundInProgress ? null : <RoundTimelineSection events={publicEvents} snapshot={snapshot} />}
          </View>
        </View>
        </View>
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
      handOrderRoundNumber: snapshot?.roundNumber,
      handOrderTileIds: [...handOrderIdsRef.current],
    };
    sessionRef.current = nextRecord;
    setStoredSession(nextRecord);
    lastPersistedEventId.current = nextRecord.lastEventId;
    try {
      await mobileRoomSessionStore.save(nextRecord);
    } catch {
      if (sessionRef.current?.sessionToken === nextRecord.sessionToken) {
        setStatusText("牌局已同步，但本机暂时无法保存恢复进度");
      }
    }
  }
}

function Section({
  title,
  trailing,
  variant = "default",
  children,
}: {
  title: string;
  trailing?: string;
  variant?: "default" | "game";
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, variant === "game" && styles.gameSection]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, variant === "game" && styles.gameSectionTitle]}>{title}</Text>
        {trailing === undefined ? null : (
          <Text style={[styles.sectionTrailing, variant === "game" && styles.gameSectionTrailing]}>{trailing}</Text>
        )}
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
  gameMode,
  wideGameMode,
  legalDiscardTiles,
  selectedDiscard,
  onSelectDiscard,
  onMoveHandTile,
}: {
  seat: ClientSeatViewModel;
  gameMode: boolean;
  wideGameMode: boolean;
  legalDiscardTiles: ClientOwnedTile[];
  selectedDiscard: ClientOwnedTile | null;
  onSelectDiscard?: (tile: ClientOwnedTile) => void;
  onMoveHandTile?: (movingTileId: string, targetTileId: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <View style={[
      styles.tableSeat,
      seat.isLocal && styles.tableSeatLocal,
      gameMode && styles.gameTableSeat,
      wideGameMode && seat.isLocal && styles.gameLocalSeat,
      wideGameMode && !seat.isLocal && styles.gameOpponentSeat,
    ]}>
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
          {Array.from({ length: Math.min(seat.handCount, wideGameMode ? 7 : 10) }, (_, index) => (
            <View key={index} style={[styles.coveredTile, wideGameMode && styles.coveredTileCompact]} />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          scrollEnabled={!dragging}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.handRow}
        >
          {seat.hand.map((tile, index) => {
            const selectable = legalDiscardTiles.some((candidate) => candidate.tileId === tile.tileId);
            const selected = selectedDiscard?.tileId === tile.tileId;
            return (
              <DraggableHandTile
                key={tile.tileId}
                tile={tile}
                index={index}
                tiles={seat.hand ?? []}
                selectable={selectable}
                selected={selected}
                onPress={onSelectDiscard}
                onMove={onMoveHandTile}
                onDragStateChange={setDragging}
              />
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

const handTileExtent = 41;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function DraggableHandTile({
  tile,
  index,
  tiles,
  selectable,
  selected,
  onPress,
  onMove,
  onDragStateChange,
}: {
  tile: ClientOwnedTile;
  index: number;
  tiles: ClientOwnedTile[];
  selectable: boolean;
  selected: boolean;
  onPress?: (tile: ClientOwnedTile) => void;
  onMove?: (movingTileId: string, targetTileId: string) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const moved = useRef(false);
  const mouseStartX = useRef<number | null>(null);
  const mouseDragging = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchLastX = useRef<number | null>(null);
  const touchDragging = useRef(false);

  const finishDrag = useCallback((dx: number) => {
    const targetIndex = Math.max(0, Math.min(tiles.length - 1, index + Math.round(dx / handTileExtent)));
    const target = tiles[targetIndex];
    if (target !== undefined && target.tileId !== tile.tileId) {
      onMove?.(tile.tileId, target.tileId);
    }
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    onDragStateChange(false);
    setTimeout(() => {
      moved.current = false;
    }, 0);
  }, [index, onDragStateChange, onMove, tile.tileId, tiles, translateX]);

  const cancelDrag = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    onDragStateChange(false);
  }, [onDragStateChange, translateX]);

  const handleMouseDown = useCallback((event: ReactMouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    mouseStartX.current = event.pageX;
    mouseDragging.current = false;
    moved.current = false;
  }, []);

  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    const touch = event.nativeEvent.touches[0];
    if (touch === undefined) {
      return;
    }
    touchStart.current = { x: touch.pageX, y: touch.pageY };
    touchLastX.current = touch.pageX;
    touchDragging.current = false;
    moved.current = false;
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return undefined;
    }
    const handleMouseMove = (event: MouseEvent) => {
      if (mouseStartX.current === null) {
        return;
      }
      const dx = event.pageX - mouseStartX.current;
      if (!mouseDragging.current && Math.abs(dx) > 6) {
        mouseDragging.current = true;
        moved.current = true;
        onDragStateChange(true);
      }
      if (mouseDragging.current) {
        event.preventDefault();
        translateX.setValue(dx);
      }
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (mouseStartX.current === null) {
        return;
      }
      const dx = event.pageX - mouseStartX.current;
      const wasDragging = mouseDragging.current;
      mouseStartX.current = null;
      mouseDragging.current = false;
      if (wasDragging) {
        finishDrag(dx);
      }
    };
    const handleTouchMove = (event: TouchEvent) => {
      const start = touchStart.current;
      const touch = event.touches[0];
      if (start === null || touch === undefined) {
        return;
      }
      const dx = touch.pageX - start.x;
      const dy = touch.pageY - start.y;
      touchLastX.current = touch.pageX;
      if (!touchDragging.current && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        touchDragging.current = true;
        moved.current = true;
        onDragStateChange(true);
      }
      if (touchDragging.current) {
        event.preventDefault();
        translateX.setValue(dx);
      }
    };
    const finishTouch = () => {
      const start = touchStart.current;
      const wasDragging = touchDragging.current;
      const dx = start === null || touchLastX.current === null ? 0 : touchLastX.current - start.x;
      touchStart.current = null;
      touchLastX.current = null;
      touchDragging.current = false;
      if (wasDragging) {
        finishDrag(dx);
      }
    };
    document.addEventListener("mousemove", handleMouseMove, { passive: false });
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", finishTouch);
    document.addEventListener("touchcancel", finishTouch);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", finishTouch);
      document.removeEventListener("touchcancel", finishTouch);
    };
  }, [finishDrag, onDragStateChange, translateX]);

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      onMove !== undefined && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      onMove !== undefined && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => {
      moved.current = false;
      onDragStateChange(true);
    },
    onPanResponderMove: (_event, gesture) => {
      moved.current = true;
      translateX.setValue(gesture.dx);
    },
    onPanResponderRelease: (_event, gesture) => {
      finishDrag(gesture.dx);
    },
    onPanResponderTerminate: cancelDrag,
    onPanResponderTerminationRequest: () => false,
  }), [cancelDrag, finishDrag, onDragStateChange, onMove, translateX]);
  return (
    <AnimatedPressable
      {...(Platform.OS === "web" ? {} : responder.panHandlers)}
      {...(Platform.OS === "web" ? { onMouseDown: handleMouseDown } : {})}
      onTouchStart={Platform.OS === "web" ? handleTouchStart : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${tileLabel(tile)}${selectable ? "，可出牌" : "，当前不可出；可拖动排序"}`}
      onPress={() => {
        if (!moved.current && selectable) {
          onPress?.(tile);
        }
      }}
      style={[
        styles.draggableHandTile,
        styles.handTileButton,
        Platform.OS === "web" && styles.draggableHandTileWeb,
        !selectable && styles.handTileDisabled,
        selected && styles.handTileSelected,
        { transform: [{ translateX }, { translateY: selected ? -6 : 0 }] },
      ]}
    >
      <TileFace tile={tile} />
    </AnimatedPressable>
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
  const anGangDescriptor = descriptorForAction(viewModel, "claimAnGang");
  const baGangDescriptor = descriptorForAction(viewModel, "claimBaGang");
  const exchangeDescriptor = descriptorForAction(viewModel, "exchangeGangYaoJi");
  const candidates: SelectedGang[] = [
    ...(anGangDescriptor?.action === "claimAnGang"
      ? anGangDescriptor.tiles.map((tile): SelectedGang => ({
          action: "claimAnGang",
          actionId: anGangDescriptor.actionId,
          tile,
        }))
      : []),
    ...(baGangDescriptor?.action === "claimBaGang"
      ? baGangDescriptor.candidates.map((candidate): SelectedGang => ({
          action: "claimBaGang",
          actionId: baGangDescriptor.actionId,
          candidate,
        }))
      : []),
    ...(exchangeDescriptor?.action === "exchangeGangYaoJi"
      ? exchangeDescriptor.candidates.map((candidate): SelectedGang => ({
          action: "exchangeGangYaoJi",
          actionId: exchangeDescriptor.actionId,
          candidate,
        }))
      : []),
  ];
  if (candidates.length === 0) {
    return null;
  }
  return (
    <View style={styles.turnActionBand}>
      <Text style={styles.turnActionTitle}>续杠与换幺鸡</Text>
      <View style={styles.responseActionRow}>
        {candidates.map((candidate) => {
          const candidateKey = selectedGangKey(candidate);
          const active = selected !== null && selectedGangKey(selected) === candidateKey;
          const label = selectedGangLabel(candidate);
          return (
            <CommandButton
              key={candidateKey}
              label={active ? `已选：${label}` : label}
              tone={active ? "primary" : "secondary"}
              disabled={busy}
              onPress={() => onSelect(candidate)}
            />
          );
        })}
      </View>
      {selected === null ? null : (
        <>
          <Text style={styles.turnNoticeText}>{selectedGangNotice(selected)}</Text>
          <CommandButton
            label={`确认${selectedGangLabel(selected)}`}
            onPress={onConfirm}
            disabled={busy}
          />
        </>
      )}
    </View>
  );
}

function selectedGangKey(selection: SelectedGang): string {
  if (selection.action === "claimAnGang") {
    return `${selection.actionId}:an:${selection.tile.suit}:${selection.tile.rank}`;
  }
  return `${selection.actionId}:${selection.candidate.candidateId}`;
}

function selectedGangLabel(selection: SelectedGang): string {
  if (selection.action === "claimAnGang") {
    return `暗杠 ${tileLabel(selection.tile)}`;
  }
  if (selection.action === "exchangeGangYaoJi") {
    return `换回幺鸡 ${tileLabel(selection.candidate.targetTile)}`;
  }
  const payment = selection.candidate.paymentEligibility === "zeroDelayedNatural"
    ? "本次杠分为 0"
    : `每位付款人 ${selection.candidate.pointsPerPayer} 分`;
  return `续杠 ${tileLabel(selection.candidate.targetTile)}（${payment}）`;
}

function selectedGangNotice(selection: SelectedGang): string {
  if (selection.action === "claimAnGang") {
    return "暗杠牌面只向你本人显示；成立后进入杠后补牌。";
  }
  if (selection.action === "exchangeGangYaoJi") {
    return `用手中的 ${tileLabel(selection.candidate.naturalTile)} 换回一张幺鸡；不重新计杠分、不补牌，也不触发抢杠胡。`;
  }
  const source = selection.candidate.usesLaizi ? "这组续杠包含幺鸡" : "这组续杠使用真牌";
  const payment = selection.candidate.paymentEligibility === "zeroDelayedNatural"
    ? "该真牌错过了摸到当回合，续杠合法但本次杠分为 0。"
    : `成立时由 ${selection.candidate.payerSeatIds.length} 位未胡玩家每人支付 ${selection.candidate.pointsPerPayer} 分。`;
  return `${source}。${payment}确认后先进入抢杠胡窗口；无人抢杠才正式成立并补牌。`;
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
  const labels: Record<ConnectionStatus, string> = {
    idle: "未连接",
    connecting: "连接中",
    background: "后台",
    offline: "离线",
    waiting: "等待重试",
    reconnecting: "重连中",
    resuming: "恢复中",
    online: "在线",
    failed: "重连失败",
    error: "异常",
  };

  return (
    <View style={[
      styles.statusBadge,
      status === "online" && styles.statusBadgeOnline,
      (status === "waiting" || status === "reconnecting" || status === "resuming") && styles.statusBadgeWaiting,
      (status === "failed" || status === "error" || status === "offline") && styles.statusBadgeError,
    ]}>
      <Text style={styles.statusBadgeText}>{labels[status]}</Text>
    </View>
  );
}

function isConnectionBusy(status: ConnectionStatus): boolean {
  return status === "connecting" || status === "reconnecting" || status === "resuming";
}

function localSeat(viewModel: ClientRoomViewModel | null): ClientSeatViewModel | null {
  return viewModel?.seats.find((seat) => seat.isLocal) ?? null;
}

function orderedTableSeats(seats: ClientSeatViewModel[]): ClientSeatViewModel[] {
  return [...seats].sort((left, right) => Number(left.isLocal) - Number(right.isLocal));
}

function remainingSeconds(deadlineAt: number, now: number): number {
  return Math.max(0, Math.ceil((deadlineAt - now) / 1_000));
}

function deadlineLabel(viewModel: ClientRoomViewModel, now: number): string {
  const deadlineAt = viewModel.turnDeadline?.deadlineAt ?? viewModel.responseWindow?.deadlineAt;
  return deadlineAt === undefined ? "--" : `${remainingSeconds(deadlineAt, now)} 秒`;
}

function turnDeadlineTitle(viewModel: ClientRoomViewModel, now: number): string {
  const deadline = viewModel.turnDeadline;
  if (deadline === null) {
    return "";
  }
  const seconds = remainingSeconds(deadline.deadlineAt, now);
  if (deadline.kind === "dingque") {
    return `定缺倒计时 ${seconds} 秒`;
  }
  return deadline.seatId === viewModel.localSeatId
    ? `请在 ${seconds} 秒内出牌`
    : `座位 ${(deadline.seatId ?? 0) + 1} 思考中 · ${seconds} 秒`;
}

function turnDeadlineHint(viewModel: ClientRoomViewModel): string {
  if (viewModel.turnDeadline?.kind === "dingque") {
    return "超时后服务端会排除一条、一筒，自动选择普通牌最少的花色。";
  }
  return viewModel.turnDeadline?.seatId === viewModel.localSeatId
    ? "超时后服务端会优先打出刚摸且合法的牌。"
    : "该玩家超时后由服务端自动出牌。";
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
    exchangeGangYaoJi: "换回幺鸡",
    passQiangGang: "过抢杠",
    claimQiangGangHu: "抢杠胡",
    readyNextRound: "准备下一局",
    startNextRound: "开始下一局",
    finishGame: "结束整场",
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
    invalidSession: "保存的会话已失效，请重新加入房间",
    roomNotFound: "服务器已重启或房间已结束，原房间已不存在，请重新创建房间",
    invalidAddress: "服务器地址格式不正确，请输入 ws:// 或 wss:// 地址",
    insecureProductionUrl: "生产服务器必须使用 wss:// 加密连接",
    tlsError: "安全连接失败，请检查证书、域名和设备时间",
    deviceOffline: "当前设备未联网，请检查 Wi-Fi 或移动网络",
    serverOffline: "无法连接服务器，服务器可能未启动或暂时不可用",
    originRejected: "当前客户端来源未获服务器允许",
  };
  return labels[reason] ?? "操作失败，请按服务器最新状态重试";
}

function serverModeLabel(mode: MobileServerMode): string {
  return mode === "development" ? "开发服务器" : mode === "lan" ? "局域网" : "生产服务器";
}

function serverModeHint(mode: MobileServerMode): string {
  if (mode === "production") {
    return "远程内测只允许 wss:// 安全地址";
  }
  if (mode === "lan") {
    return "填写运行服务端电脑的局域网 IP，例如 ws://192.168.1.20:8787";
  }
  return "本机用于 iOS 模拟器；Android 模拟器使用 10.0.2.2";
}

function isUncertainTransportResult(result: ClientTransportActionResult): boolean {
  return !result.ok && (result.kind === "transport" || result.kind === "protocol");
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

function createInitialRoomId(): string {
  if (Platform.OS !== "web") {
    return "LSMJ-MOBILE";
  }

  const search = (globalThis as { location?: { search?: string } }).location?.search;
  if (search !== undefined) {
    const invitedRoomId = new URLSearchParams(search).get("room")?.trim().toUpperCase();
    if (invitedRoomId !== undefined && /^[A-Z0-9-]{3,32}$/.test(invitedRoomId)) {
      return invitedRoomId;
    }
  }

  return `LSMJ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#173A2C",
  },
  scrollView: {
    flex: 1,
    backgroundColor: "#F4F5F0",
  },
  page: {
    flexGrow: 1,
    paddingBottom: 32,
    backgroundColor: "#F4F5F0",
  },
  pageShell: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    backgroundColor: "#F4F5F0",
  },
  primaryLayout: {
    width: "100%",
  },
  primaryLayoutWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  primaryLayoutGame: {
    flex: 1,
    backgroundColor: "#18523E",
  },
  controlColumn: {
    width: "100%",
  },
  controlColumnWide: {
    width: 390,
    borderRightWidth: 1,
    borderRightColor: "#D9DDD5",
  },
  tableColumn: {
    width: "100%",
  },
  tableColumnWide: {
    flex: 1,
    minWidth: 0,
  },
  tableColumnGame: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#18523E",
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
  headerGame: {
    minHeight: 62,
    paddingVertical: 9,
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
  statusBadgeWaiting: {
    backgroundColor: "#9B6A1D",
  },
  statusBadgeError: {
    backgroundColor: "#9A3D3D",
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
  statusBandGame: {
    minHeight: 36,
    paddingVertical: 6,
  },
  statusText: {
    color: "#29463A",
    fontSize: 14,
    lineHeight: 20,
  },
  serverModeControl: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  serverModeButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#BFC7C0",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
  },
  serverModeButtonActive: {
    borderColor: "#1F5A43",
    backgroundColor: "#DCECE3",
  },
  serverModeText: {
    color: "#4E5A53",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  serverModeTextActive: {
    color: "#174A36",
  },
  developmentTargetRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  developmentTargetButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#C8CEC7",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F8F5",
  },
  developmentTargetButtonActive: {
    borderColor: "#2F6073",
    backgroundColor: "#E0EDF1",
  },
  developmentTargetText: {
    color: "#294D5A",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  serverModeHint: {
    color: "#667068",
    fontSize: 12,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 8,
  },
  productionServerSummary: {
    minHeight: 58,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#BED1C5",
    borderRadius: 6,
    backgroundColor: "#E6F0E9",
    flexDirection: "row",
    alignItems: "center",
  },
  productionServerDot: {
    width: 10,
    height: 10,
    marginRight: 10,
    borderRadius: 5,
    backgroundColor: "#24704B",
  },
  productionServerCopy: {
    flex: 1,
    minWidth: 0,
  },
  productionServerTitle: {
    color: "#174A36",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  productionServerAddress: {
    color: "#52635A",
    fontSize: 11,
    lineHeight: 16,
  },
  pendingConfirmationBand: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#FFF1D6",
    borderBottomWidth: 1,
    borderBottomColor: "#E3C98E",
  },
  pendingConfirmationTitle: {
    color: "#69480F",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  pendingConfirmationText: {
    color: "#745B2D",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#D9DDD5",
  },
  gameSection: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0,
    backgroundColor: "#18523E",
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
  gameSectionTitle: {
    color: "#FFFFFF",
  },
  sectionTrailing: {
    color: "#667068",
    fontSize: 12,
    lineHeight: 18,
  },
  gameSectionTrailing: {
    color: "#D2E8DD",
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
  landscapePrompt: {
    minHeight: 58,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#FFF3CF",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  landscapePromptCopy: {
    flex: 1,
    minWidth: 0,
  },
  landscapePromptTitle: {
    color: "#624817",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  landscapePromptText: {
    color: "#765E30",
    fontSize: 11,
    lineHeight: 16,
  },
  landscapeButton: {
    minWidth: 84,
    minHeight: 42,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#8A651D",
    alignItems: "center",
    justifyContent: "center",
  },
  landscapeButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  metaItem: {
    flex: 1,
    minHeight: 58,
    borderRadius: 6,
    backgroundColor: "#E4ECE7",
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  deadlineBand: {
    minHeight: 48,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: "#F1DFAB",
  },
  deadlineTitle: {
    color: "#5C4314",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "900",
  },
  deadlineMeta: {
    color: "#705A2E",
    fontSize: 11,
    lineHeight: 16,
  },
  dingqueBand: {
    marginBottom: 8,
    padding: 10,
    borderRadius: 6,
    backgroundColor: "#E9F0EB",
  },
  tableSeats: {
    width: "100%",
  },
  gameSeatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "stretch",
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
  gameTableSeat: {
    marginBottom: 6,
    paddingHorizontal: 9,
    borderTopWidth: 0,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  gameOpponentSeat: {
    width: "32.5%",
    minHeight: 96,
  },
  gameLocalSeat: {
    width: "100%",
    minHeight: 112,
    marginHorizontal: 0,
    borderWidth: 2,
    borderColor: "#E9C85E",
    backgroundColor: "#F8FBF7",
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
    minWidth: 39,
    minHeight: 56,
    marginRight: 2,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  draggableHandTile: {
    zIndex: 1,
  },
  draggableHandTileWeb: {
    cursor: "pointer",
    userSelect: "none",
  },
  handTileDisabled: {
    opacity: 0.34,
  },
  handTileSelected: {
    backgroundColor: "#CFE7D8",
    borderWidth: 2,
    borderColor: "#24704B",
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
  coveredTileCompact: {
    width: 15,
    height: 27,
    marginRight: 2,
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
