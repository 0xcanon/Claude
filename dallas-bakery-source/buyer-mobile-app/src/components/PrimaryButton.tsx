import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts } from "../theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  outline?: boolean;
};

export function PrimaryButton({ label, onPress, disabled = false, loading = false, outline = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        outline && styles.outline,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={outline ? colors.rust : colors.paper} />
      ) : (
        <>
          <Text style={[styles.label, outline && styles.outlineLabel]}>{label}</Text>
          <Text style={[styles.arrow, outline && styles.outlineLabel]}>→</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 54, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.rust },
  outline: { borderWidth: 1, borderColor: colors.chocolate, backgroundColor: "transparent" },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
  label: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.25 },
  arrow: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 18 },
  outlineLabel: { color: colors.chocolate },
});
