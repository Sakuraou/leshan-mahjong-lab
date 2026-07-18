import type { Tile } from "@leshan-mahjong/client-core";
import { StyleSheet, Text, View } from "react-native";

type Mark = { row: number; column: number; color: "green" | "red" | "blue" };

const gridLayouts: Record<number, Array<[number, number]>> = {
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  7: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  8: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2], [0.65, 1], [1.35, 1]],
  9: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
};

const characterNumbers = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function TileFace({ tile }: { tile: Tile }) {
  return (
    <View style={styles.tile} accessibilityLabel={tileAccessibilityLabel(tile)}>
      {tile.suit === "characters" ? <CharacterFace rank={tile.rank} /> : null}
      {tile.suit === "dots" ? <DotFace rank={tile.rank} /> : null}
      {tile.suit === "bamboos" ? <BambooFace rank={tile.rank} /> : null}
    </View>
  );
}

function CharacterFace({ rank }: { rank: number }) {
  return (
    <View style={styles.characterFace}>
      <Text style={styles.characterNumber}>{characterNumbers[rank]}</Text>
      <Text style={styles.characterSuit}>万</Text>
    </View>
  );
}

function DotFace({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <View style={styles.oneDotOuter}>
        <View style={styles.oneDotMiddle}>
          <View style={styles.oneDotInner} />
        </View>
      </View>
    );
  }

  return <MarkGrid marks={createMarks(rank)} kind="dot" />;
}

function BambooFace({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Text style={styles.bambooBird}>雀</Text>;
  }

  return <MarkGrid marks={createMarks(rank)} kind="bamboo" />;
}

function MarkGrid({ marks, kind }: { marks: Mark[]; kind: "dot" | "bamboo" }) {
  return (
    <View style={styles.markGrid}>
      {marks.map((mark, index) => (
        <View
          key={`${mark.row}-${mark.column}-${index}`}
          style={[
            kind === "dot" ? styles.dotMark : styles.bambooMark,
            mark.color === "green" ? styles.markGreen : mark.color === "red" ? styles.markRed : styles.markBlue,
            {
              left: 2 + mark.column * 9,
              top: 2 + mark.row * 14,
            },
          ]}
        >
          {kind === "dot" ? <View style={styles.dotCore} /> : <View style={styles.bambooJoint} />}
        </View>
      ))}
    </View>
  );
}

function createMarks(rank: number): Mark[] {
  const colors: Mark["color"][] = rank === 5
    ? ["green", "blue", "red", "blue", "green"]
    : rank === 7
      ? ["red", "red", "red", "green", "blue", "green", "blue"]
      : ["green", "blue", "red"];
  return (gridLayouts[rank] ?? []).map(([row, column], index) => ({
    row,
    column,
    color: colors[index % colors.length],
  }));
}

function tileAccessibilityLabel(tile: Tile): string {
  const suit = tile.suit === "characters" ? "万" : tile.suit === "dots" ? "筒" : "条";
  return `${tile.rank}${suit}`;
}

const styles = StyleSheet.create({
  tile: {
    width: 38,
    height: 54,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#BFC4BA",
    backgroundColor: "#FFFDF6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  characterFace: {
    alignItems: "center",
    justifyContent: "center",
  },
  characterNumber: {
    color: "#174F8D",
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "900",
  },
  characterSuit: {
    color: "#B53B35",
    fontSize: 17,
    lineHeight: 19,
    fontWeight: "900",
  },
  markGrid: {
    position: "relative",
    width: 25,
    height: 39,
  },
  dotMark: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  dotCore: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#FFFDF6",
  },
  bambooMark: {
    position: "absolute",
    width: 6,
    height: 12,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "5deg" }],
  },
  bambooJoint: {
    width: 6,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  markGreen: {
    backgroundColor: "#277451",
  },
  markRed: {
    backgroundColor: "#C5443C",
  },
  markBlue: {
    backgroundColor: "#315FA2",
  },
  oneDotOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 4,
    borderColor: "#277451",
    alignItems: "center",
    justifyContent: "center",
  },
  oneDotMiddle: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#C5443C",
    alignItems: "center",
    justifyContent: "center",
  },
  oneDotInner: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#315FA2",
  },
  bambooBird: {
    color: "#277451",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    textShadowColor: "#C5443C",
    textShadowRadius: 0.7,
    textShadowOffset: { width: 1, height: 1 },
  },
});
