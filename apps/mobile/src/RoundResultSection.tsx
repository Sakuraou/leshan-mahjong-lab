import {
  toMobileRoundResultViewModel,
  type ClientVisibleRoomState,
} from "@leshan-mahjong/client-core";
import { StyleSheet, Text, View } from "react-native";

export function RoundResultSection({ snapshot }: { snapshot: ClientVisibleRoomState | null }) {
  const result = toMobileRoundResultViewModel(snapshot);
  if (result === null) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{result.gameFinished ? "整场结算" : `第 ${result.roundNumber} 局结算`}</Text>
      <Text style={styles.title}>{result.reasonLabel}</Text>
      {result.gameFinished ? null : (
        <Text style={styles.dealerLine}>
          下一局庄家：{result.nextDealer.displayName} · {result.nextDealer.reasonLabel}
        </Text>
      )}
      <View style={styles.scoreList}>
        {result.scores.map((score, index) => (
          <View key={score.seatId} style={[styles.scoreRow, score.isLocal && styles.localScore]}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.name}>{score.displayName}{score.isLocal ? "（我）" : ""}</Text>
            <View style={styles.scoreValues}>
              <Text style={[styles.points, score.roundDelta < 0 && styles.negative]}>
                本局 {score.roundDelta > 0 ? "+" : ""}{score.roundDelta}
              </Text>
              <Text style={styles.totalPoints}>累计 {score.cumulativePoints}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.subTitle}>本局积分明细</Text>
      {result.settlements.length === 0 ? (
        <Text style={styles.empty}>本局没有产生积分转账</Text>
      ) : result.settlements.map((entry, index) => (
        <View key={`${entry.category}-${index}`} style={styles.settlementRow}>
          <View style={styles.reasonBadge}><Text style={styles.reasonText}>{entry.label}</Text></View>
          <Text style={styles.settlementText}>{entry.text}</Text>
        </View>
      ))}
      <Text style={styles.subTitle}>逐局积分</Text>
      {result.history.map((entry) => (
        <View key={entry.roundNumber} style={styles.historyRow}>
          <Text style={styles.historyTitle}>第 {entry.roundNumber} 局</Text>
          <Text style={styles.historyMeta}>庄家 {entry.dealerName} · 下局 {entry.nextDealerName}</Text>
          <Text style={styles.historyScores}>{entry.scoreText}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: "#E8F0EB",
    borderBottomWidth: 1,
    borderBottomColor: "#C8D5CD",
  },
  eyebrow: { color: "#2F6073", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  title: { color: "#173A2C", fontSize: 20, lineHeight: 27, fontWeight: "800", marginTop: 2 },
  dealerLine: { color: "#334E43", fontSize: 13, lineHeight: 20, marginTop: 6 },
  scoreList: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#C7D3CB" },
  scoreRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#D2DDD6",
  },
  localScore: { backgroundColor: "#D6E8DD" },
  rank: { width: 34, color: "#68716B", fontSize: 13, textAlign: "center" },
  name: { flex: 1, color: "#25302B", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  scoreValues: { alignItems: "flex-end", paddingRight: 8 },
  points: { color: "#1F6A45", fontSize: 14, lineHeight: 20, fontWeight: "800" },
  negative: { color: "#9A3D3D" },
  totalPoints: { color: "#56635D", fontSize: 12, lineHeight: 18 },
  subTitle: { color: "#1F2924", fontSize: 15, lineHeight: 21, fontWeight: "800", marginTop: 18, marginBottom: 6 },
  empty: { color: "#68716B", fontSize: 13, lineHeight: 20, paddingVertical: 8 },
  settlementRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#D2DDD6",
    paddingVertical: 8,
  },
  reasonBadge: {
    minWidth: 58,
    minHeight: 28,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: "#2F6073",
  },
  reasonText: { color: "#FFFFFF", fontSize: 11, lineHeight: 16, fontWeight: "800" },
  settlementText: { flex: 1, color: "#33403A", fontSize: 13, lineHeight: 19, marginLeft: 10 },
  historyRow: { borderTopWidth: 1, borderTopColor: "#D2DDD6", paddingVertical: 9 },
  historyTitle: { color: "#26342E", fontSize: 13, lineHeight: 19, fontWeight: "800" },
  historyMeta: { color: "#5B6962", fontSize: 12, lineHeight: 18, marginTop: 2 },
  historyScores: { color: "#33403A", fontSize: 12, lineHeight: 18, marginTop: 2 },
});
