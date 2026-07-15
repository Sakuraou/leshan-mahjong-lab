import {
  toMobileTimelineItems,
  type ClientVisibleRoomState,
  type MobilePublicEvent,
} from "@leshan-mahjong/client-core";
import { StyleSheet, Text, View } from "react-native";

export function RoundTimelineSection({
  events,
  snapshot,
}: {
  events: readonly MobilePublicEvent[];
  snapshot: ClientVisibleRoomState | null;
}) {
  const items = toMobileTimelineItems(events, snapshot).slice(-8).reverse();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>牌局动态</Text>
        <Text style={styles.meta}>最近 {items.length} 条</Text>
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>等待加入、定缺或出牌动态</Text>
      ) : items.map((item) => (
        <View key={item.eventId} style={styles.row}>
          <Text style={styles.order}>#{item.eventId}</Text>
          <Text style={styles.text}>{item.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#D9DDD5",
  },
  header: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    color: "#1F2924",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  meta: {
    color: "#667068",
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    color: "#6B746D",
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 10,
  },
  row: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#E2E5E0",
  },
  order: {
    width: 46,
    color: "#68716B",
    fontSize: 12,
    lineHeight: 19,
  },
  text: {
    flex: 1,
    color: "#26312C",
    fontSize: 14,
    lineHeight: 20,
  },
});
