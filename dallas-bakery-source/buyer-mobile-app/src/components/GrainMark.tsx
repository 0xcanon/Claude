import { StyleSheet, View } from "react-native";

import { colors } from "../theme";

type Props = { color?: string; size?: number };
type Leaf = { top: number; rotate: string; left?: number; right?: number };

const leaves: Leaf[] = [
  { top: 5, left: 4, rotate: "35deg" },
  { top: 5, right: 4, rotate: "-35deg" },
  { top: 14, left: 2, rotate: "35deg" },
  { top: 14, right: 2, rotate: "-35deg" },
  { top: 23, left: 1, rotate: "35deg" },
  { top: 23, right: 1, rotate: "-35deg" },
];

export function GrainMark({ color = colors.rust, size = 38 }: Props) {
  const scale = size / 38;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      <View style={{ width: 38, height: 38, left: (size - 38) / 2, top: (size - 38) / 2, transform: [{ scale }] }}>
        <View style={[styles.stalk, { backgroundColor: color }]} />
        {leaves.map((leaf, index) => (
          <View
            key={index}
            style={[
              styles.leaf,
              {
                borderColor: color,
                top: leaf.top,
                left: leaf.left,
                right: leaf.right,
                transform: [{ rotate: leaf.rotate }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stalk: { position: "absolute", left: 18, top: 3, width: 1.5, height: 34 },
  leaf: { position: "absolute", width: 13, height: 8, borderRadius: 8, borderWidth: 1.5, backgroundColor: "transparent" },
});
