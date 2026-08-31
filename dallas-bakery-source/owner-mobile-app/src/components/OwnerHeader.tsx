import { Pressable, StyleSheet, Text, View } from "react-native";

import { BrandLockup } from "./BrandLockup";
import { colors, fonts } from "../theme";

type Props = {
  /** Shown on a pushed screen; omitted on a tab root. */
  onBack?: () => void;
  backLabel?: string;
  right?: string;
  onRight?: () => void;
};

export function OwnerHeader({ onBack, backLabel = "Back", right, onRight }: Props) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityLabel={backLabel} accessibilityRole="button" onPress={onBack} style={styles.side}>
          <Text style={styles.back}>‹ {backLabel.toUpperCase()}</Text>
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}
      <BrandLockup compact />
      {right && onRight ? (
        <Pressable accessibilityRole="button" onPress={onRight} style={[styles.side, styles.rightSide]}>
          <Text style={styles.right}>{right.toUpperCase()}</Text>
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 62,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.lineDark,
    backgroundColor: colors.chocolate,
  },
  side: { width: 92, justifyContent: "center" },
  rightSide: { alignItems: "flex-end" },
  back: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 9.5, letterSpacing: 0.9 },
  right: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 9.5, letterSpacing: 0.9 },
});
