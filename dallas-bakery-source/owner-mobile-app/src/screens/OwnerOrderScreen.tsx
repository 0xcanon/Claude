import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";

import { colors, fonts } from "../theme";
import type { OrderEvent, OwnerOrder } from "../types";

type Props = {
  order: OwnerOrder;
  reasons: string[];
  events: OrderEvent[];
  loadingHistory: boolean;
  busy: boolean;
  error: string;
  notice: string;
  onAct: (body: {
    action: "hold" | "release" | "cancel" | "refund" | "mark-delivered";
    reason?: string;
    amountCents?: number;
  }) => Promise<void>;
  onMarkInvoicePaid: () => Promise<void>;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function when(iso: string) {
  const at = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type Mode = "" | "hold" | "cancel" | "refund";

/**
 * One order, and everything that can be done to it.
 *
 * Which buttons appear is decided by the order's stage, but the server decides
 * again when the button is pressed — the app is a convenience, never the
 * authority. A refusal comes back as a sentence and is shown as-is.
 */
export function OwnerOrderScreen({
  order, reasons, events, loadingHistory, busy, error, notice, onAct, onMarkInvoicePaid,
}: Props) {
  const [mode, setMode] = useState<Mode>("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");

  const remaining = Math.max(0, order.totalCents - order.refundedCents);
  const canHold = order.status === "paid";
  const canRelease = order.status === "held";
  const canCancel = ["paid", "held", "labeled"].includes(order.status);
  const canRefund = order.paymentTerms === "card" && remaining > 0 && order.status !== "cancelled";
  const canDeliver = order.status === "shipped";

  useEffect(() => { setMode(""); setReason(""); setAmount(""); setNote(""); }, [order.id]);

  const confirmCancel = useCallback(() => {
    const back = order.paymentTerms !== "account" && remaining > 0
      ? `${money(remaining)} goes back to their card.`
      : "Nothing was charged — the amount returns to their credit line.";
    Alert.alert(`Cancel order #${order.orderNumber}?`, `Reason: ${reason}\n\n${back}`, [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel the order", style: "destructive", onPress: () => void onAct({ action: "cancel", reason }) },
    ]);
  }, [order, reason, remaining, onAct]);

  const confirmRefund = useCallback(() => {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    const cents = Math.round(dollars * 100);
    Alert.alert(
      `Send ${money(cents)} back?`,
      `To ${order.customerName || order.email} for order #${order.orderNumber}.\n\nReason: ${reason}\n\nThis cannot be undone.`,
      [
        { text: "Not now", style: "cancel" },
        { text: "Send it back", style: "destructive", onPress: () => void onAct({ action: "refund", amountCents: cents, reason }) },
      ],
    );
  }, [amount, order, reason, onAct]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.kicker}>ORDER #{order.orderNumber}</Text>
      <Text accessibilityRole="header" style={styles.title}>{order.customerName || order.email}</Text>
      <Text style={styles.placed}>Placed {when(order.createdAt)}</Text>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {order.cancelRequestedAt && order.status !== "cancelled" && (
        <View style={styles.flag}>
          <Text style={styles.flagText}>
            They asked to cancel this.{order.cancelReason ? ` "${order.cancelReason}"` : ""}
          </Text>
        </View>
      )}
      {order.status === "held" && (
        <View style={styles.flag}>
          <Text style={styles.flagText}>On hold{order.holdReason ? `: ${order.holdReason}` : ""}.</Text>
        </View>
      )}
      {order.refundedCents > 0 && (
        <View style={styles.flag}>
          <Text style={styles.flagText}>
            {money(order.refundedCents)} of {money(order.totalCents)} already refunded.
          </Text>
        </View>
      )}

      <Text style={styles.sectionKicker}>PACK THIS ORDER</Text>
      <View style={styles.card}>
        {order.items.map((item) => (
          <View key={item.sku} style={styles.line}>
            <Text style={styles.lineQty}>{item.quantity}×</Text>
            <Text style={styles.lineName}>{item.name}</Text>
            <Text style={styles.lineMoney}>{money(item.unitAmountCents * item.quantity)}</Text>
          </View>
        ))}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{money(order.subtotalCents)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Shipping · {order.boxCount} {order.boxCount === 1 ? "box" : "boxes"}</Text>
            <Text style={styles.totalValue}>{money(order.shippingCents)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grand]}>
            <Text style={styles.grandLabel}>
              {order.paymentTerms === "account"
                ? order.invoicePaidAt ? "Invoiced · paid" : `To invoice${order.invoiceDueAt ? ` · due ${order.invoiceDueAt}` : ""}`
                : "Charged"}
            </Text>
            <Text style={styles.grandValue}>{money(order.totalCents)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionKicker}>SHIP TO</Text>
      <View style={styles.card}>
        <Text style={styles.address}>
          {order.customerName}{"\n"}
          {[order.street, order.street2].filter(Boolean).join(", ")}{"\n"}
          {[order.city, order.state, order.zip].filter(Boolean).join(" ")}
        </Text>
        {order.phone ? (
          <Text onPress={() => void Linking.openURL(`tel:${order.phone.replace(/[^0-9+]/g, "")}`)} style={styles.link}>
            {order.phone}
          </Text>
        ) : null}
        {order.poNumber ? <Text style={styles.small}>Their PO {order.poNumber}</Text> : null}
        {order.requestedDeliveryDate ? (
          <Text style={styles.small}>Asked for delivery {order.requestedDeliveryDate}</Text>
        ) : null}
        {order.trackingNumber ? (
          <Text onPress={() => order.trackingUrl && void Linking.openURL(order.trackingUrl)} style={styles.link}>
            UPS {order.trackingNumber}
          </Text>
        ) : null}
      </View>

      {order.paymentTerms === "account" && !order.invoicePaidAt && order.status !== "cancelled" && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void onMarkInvoicePaid()}
          style={[styles.secondary, busy && styles.off]}
        >
          <Text style={styles.secondaryText}>MARK INVOICE PAID</Text>
        </Pressable>
      )}

      <Text style={styles.sectionKicker}>IF SOMETHING&apos;S WRONG</Text>
      <View style={styles.buttons}>
        {canHold && (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setMode(mode === "hold" ? "" : "hold")} style={styles.btn}>
            <Text style={styles.btnText}>Put on hold</Text>
          </Pressable>
        )}
        {canRelease && (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAct({ action: "release" })} style={styles.btn}>
            <Text style={styles.btnText}>Take off hold</Text>
          </Pressable>
        )}
        {canRefund && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => { setMode(mode === "refund" ? "" : "refund"); setAmount((remaining / 100).toFixed(2)); }}
            style={styles.btn}
          >
            <Text style={styles.btnText}>Send money back</Text>
          </Pressable>
        )}
        {canDeliver && (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void onAct({ action: "mark-delivered" })} style={styles.btn}>
            <Text style={styles.btnText}>Mark delivered</Text>
          </Pressable>
        )}
        {canCancel && (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setMode(mode === "cancel" ? "" : "cancel")} style={[styles.btn, styles.btnDanger]}>
            <Text style={[styles.btnText, styles.btnDangerText]}>Cancel the order</Text>
          </Pressable>
        )}
      </View>

      {mode === "hold" && (
        <View style={styles.form}>
          <Text style={styles.label}>Why is it on hold? The buyer sees this.</Text>
          <TextInput
            maxLength={200}
            onChangeText={setNote}
            placeholder="Waiting on rye flour — back Thursday"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={note}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy || !note.trim()}
            onPress={() => void onAct({ action: "hold", reason: note })}
            style={[styles.submit, (busy || !note.trim()) && styles.off]}
          >
            <Text style={styles.submitText}>{busy ? "HOLDING…" : "HOLD IT"}</Text>
          </Pressable>
        </View>
      )}

      {(mode === "cancel" || mode === "refund") && (
        <View style={styles.form}>
          <Text style={styles.label}>Why?</Text>
          <View style={styles.reasons}>
            {reasons.map((option) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === option }}
                key={option}
                onPress={() => setReason(option)}
                style={[styles.reason, reason === option && styles.reasonOn]}
              >
                <Text style={[styles.reasonText, reason === option && styles.reasonTextOn]}>{option}</Text>
              </Pressable>
            ))}
          </View>

          {mode === "refund" && (
            <>
              <Text style={styles.label}>How much? At most {money(remaining)} is left on this order.</Text>
              <TextInput
                inputMode="decimal"
                onChangeText={setAmount}
                style={styles.input}
                value={amount}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy || !reason}
                onPress={confirmRefund}
                style={[styles.submit, (busy || !reason) && styles.off]}
              >
                <Text style={styles.submitText}>{busy ? "SENDING…" : `SEND BACK $${amount || "0.00"}`}</Text>
              </Pressable>
            </>
          )}

          {mode === "cancel" && (
            <Pressable
              accessibilityRole="button"
              disabled={busy || !reason}
              onPress={confirmCancel}
              style={[styles.submit, styles.submitDanger, (busy || !reason) && styles.off]}
            >
              <Text style={styles.submitText}>{busy ? "CANCELLING…" : "CANCEL THIS ORDER"}</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.sectionKicker}>FULL HISTORY</Text>
      <Text style={styles.hint}>
        Every change to this order, with who made it. Never edited — this is what you send a card
        processor in a dispute.
      </Text>
      {loadingHistory ? (
        <ActivityIndicator color={colors.rust} style={styles.loading} />
      ) : events.length === 0 ? (
        <Text style={styles.hint}>Nothing recorded yet.</Text>
      ) : (
        <View style={styles.card}>
          {events.map((event) => (
            <View key={event.id} style={styles.event}>
              <Text style={styles.eventWhen}>{when(event.at)}</Text>
              <Text style={styles.eventWhat}>{event.summary}</Text>
              {event.detail ? <Text style={styles.eventDetail}>{event.detail}</Text> : null}
              <Text style={styles.eventWho}>
                {event.who}{event.buyerVisible ? "" : " · internal"}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 22, paddingBottom: 44 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.3 },
  title: { marginTop: 8, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 27, lineHeight: 32 },
  placed: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5 },
  notice: { marginTop: 14, padding: 11, color: "#33482F", backgroundColor: colors.sagePale, fontFamily: fonts.sans, fontSize: 11 },
  error: { marginTop: 14, padding: 11, color: "#7C2A1C", backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },
  flag: { marginTop: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.paper },
  flagText: { color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },

  sectionKicker: { marginTop: 26, marginBottom: 9, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.2, letterSpacing: 1.2 },
  card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  line: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  lineQty: { minWidth: 28, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 12 },
  lineName: { flex: 1, color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11.5 },
  lineMoney: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11.5 },
  totals: { padding: 13 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5 },
  totalValue: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 10.5 },
  grand: { marginTop: 7, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  grandLabel: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  grandValue: { color: colors.rust, fontFamily: fonts.serif, fontSize: 18 },

  address: { padding: 14, color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 18 },
  link: { paddingHorizontal: 14, paddingBottom: 10, color: colors.rust, fontFamily: fonts.sans, fontSize: 11.5, textDecorationLine: "underline" },
  small: { paddingHorizontal: 14, paddingBottom: 10, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5 },

  secondary: { marginTop: 14, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.sage },
  secondaryText: { color: "#3D5A2F", fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },

  buttons: { gap: 8 },
  btn: { minHeight: 48, paddingHorizontal: 15, justifyContent: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  btnText: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11.5 },
  btnDanger: { borderColor: colors.danger },
  btnDangerText: { color: colors.danger },

  form: { marginTop: 12, padding: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  label: { color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 15 },
  input: { marginTop: 7, minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontFamily: fonts.sans, fontSize: 12, backgroundColor: colors.white },
  reasons: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reason: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.line },
  reasonOn: { backgroundColor: colors.chocolate, borderColor: colors.chocolate },
  reasonText: { color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5 },
  reasonTextOn: { color: colors.cream },
  submit: { marginTop: 12, minHeight: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.chocolate },
  submitDanger: { backgroundColor: colors.danger },
  submitText: { color: colors.white, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  off: { opacity: 0.45 },

  hint: { color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 16, marginBottom: 9 },
  loading: { marginTop: 16 },
  event: { padding: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  eventWhen: { color: colors.muted, fontFamily: fonts.sans, fontSize: 9.6 },
  eventWhat: { marginTop: 4, color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16 },
  eventDetail: { marginTop: 3, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  eventWho: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 9.6 },
});
