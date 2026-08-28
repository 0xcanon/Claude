import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { BottomNav } from "../components/BottomNav";
import { OrderTracker } from "../components/OrderTracker";
import { PrimaryButton } from "../components/PrimaryButton";
import { caseLabel, formatDate, formatMoney } from "../lib/format";
import { colors, fonts, shadow } from "../theme";
import type { BuyerOrder, MainTab } from "../types";

type Props = {
  cartCount: number;
  onCart: () => void;
  onOpenOrder: (order: BuyerOrder) => void;
  onStartOrder: () => void;
  onTab: (tab: MainTab) => void;
  orders: BuyerOrder[];
  userInitials: string;
};

export function OrdersScreen({
  cartCount,
  onCart,
  onOpenOrder,
  onStartOrder,
  onTab,
  orders,
  userInitials,
}: Props) {
  const inTransit = orders.filter((order) => order.stage !== "shipped" && order.stage !== "refunded").length;

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader cartCount={cartCount} initials={userInitials} onCart={onCart} onProfile={() => onTab("account")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>BUSINESS ORDER HISTORY</Text>
        <Text style={styles.title}>Your orders</Text>
        <Text style={styles.description}>
          {orders.length
            ? inTransit
              ? `${inTransit} ${inTransit === 1 ? "order is" : "orders are"} on the way. Track any shipment below.`
              : "Every order, its boxes, and its tracking stay attached to your approved account."
            : "Payment, fulfillment, and tracking stay attached to your approved account."}
        </Text>

        {orders.length ? (
          <View style={styles.list}>
            {orders.map((order) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Order ${order.name}, ${order.stageLabel}`}
                key={order.id}
                onPress={() => onOpenOrder(order)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.topRow}>
                  <View>
                    <Text style={styles.orderName}>{order.name}</Text>
                    <Text style={styles.date}>{formatDate(order.processedAt)}</Text>
                  </View>
                  <View style={styles.amountBlock}>
                    <Text style={styles.amount}>
                      {formatMoney(order.total.amount, order.total.currencyCode)}
                    </Text>
                    <Text style={[styles.pill, stagePill(order.stage)]}>{order.stageLabel.toUpperCase()}</Text>
                    {order.paymentTerms === "account" && (
                      <Text style={order.invoicePaid ? styles.termsSettled : styles.termsOpen}>
                        {order.invoicePaid ? "INVOICE PAID" : "ON ACCOUNT"}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.meta}>{caseLabel(order.caseCount)}</Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.meta}>
                    {order.boxCount} {order.boxCount === 1 ? "box" : "boxes"}
                  </Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.meta}>{order.loafCount} loaves</Text>
                </View>

                <View style={styles.divider} />
                <OrderTracker order={order} />

                <Text style={styles.openHint}>VIEW ORDER DETAILS  →</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyMark}>◻</Text>
            <Text style={styles.emptyTitle}>No orders yet.</Text>
            <Text style={styles.emptyText}>
              Your first wholesale order appears here with its boxes and UPS tracking.
            </Text>
            <PrimaryButton label="START AN ORDER" onPress={onStartOrder} />
          </View>
        )}
      </ScrollView>
      <BottomNav active="orders" cartCount={cartCount} onSelect={onTab} />
    </SafeAreaView>
  );
}

function stagePill(stage: BuyerOrder["stage"]) {
  if (stage === "shipped") return styles.pillShipped;
  if (stage === "labeled") return styles.pillPacked;
  if (stage === "refunded") return styles.pillRefunded;
  return styles.pillBaking;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 18, paddingTop: 28, paddingBottom: 38 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7.5, letterSpacing: 1.2 },
  title: { marginTop: 9, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 37 },
  description: { marginTop: 9, marginBottom: 22, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 17 },
  list: { gap: 13 },
  card: { padding: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, ...shadow },
  cardPressed: { opacity: 0.9 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  orderName: { color: colors.chocolate, fontFamily: fonts.serif, fontWeight: "700", fontSize: 19 },
  date: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 9 },
  amountBlock: { alignItems: "flex-end", gap: 6 },
  amount: { color: colors.rust, fontFamily: fonts.serif, fontWeight: "700", fontSize: 19 },
  pill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10, overflow: "hidden", fontFamily: fonts.sansMedium, fontSize: 6.5, letterSpacing: 0.7 },
  pillBaking: { color: "#8A5716", backgroundColor: colors.goldPale },
  pillPacked: { color: colors.chocolate, backgroundColor: "#E7DCCB" },
  pillShipped: { color: colors.sage, backgroundColor: colors.sagePale },
  pillRefunded: { color: colors.danger, backgroundColor: colors.rosePale },
  termsOpen: { marginTop: 4, color: "#8A5716", fontFamily: fonts.sansMedium, fontSize: 6.5, letterSpacing: 0.7 },
  termsSettled: { marginTop: 4, color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 6.5, letterSpacing: 0.7 },
  metaRow: { marginTop: 11, flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 8.5 },
  metaDot: { color: colors.line, fontFamily: fonts.sansMedium, fontSize: 8.5 },
  divider: { height: 1, marginTop: 14, marginBottom: 14, backgroundColor: colors.line },
  openHint: { marginTop: 14, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7.5, letterSpacing: 0.9 },
  empty: { padding: 26, alignItems: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  emptyMark: { color: colors.line, fontSize: 34 },
  emptyTitle: { marginTop: 14, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 23 },
  emptyText: { marginTop: 9, marginBottom: 20, maxWidth: 260, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 16, textAlign: "center" },
});
