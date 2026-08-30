import { Pressable, StyleSheet, Text, View } from "react-native";

import { BrandLockup } from "./BrandLockup";
import { colors, fonts } from "../theme";

type Props = {
  onBack: () => void;
  /** Spoken by a screen reader on the back control, e.g. "Back to account". */
  backLabel: string;
};

/**
 * The bar at the top of every secondary page — support, legal, notifications,
 * closing an account.
 *
 * One component so the back control is in the same place, the same size, and
 * says something specific to a screen reader on every one of them. The hit
 * area is padded well past the glyph: a chevron drawn at font size is a
 * 12-point target, and Apple asks for 44.
 */
export function PageHeader({ onBack, backLabel }: Props) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={backLabel}
        accessibilityRole="button"
        hitSlop={12}
        onPress={onBack}
        style={styles.backTarget}
      >
        <Text style={styles.back}>‹</Text>
      </Pressable>
      <BrandLockup compact />
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.paper,
  },
  backTarget: { width: 44, minHeight: 44, justifyContent: "center" },
  back: { color: colors.rust, fontFamily: fonts.sans, fontSize: 35, lineHeight: 40 },
  spacer: { width: 44 },
});
