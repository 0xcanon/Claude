import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandLockup } from "../components/BrandLockup";
import { OrderTracker } from "../components/OrderTracker";
import { caseLabel, formatDate, formatMoney } from "../lib/format";
import { colors, fonts } from "../theme";
import type { BuyerOrder } from "../types";

type Props = {
  onBack: () => void;
  onReorder: () => void;
  /** Opens the "tell us what went wrong" screen for this order. */
  onReportProblem: () => void;
  order: BuyerOrder;
};

/** One order in full: where it is, what is in it, and where it is going. */
export function OrderDetailScreen({ onBack, onReorder, onReportProblem, order }: Props) {
  const currency = order.total.currencyCode;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to orders" onPress={onBack}><Text style={styles.back}>‹</Text></Pressable>
        <BrandLockup compact />
        <View style={styles.headerSpace} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>ORDER {order.name}</Text>
        <Text style={styles.title}>{order.stageLabel}.</Text>
        <Text style={styles.placed}>
          Placed {formatDate(order.processedAt)}
          {order.shippedAt ? ` · Shipped ${formatDate(order.shippedAt)}` : ""}
        </Text>

        {order.holdReason ? (
          <View style={styles.notice}>
            <Text style={styles.noticeKicker}>ON HOLD</Text>
            <Text style={styles.noticeText}>{order.holdReason}</Text>
          </View>
        ) : null}
        {order.cancelRequested ? (
          <View style={styles.notice}>
            <Text style={styles.noticeKicker}>CANCELLATION ASKED FOR</Text>
            <Text style={styles.noticeText}>
              We&apos;ve got your request and we&apos;ll confirm today.
            </Text>
          </View>
        ) : null}
        {order.refunded && Number(order.refunded) > 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeKicker}>REFUNDED</Text>
            <Text style={styles.noticeText}>
              {formatMoney(order.refunded, currency)} has been sent back to you.
            </Text>
          </View>
        ) : null}

        <View style={styles.trackerCard}>
          <OrderTracker order={order} />
        </View>

        <Text style={styles.sectionLabel}>IN THIS ORDER</Text>
        <View style={styles.card}>
          {order.items.map((item) => (
            <View key={item.sku} style={styles.line}>
              <View style={styles.lineCopy}>
                <Text style={styles.lineTitle}>{item.name}</Text>
                <Text style={styles.lineDetail}>
                  {caseLabel(item.quantity)} × {formatMoney(item.unitAmountCents / 100, currency)}
                </Text>
              </View>
              <Text style={styles.lineTotal}>
                {formatMoney((item.unitAmountCents * item.quantity) / 100, currency)}
              </Text>
            </View>
          ))}

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal · {caseLabel(order.caseCount)}</Text>
              <Text style={styles.totalValue}>{formatMoney(order.subtotal, currency)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Shipping · {order.boxCount} {order.boxCount === 1 ? "box" : "boxes"}
              </Text>
              <Text style={styles.totalValue}>{formatMoney(order.shipping, currency)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandRow]}>
              <Text style={styles.grandLabel}>Total charged</Text>
              <Text style={styles.grandValue}>{formatMoney(order.total.amount, currency)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>DELIVERED TO</Text>
        <View style={styles.deliverCard}>
          <Text style={styles.deliverName}>{order.deliverTo.name}</Text>
          <Text style={styles.deliverAddress}>
            {[order.deliverTo.street, order.deliverTo.street2].filter(Boolean).join(", ")}
            {"\n"}
            {[order.deliverTo.city, order.deliverTo.state, order.deliverTo.zip].filter(Boolean).join(" ")}
          </Text>
          <Text style={styles.deliverNote}>{order.loafCount} loaves in {order.boxCount} {order.boxCount === 1 ? "box" : "boxes"} · UPS Ground</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onReorder}
          style={({ pressed }) => [styles.reorder, pressed && styles.pressed]}
        >
          <Text style={styles.reorderText}>ORDER THESE CASES AGAIN</Text>
          <Text style={styles.reorderArrow}>→</Text>
        </Pressable>

        <Pressable
          accessibilityHint={`Tell the bakery about a problem with order ${order.name}`}
          accessibilityRole="button"
          onPress={onReportProblem}
          style={({ pressed }) => [styles.problem, pressed && styles.pressed]}
        >
          <Text style={styles.problemText}>
            {order.canRequestCancellation ? "NEED TO CANCEL, OR SOMETHING WRONG?" : "SOMETHING WRONG WITH THIS ORDER?"}
          </Text>
          <Text style={styles.problemArrow}>→</Text>
        </Pressable>

        <Text
          onPress={() => void Linking.openURL(`mailto:sales@dallasbakery.com?subject=Order%20${encodeURIComponent(order.name)}`)}
          style={styles.help}
        >
          Or write to us: sales@dallasbakery.com
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: { minHeight: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper },
  back: { width: 44, color: colors.rust, fontSize: 35 },
  headerSpace: { width: 44 },
  content: { padding: 18, paddingTop: 26, paddingBottom: 40 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 1.2 },
  title: { marginTop: 9, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 36 },
  placed: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  trackerCard: { marginTop: 20, padding: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  sectionLabel: { marginTop: 26, marginBottom: 11, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1 },
  card: { padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  line: { minHeight: 52, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  lineCopy: { flex: 1 },
  lineTitle: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  lineDetail: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 9 },
  lineTotal: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  totals: { paddingTop: 12 },
  totalRow: { paddingVertical: 5, flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  totalValue: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 10 },
  grandRow: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  grandLabel: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  grandValue: { color: colors.rust, fontFamily: fonts.serif, fontWeight: "700", fontSize: 20 },
  deliverCard: { padding: 15, borderLeftWidth: 3, borderLeftColor: colors.sage, backgroundColor: colors.paper },
  deliverName: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12 },
  deliverAddress: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  deliverNote: { marginTop: 9, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 0.5 },
  reorder: { marginTop: 26, minHeight: 54, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.chocolate },
  pressed: { opacity: 0.75 },
  reorderText: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.2 },
  reorderArrow: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 18 },
  notice: { marginTop: 16, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.paper },
  noticeKicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8.8, letterSpacing: 1 },
  noticeText: { marginTop: 6, color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  problem: { marginTop: 12, minHeight: 54, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  problemText: { flex: 1, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.2 },
  problemArrow: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 18 },
  help: { marginTop: 20, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, textAlign: "center", textDecorationLine: "underline" },
});
