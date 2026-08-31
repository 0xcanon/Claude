import { useMemo, useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";

import { colors, fonts } from "../theme";
import type { OwnerOrder } from "../types";

type Scope = "unshipped" | "today" | "all";

type Props = {
  orders: OwnerOrder[];
  scope: Scope;
  loading: boolean;
  error: string;
  busy: string;
  notice: string;
  onScope: (scope: Scope) => void;
  onRefresh: () => Promise<void>;
  onOpenOrder: (order: OwnerOrder) => void;
  onCreateLabels: (ids: string[]) => Promise<void>;
  onMarkShipped: (ids: string[]) => Promise<void>;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The same words the buyer sees, so the two never disagree. */
function statusLabel(status: string) {
  if (status === "shipped") return "Shipped";
  if (status === "delivered") return "Delivered";
  if (status === "labeled") return "Packed · labeled";
  if (status === "refunded") return "Refunded";
  if (status === "cancelled") return "Cancelled";
  if (status === "held") return "On hold";
  return "Baking";
}

/**
 * The shipping queue.
 *
 * Selection drives the two batch actions, and only orders that are actually
 * going out can be selected — you cannot buy a label for a cancelled order by
 * tapping select-all, which is the mistake this screen exists to prevent.
 */
export function OrdersScreen({
  orders, scope, loading, error, busy, notice,
  onScope, onRefresh, onOpenOrder, onCreateLabels, onMarkShipped,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectable = useMemo(
    () => orders.filter((o) => o.status === "paid" || o.status === "labeled"),
    [orders],
  );
  const chosen = [...selected].filter((id) => selectable.some((o) => o.id === id));
  const allOn = selectable.length > 0 && selectable.every((o) => selected.has(o.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: (ids: string[]) => Promise<void>) {
    await action(chosen);
    setSelected(new Set());
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.filters}>
        {(["unshipped", "today", "all"] as const).map((option) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: scope === option }}
            key={option}
            onPress={() => { onScope(option); setSelected(new Set()); }}
            style={[styles.filter, scope === option && styles.filterOn]}
          >
            <Text style={[styles.filterText, scope === option && styles.filterTextOn]}>
              {option === "unshipped" ? "NEEDS SHIPPING" : option === "today" ? "TODAY" : "ALL"}
            </Text>
          </Pressable>
        ))}
      </View>

      {chosen.length > 0 && (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() => void run(onCreateLabels)}
            style={[styles.action, styles.actionPrimary, busy ? styles.actionOff : null]}
          >
            <Text style={styles.actionPrimaryText}>
              {busy === "labels" ? "BUYING…" : `BUY ${chosen.length} LABEL${chosen.length === 1 ? "" : "S"}`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busy)}
            onPress={() => void run(onMarkShipped)}
            style={[styles.action, busy ? styles.actionOff : null]}
          >
            <Text style={styles.actionText}>{busy === "shipped" ? "SENDING…" : "MARK SHIPPED"}</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void onRefresh()} tintColor={colors.rust} />}
        showsVerticalScrollIndicator={false}
      >
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {selectable.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected(allOn ? new Set() : new Set(selectable.map((o) => o.id)))}
            style={styles.selectAll}
          >
            <Text style={styles.selectAllText}>
              {allOn ? "CLEAR SELECTION" : `SELECT ALL ${selectable.length} GOING OUT`}
            </Text>
          </Pressable>
        )}

        {loading && orders.length === 0 ? <ActivityIndicator color={colors.rust} style={styles.loading} /> : null}
        {!loading && orders.length === 0 ? (
          <Text style={styles.empty}>Nothing here. Try a wider filter.</Text>
        ) : null}

        {orders.map((order) => {
          const canPick = order.status === "paid" || order.status === "labeled";
          const on = selected.has(order.id);
          return (
            <View key={order.id} style={[styles.row, on && styles.rowOn]}>
              <Pressable
                accessibilityLabel={`Select order ${order.orderNumber}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !canPick }}
                disabled={!canPick}
                onPress={() => toggle(order.id)}
                style={styles.check}
              >
                <View style={[styles.box, on && styles.boxOn, !canPick && styles.boxOff]}>
                  {on && <Text style={styles.tick}>✓</Text>}
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenOrder(order)}
                style={styles.rowBody}
              >
                <View style={styles.rowHead}>
                  <Text style={styles.number}>#{order.orderNumber}</Text>
                  <Text style={[styles.status, styles[`s_${order.status}` as "s_paid"]]}>
                    {statusLabel(order.status).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.customer}>{order.customerName || order.email}</Text>
                <Text style={styles.meta}>
                  {order.caseCount} {order.caseCount === 1 ? "case" : "cases"} · {order.boxCount}{" "}
                  {order.boxCount === 1 ? "box" : "boxes"} · {money(order.totalCents)}
                  {order.paymentTerms === "account" ? " · on account" : ""}
                </Text>
                {order.cancelRequestedAt && order.status !== "cancelled" && (
                  <Text style={styles.asked}>They asked to cancel this</Text>
                )}
                {order.holdReason && order.status === "held" && (
                  <Text style={styles.asked}>On hold: {order.holdReason}</Text>
                )}
                {order.labelError ? <Text style={styles.rowError}>{order.labelError}</Text> : null}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cream },
  filters: { flexDirection: "row", gap: 7, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.cream },
  filter: { minHeight: 34, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  filterOn: { backgroundColor: colors.chocolate, borderColor: colors.chocolate },
  filterText: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 8.8, letterSpacing: 0.9 },
  filterTextOn: { color: colors.cream },

  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  action: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.chocolate },
  actionPrimary: { backgroundColor: colors.rust, borderColor: colors.rust },
  actionOff: { opacity: 0.5 },
  actionText: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  actionPrimaryText: { color: colors.white, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },

  content: { paddingHorizontal: 16, paddingBottom: 34 },
  notice: { marginBottom: 10, padding: 11, color: "#33482F", backgroundColor: colors.sagePale, fontFamily: fonts.sans, fontSize: 11 },
  error: { marginBottom: 10, padding: 11, color: "#7C2A1C", backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 11 },
  selectAll: { paddingVertical: 9 },
  selectAllText: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 0.9 },
  loading: { marginTop: 30 },
  empty: { marginTop: 28, color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5, textAlign: "center" },

  row: { flexDirection: "row", marginBottom: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  rowOn: { borderColor: colors.rust },
  check: { width: 46, alignItems: "center", paddingTop: 16 },
  box: { width: 20, height: 20, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.rust, borderColor: colors.rust },
  boxOff: { opacity: 0.3 },
  tick: { color: colors.white, fontSize: 12, lineHeight: 14 },
  rowBody: { flex: 1, paddingRight: 15, paddingVertical: 14 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  number: { color: colors.chocolate, fontFamily: fonts.serif, fontSize: 17 },
  status: { fontFamily: fonts.sansMedium, fontSize: 8.4, letterSpacing: 0.9 },
  s_paid: { color: colors.gold },
  s_held: { color: "#8A5716" },
  s_labeled: { color: colors.muted },
  s_shipped: { color: colors.sage },
  s_delivered: { color: colors.sage },
  s_cancelled: { color: colors.muted },
  s_refunded: { color: colors.danger },
  customer: { marginTop: 5, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12 },
  meta: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5 },
  asked: { marginTop: 6, color: "#8A5716", fontFamily: fonts.sansMedium, fontSize: 10 },
  rowError: { marginTop: 6, color: colors.danger, fontFamily: fonts.sans, fontSize: 10 },
});
