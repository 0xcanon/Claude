import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";
import { GrainMark } from "./GrainMark";

type Props = {
  compact?: boolean;
  light?: boolean;
};

export function BrandLockup({ compact = false, light = false }: Props) {
  const primary = light ? colors.paper : colors.chocolate;
  return (
    <View style={styles.row} accessibilityLabel="Dallas Bakery Owner Portal">
      <GrainMark color={colors.rust} size={compact ? 30 : 40} />
      <View>
        <Text style={[styles.name, { color: primary }, compact && styles.nameCompact]}>DALLAS BAKERY</Text>
        <Text style={[styles.subname, compact && styles.subnameCompact]}>OWNER PORTAL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: {
    fontFamily: fonts.serif,
    fontSize: 20,
    lineHeight: 23,
    letterSpacing: 0.5,
    fontWeight: "700",
  },
  nameCompact: { fontSize: 16, lineHeight: 19 },
  subname: {
    marginTop: 2,
    color: colors.rust,
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 3,
  },
  subnameCompact: { fontSize: 8, lineHeight: 11, letterSpacing: 2.3 },
});
