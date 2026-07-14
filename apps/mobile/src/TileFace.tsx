import type { Tile } from "@leshan-mahjong/client-core";
import { suitLabel } from "@leshan-mahjong/client-core";
import { StyleSheet, Text, View } from "react-native";

export function TileFace({ tile }: { tile: Tile }) {
  const suitStyle =
    tile.suit === "characters"
      ? styles.characters
      : tile.suit === "dots"
        ? styles.dots
        : styles.bamboos;

  return (
    <View style={styles.tile} accessibilityLabel={`${tile.rank}${suitLabel(tile.suit)}`}>
      <Text style={[styles.rank, suitStyle]}>{tile.rank}</Text>
      <Text style={[styles.suit, suitStyle]}>{suitLabel(tile.suit)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 40,
    height: 56,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#C9CDC4",
    backgroundColor: "#FFFDF8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  rank: {
    fontSize: 21,
    lineHeight: 23,
    fontWeight: "800",
  },
  suit: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
  },
  characters: {
    color: "#B33A3A",
  },
  dots: {
    color: "#2F6073",
  },
  bamboos: {
    color: "#24704B",
  },
});
