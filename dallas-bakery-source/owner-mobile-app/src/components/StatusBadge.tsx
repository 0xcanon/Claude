import { StyleSheet, Text, View } from "react-native";

import { statusLabel } from "../lib/application-utils";
import { colors, fonts } from "../theme";

type Props = {
  status: string;
};

export function StatusBadge({ status }: Props) {
  const palette = status === "approved"
    ? { backgroundColor: colors.sagePale, color: colors.sage }
    : status === "declined"
      ? { backgroundColor: colors.rosePale, color: colors.danger }
      : { backgroundColor: colors.goldPale, color: colors.chocolate };
  return (
    <View style={[styles.badge, { backgroundColor: palette.backgroundColor }]}>
      <Text style={[styles.label, { color: palette.color }]}>{statusLabel(status).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minHeight: 25, justifyContent: "center", paddingHorizontal: 9 },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 1.1,
  },
});
