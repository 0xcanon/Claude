import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";

type Props = {
  label: string;
  value: number;
  detail: string;
};

export function StatCard({ label, value, detail }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48.5%",
    minHeight: 126,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  label: {
    color: colors.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 1.7,
  },
  value: {
    marginTop: 10,
    color: colors.rust,
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 38,
  },
  detail: {
    marginTop: 5,
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
});
