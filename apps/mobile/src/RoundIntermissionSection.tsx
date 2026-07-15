import {
  type ClientLegalAction,
  type ClientVisibleRoomState,
  toMobileIntermissionViewModel,
} from "@leshan-mahjong/client-core";
import { Pressable, StyleSheet, Text, View } from "react-native";

type IntermissionAction = Extract<
  ClientLegalAction,
  "readyNextRound" | "startNextRound" | "finishGame"
>;

export function RoundIntermissionSection({
  snapshot,
  busy,
  onAction,
}: {
  snapshot: ClientVisibleRoomState | null;
  busy: boolean;
  onAction: (action: IntermissionAction, actionId: string) => void;
}) {
  const model = toMobileIntermissionViewModel(snapshot);
  if (model === null) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text style={styles.title}>下一局</Text>
        <Text style={styles.meta}>四人重新准备后开局</Text>
      </View>

      <View style={styles.readyList}>
        {model.readySeats.map((seat) => (
          <View key={seat.seatId} style={styles.readyRow}>
            <Text style={styles.playerName}>{seat.displayName}</Text>
            <Text style={[styles.badge, seat.ready ? styles.readyBadge : styles.waitingBadge]}>
              {seat.ready ? "已准备" : "未准备"}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {model.actions.map(({ action, actionId }) => (
          <Pressable
            key={action}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onAction(action, actionId)}
            style={({ pressed }) => [
              styles.button,
              action === "finishGame" ? styles.finishButton : styles.primaryButton,
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}
          >
            <Text style={action === "finishGame" ? styles.finishText : styles.primaryText}>
              {actionLabel(action)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function actionLabel(action: IntermissionAction): string {
  if (action === "readyNextRound") {
    return "准备下一局";
  }
  if (action === "startNextRound") {
    return "开始下一局";
  }
  return "结束整场";
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DFD8",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  headingRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  title: { color: "#17251E", fontSize: 18, lineHeight: 24, fontWeight: "800" },
  meta: { color: "#65736B", fontSize: 12, lineHeight: 18 },
  readyList: { gap: 8 },
  readyRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomColor: "#EEF1EE",
    borderBottomWidth: 1,
  },
  playerName: { color: "#25342C", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  badge: { fontSize: 12, lineHeight: 18, fontWeight: "800" },
  readyBadge: { color: "#1F6A45" },
  waitingBadge: { color: "#8A6251" },
  actions: { gap: 10 },
  button: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 6, paddingHorizontal: 16 },
  primaryButton: { backgroundColor: "#176B49" },
  finishButton: { backgroundColor: "#FFF7F3", borderColor: "#C88468", borderWidth: 1 },
  primaryText: { color: "#FFFFFF", fontSize: 15, lineHeight: 20, fontWeight: "800" },
  finishText: { color: "#984B35", fontSize: 15, lineHeight: 20, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
