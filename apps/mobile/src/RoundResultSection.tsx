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
      <Text style={styles.eyebrow}>本局结算</Text>
      <Text style={styles.title}>{result.reasonLabel}</Text>
      <View style={styles.scoreList}>
        {result.scores.map((score, index) => (
          <View key={score.seatId} style={[styles.scoreRow, score.isLocal && styles.localScore]}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.name}>{score.displayName}{score.isLocal ? "（我）" : ""}</Text>
            <Text style={[styles.points, score.points < 0 && styles.negative]}>
              {score.points > 0 ? "+" : ""}{score.points} 分
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.subTitle}>积分明细</Text>
      {result.settlements.length === 0 ? (
        <Text style={styles.empty}>本局没有产生积分转账</Text>
      ) : result.settlements.map((entry, index) => (
        <View key={`${entry.category}-${index}`} style={styles.settlementRow}>
          <View style={styles.reasonBadge}><Text style={styles.reasonText}>{entry.label}</Text></View>
          <Text style={styles.settlementText}>{entry.text}</Text>
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
  eyebrow: {
    color: "#2F6073",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  title: {
    color: "#173A2C",
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "800",
    marginTop: 2,
  },
  scoreList: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#C7D3CB",
  },
  scoreRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#D2DDD6",
  },
  localScore: {
    backgroundColor: "#D6E8DD",
  },
  rank: {
    width: 34,
    color: "#68716B",
    fontSize: 13,
    textAlign: "center",
  },
  name: {
    flex: 1,
    color: "#25302B",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  points: {
    color: "#1F6A45",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    paddingRight: 8,
  },
  negative: {
    color: "#9A3D3D",
  },
  subTitle: {
    color: "#1F2924",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 6,
  },
  empty: {
    color: "#68716B",
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 8,
  },
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
  reasonText: {
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
  },
  settlementText: {
    flex: 1,
    color: "#33403A",
    fontSize: 13,
    lineHeight: 19,
    marginLeft: 10,
  },
});
