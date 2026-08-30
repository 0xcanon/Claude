import { ActivityIndicator, Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "../components/PrimaryButton";
import { caseLabel, formatDate } from "../lib/format";
import type { ConfirmedOrder } from "../lib/storefront";
import { colors, fonts } from "../theme";

type Props = {
  cutoffLabel: string;
  onDone: () => void;
  onViewOrders: () => void;
  order: ConfirmedOrder | null;
  /** True while the webhook's order row is still being waited for. */
  settling: boolean;
};

/**
 * Shown once the card has cleared.
 *
 * The order row is written by Stripe's webhook, which can land a moment after
 * the sheet closes. Until it does this says the payment is confirmed and the
 * order is being recorded — never that anything failed, which would be untrue
 * and would invite a second payment.
 */
export function OrderSuccessScreen({ cutoffLabel, onDone, onViewOrders, order, settling }: Props) {
  // Account orders were invoiced against the buyer's credit line — no card
  // was charged, and the wording must never imply one was.
  const onAccount = order?.paymentTerms === "account";
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.mark}><Text style={styles.markText}>✓</Text></View>

        <Text style={styles.kicker}>{onAccount ? "ORDER PLACED ON ACCOUNT" : "PAYMENT RECEIVED"}</Text>
        <Text style={styles.title}>
          {order ? `Order ${order.name}\nis in.` : "Your payment\nwent through."}
        </Text>
        <Text style={styles.description}>
          {order
            ? onAccount
              ? `Placed on your credit account — nothing was charged to a card; we'll invoice you${order.termsLabel && order.invoiceDueAt ? ` on ${order.termsLabel} terms, due by ${order.invoiceDueAt}` : ""}. We emailed a confirmation.${cutoffLabel ? ` ${cutoffLabel}` : ""}`
              : `We emailed your receipt.${cutoffLabel ? ` ${cutoffLabel}` : ""}`
            : settling
              ? "Your card was charged and we have your order. The order number will appear in your history in a moment."
              : "Your card was charged. Recording your order…"}
        </Text>

        {order ? (
          <>
            <View style={styles.summary}>
              {order.items.map((item) => (
                <View key={item.sku} style={styles.line}>
                  <Text style={styles.lineTitle}>{item.name}</Text>
                  <Text style={styles.lineDetail}>{caseLabel(item.quantity)}</Text>
                </View>
              ))}
              <View style={styles.totals}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>${order.subtotal}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    Shipping · {order.boxCount} {order.boxCount === 1 ? "box" : "boxes"}
                  </Text>
                  <Text style={styles.totalValue}>${order.shipping}</Text>
                </View>
                <View style={[styles.totalRow, styles.grandRow]}>
                  <Text style={styles.grandLabel}>{onAccount ? "Total on account" : "Total charged"}</Text>
                  <Text style={styles.grandValue}>${order.total}</Text>
                </View>
              </View>
            </View>

            <View style={styles.deliverCard}>
              <Text style={styles.deliverKicker}>SHIPPING TO</Text>
              <Text style={styles.deliverName}>{order.deliverTo.name}</Text>
              <Text style={styles.deliverAddress}>
                {[order.deliverTo.street, order.deliverTo.street2].filter(Boolean).join(", ")}
                {"\n"}
                {[order.deliverTo.city, order.deliverTo.state, order.deliverTo.zip].filter(Boolean).join(" ")}
              </Text>
              <Text style={styles.placed}>Placed {formatDate(order.placedAt)}</Text>
            </View>

            <Text style={styles.sectionLabel}>WHAT HAPPENS NEXT</Text>
            <View style={styles.steps}>
              <Step number="1" text={`We bake and pack ${caseLabel(order.caseCount)} into ${order.boxCount} ${order.boxCount === 1 ? "box" : "boxes"}.`} />
              <Step number="2" text="UPS Ground collects them and we email your tracking number." />
              <Step number="3" text="Delivery is 1–4 business days. The bread keeps 14 days." last />
            </View>
          </>
        ) : (
          <View style={styles.settling}>
            <ActivityIndicator color={colors.rust} />
            <Text style={styles.settlingText}>
              You can leave this screen — nothing is lost. The order appears under Orders.
            </Text>
          </View>
        )}

        <PrimaryButton label="VIEW MY ORDERS" onPress={onViewOrders} />
        <View style={styles.spacer} />
        <PrimaryButton label="BACK TO CATALOG" onPress={onDone} outline />

        <Text
          onPress={() => void Linking.openURL("mailto:sales@dallasbakery.com")}
          style={styles.help}
        >
          Questions about this order? sales@dallasbakery.com
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ number, text, last = false }: { number: string; text: string; last?: boolean }) {
  return (
    <View style={[styles.step, last && styles.stepLast]}>
      <View style={styles.stepDot}><Text style={styles.stepNumber}>{number}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 18, paddingTop: 40, paddingBottom: 40 },
  mark: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 27, backgroundColor: colors.sagePale },
  markText: { color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 24 },
  kicker: { marginTop: 22, color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 1.3 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 38, lineHeight: 41 },
  description: { marginTop: 11, marginBottom: 22, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 18 },
  summary: { padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  line: { minHeight: 40, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  lineTitle: { flex: 1, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  lineDetail: { color: colors.muted, fontFamily: fonts.sans, fontSize: 9 },
  totals: { paddingTop: 12 },
  totalRow: { paddingVertical: 5, flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  totalValue: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 10 },
  grandRow: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  grandLabel: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  grandValue: { color: colors.rust, fontFamily: fonts.serif, fontWeight: "700", fontSize: 20 },
  deliverCard: { marginTop: 14, padding: 15, borderLeftWidth: 3, borderLeftColor: colors.sage, backgroundColor: colors.paper },
  deliverKicker: { color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1 },
  deliverName: { marginTop: 7, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12 },
  deliverAddress: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  placed: { marginTop: 8, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 0.5 },
  sectionLabel: { marginTop: 24, marginBottom: 12, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1 },
  steps: { marginBottom: 22 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingBottom: 14, marginBottom: 2 },
  stepLast: { paddingBottom: 4 },
  stepDot: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.chocolate },
  stepNumber: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 9 },
  stepText: { flex: 1, marginTop: 3, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  settling: { paddingVertical: 26, alignItems: "center", gap: 14 },
  settlingText: { maxWidth: 280, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16, textAlign: "center" },
  spacer: { height: 9 },
  help: { marginTop: 24, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, textAlign: "center", textDecorationLine: "underline" },
});
