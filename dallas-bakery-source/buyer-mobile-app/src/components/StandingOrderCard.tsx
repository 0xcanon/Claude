import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { caseLabel, formatMoney } from "../lib/format";
import type { StandingOrderInfo } from "../lib/storefront";
import { colors, fonts } from "../theme";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type Props = {
  busy: boolean;
  /** Cases currently in the cart — what "make it weekly" would repeat. */
  cartCases: number;
  notice: string;
  onPause: () => void;
  onSave: (weekday: number) => void;
  onSelectWeekday: (weekday: number) => void;
  standingOrder: StandingOrderInfo | null;
  weekday: number;
};

/**
 * The standing weekly order, shown under the cart. Mirrors the website's
 * card exactly: an active order shows its day, size, and price with a pause
 * action; otherwise a cart can be made weekly with one tap on a day.
 */
export function StandingOrderCard({
  busy,
  cartCases,
  notice,
  onPause,
  onSave,
  onSelectWeekday,
  standingOrder,
  weekday,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>STANDING WEEKLY ORDER</Text>

      {standingOrder?.active ? (
        <>
          <Text style={styles.activeLine}>
            Every <Text style={styles.activeDay}>{standingOrder.weekdayName}</Text>
            {standingOrder.summary
              ? ` · ${caseLabel(standingOrder.summary.caseCount)} · ${formatMoney(standingOrder.summary.totalCents / 100, "USD")}`
              : ""}
          </Text>
          <Text style={styles.detail}>
            Charged to your saved card each week and confirmed by email.
          </Text>
          {standingOrder.lastRunStatus.startsWith("failed") && (
            <Text style={styles.problem}>Last run needs attention — check your email.</Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onPause}
            style={({ pressed }) => [styles.pause, pressed && styles.pressed, busy && styles.disabled]}
          >
            {busy ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.pauseText}>PAUSE STANDING ORDER</Text>}
          </Pressable>
        </>
      ) : cartCases > 0 ? (
        <>
          <Text style={styles.detail}>
            Get {caseLabel(cartCases)} automatically every week — pay by card once, and the saved card covers the rest.
          </Text>
          <View style={styles.days}>
            {WEEKDAYS.map((day, index) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: weekday === index }}
                key={day}
                onPress={() => onSelectWeekday(index)}
                style={[styles.day, weekday === index && styles.dayActive]}
              >
                <Text style={[styles.dayText, weekday === index && styles.dayTextActive]}>{day}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onSave(weekday)}
            style={({ pressed }) => [styles.save, pressed && styles.pressed, busy && styles.disabled]}
          >
            {busy ? <ActivityIndicator color={colors.paper} /> : <Text style={styles.saveText}>MAKE IT WEEKLY</Text>}
          </Pressable>
        </>
      ) : (
        <Text style={styles.detail}>Add cases to the cart, then make them your automatic weekly order.</Text>
      )}

      {!!notice && <Text style={styles.notice}>{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14, padding: 15, borderWidth: 1, borderStyle: "dashed", borderColor: colors.line, backgroundColor: colors.paper },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  activeLine: { marginTop: 9, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12 },
  activeDay: { color: colors.rust },
  detail: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  problem: { marginTop: 8, padding: 9, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 9.5 },
  days: { marginTop: 12, flexDirection: "row", gap: 6 },
  day: { flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  dayActive: { borderColor: colors.chocolate, backgroundColor: colors.chocolate },
  dayText: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 8.5 },
  dayTextActive: { color: colors.paper },
  save: { marginTop: 12, minHeight: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.chocolate },
  saveText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 8.5, letterSpacing: 1.1 },
  pause: { marginTop: 12, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.danger },
  pauseText: { color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.55 },
  notice: { marginTop: 10, color: colors.sage, fontFamily: fonts.sans, fontSize: 9.5 },
});
