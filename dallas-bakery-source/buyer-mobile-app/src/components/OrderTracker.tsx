import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";
import type { BuyerOrder } from "../types";

type Props = { order: BuyerOrder; compact?: boolean };

const STEPS = [
  { step: 1, label: "BAKING" },
  { step: 2, label: "PACKED" },
  { step: 3, label: "SHIPPED" },
] as const;

/**
 * Where an order is, as three filled steps, plus the tracking number once UPS
 * can actually show it. The bar is deliberately the same on the orders list
 * and the order detail so a buyer reads it the same way in both places.
 */
export function OrderTracker({ order, compact = false }: Props) {
  // A refunded order has no journey to draw — nothing bakes and nothing
  // ships — so the tracker gives way to a plain statement.
  if (order.stage === "refunded") {
    return (
      <View style={styles.refunded}>
        <Text style={styles.refundedTitle}>Refunded in full</Text>
        <Text style={styles.refundedText}>{order.stageDetail}</Text>
      </View>
    );
  }
  return (
    <View>
      <View style={styles.track}>
        {STEPS.map((entry, index) => {
          const done = order.stageStep >= entry.step;
          const current = order.stageStep === entry.step;
          return (
            <View key={entry.step} style={styles.segment}>
              <View style={styles.railRow}>
                <View style={[styles.rail, index === 0 && styles.railHidden, done && styles.railDone]} />
                <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]}>
                  {done && <Text style={styles.dotMark}>{current ? "" : "✓"}</Text>}
                </View>
                <View style={[
                  styles.rail,
                  index === STEPS.length - 1 && styles.railHidden,
                  order.stageStep > entry.step && styles.railDone,
                ]} />
              </View>
              <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{entry.label}</Text>
            </View>
          );
        })}
      </View>

      {!compact && <Text style={styles.detail}>{order.stageDetail}</Text>}

      {order.trackable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Track shipment ${order.trackingNumber}`}
          onPress={() => void Linking.openURL(order.trackingUrl)}
          style={({ pressed }) => [styles.trackButton, pressed && styles.pressed]}
        >
          <View style={styles.trackCopy}>
            <Text style={styles.trackLabel}>TRACK SHIPMENT · UPS</Text>
            <Text style={styles.trackNumber}>{order.trackingNumber}</Text>
          </View>
          <Text style={styles.trackArrow}>→</Text>
        </Pressable>
      ) : (
        <View style={styles.pendingTrack}>
          <Text style={styles.pendingText}>
            {order.stage === "shipped"
              ? "Tracking number is on its way by email."
              : "A tracking number appears here the moment UPS collects your boxes."}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", marginTop: 4 },
  segment: { flex: 1, alignItems: "center" },
  railRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  rail: { flex: 1, height: 2, backgroundColor: colors.line },
  railHidden: { backgroundColor: "transparent" },
  railDone: { backgroundColor: colors.sage },
  dot: { width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.paper },
  dotDone: { borderColor: colors.sage, backgroundColor: colors.sage },
  dotCurrent: { borderColor: colors.rust, backgroundColor: colors.rust },
  dotMark: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 9 },
  stepLabel: { marginTop: 7, color: "#A2958C", fontFamily: fonts.sansMedium, fontSize: 6.5, letterSpacing: 0.7 },
  stepLabelDone: { color: colors.chocolate },
  detail: { marginTop: 12, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  trackButton: { marginTop: 13, minHeight: 52, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.chocolate, backgroundColor: colors.paper },
  pressed: { opacity: 0.72 },
  trackCopy: { flex: 1 },
  trackLabel: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  trackNumber: { marginTop: 4, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11.5, letterSpacing: 0.4 },
  trackArrow: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 17 },
  pendingTrack: { marginTop: 13, padding: 12, borderLeftWidth: 2, borderLeftColor: colors.line, backgroundColor: colors.paper },
  pendingText: { color: colors.muted, fontFamily: fonts.sans, fontSize: 9.5, lineHeight: 15 },
  refunded: { padding: 12, borderLeftWidth: 2, borderLeftColor: colors.danger, backgroundColor: colors.rosePale },
  refundedTitle: { color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 10.5 },
  refundedText: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 9.5, lineHeight: 14 },
});
