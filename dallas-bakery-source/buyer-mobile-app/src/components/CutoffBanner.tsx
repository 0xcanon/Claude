import { StyleSheet, Text, View } from "react-native";

import type { CutoffState } from "../lib/storefront";
import { colors, fonts } from "../theme";

/**
 * The one line every wholesale buyer plans around: does an order placed right
 * now bake today or tomorrow? Rendered identically on the catalog and the
 * cart so the answer never changes between adding cases and paying.
 */
export function CutoffBanner({ cutoff }: { cutoff: CutoffState | null }) {
  if (!cutoff) return null;
  return (
    <View style={[styles.banner, cutoff.shipsToday ? styles.today : styles.tomorrow]}>
      <Text style={[styles.text, cutoff.shipsToday ? styles.textToday : styles.textTomorrow]}>
        {cutoff.shipsToday ? "●  " : "◷  "}
        {cutoff.label}. Cutoff is 12:00 PM Central.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 13, borderLeftWidth: 3 },
  today: { borderLeftColor: colors.sage, backgroundColor: colors.sagePale },
  tomorrow: { borderLeftColor: colors.gold, backgroundColor: colors.goldPale },
  text: { fontFamily: fonts.sansMedium, fontSize: 9.5, lineHeight: 15 },
  textToday: { color: "#3D5740" },
  textTomorrow: { color: "#8A5716" },
});
