import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandLockup } from "../components/BrandLockup";
import { PrimaryButton } from "../components/PrimaryButton";
import { caseLabel, formatMoney, loafLabel } from "../lib/format";
import type { CreditState, OrderSummary, PaymentStart } from "../lib/storefront";
import { colors, fonts } from "../theme";

type Props = {
  error: string;
  onBack: () => void;
  onPay: () => void;
  paying: boolean;
  payment: PaymentStart | null;
  /** The buyer's credit position; absent or disabled means card-only. */
  credit?: CreditState | null;
  onOrderOnAccount?: () => void;
  placingOnAccount?: boolean;
};

function money(cents: number) {
  return formatMoney(cents / 100, "USD");
}

/**
 * The last screen before the card sheet. Everything shown here is the server's
 * own pricing, returned with the payment — so what the buyer approves is
 * exactly what the card is charged.
 */
export function PaymentScreen({ error, onBack, onPay, paying, payment, credit, onOrderOnAccount, placingOnAccount }: Props) {
  if (!payment) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to cart" onPress={onBack}><Text style={styles.back}>‹</Text></Pressable>
          <BrandLockup compact light />
          <Text style={styles.secure}>SECURE PAYMENT</Text>
        </View>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.rust} size="large" />
          <Text style={styles.loadingText}>Preparing your Dallas Bakery checkout…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const summary: OrderSummary = payment.summary;
  const deliverTo = payment.deliverTo;
  // A buyer on net terms defaults to their account — the card sheet only
  // opens if they choose it, if the order is over their available credit,
  // or if a past-due balance has locked the account to card.
  const overdueCents = credit?.overdueCents ?? 0;
  const accountFirst = Boolean(credit?.enabled && onOrderOnAccount)
    && overdueCents === 0
    && summary.totalCents <= (credit?.availableCents ?? 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to cart" onPress={onBack}><Text style={styles.back}>‹</Text></Pressable>
        <BrandLockup compact light />
        <Text style={styles.secure}>SECURE PAYMENT</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>DALLAS BAKERY · SECURE CHECKOUT</Text>
        <Text style={styles.title}>Complete your{`\n`}order.</Text>
        <Text style={styles.description}>
          {accountFirst
            ? "This order goes on your credit account — no card needed; we'll invoice you. Prefer to pay now? The card option is below."
            : "You are paying Dallas Bakery directly. Your card is encrypted on this device — we never see or store the number."}
        </Text>

        <View style={styles.summary}>
          {summary.lines.map((line) => (
            <View key={line.sku} style={styles.line}>
              <View style={styles.lineCopy}>
                <Text style={styles.lineTitle}>{line.title}</Text>
                <Text style={styles.lineDetail}>
                  {caseLabel(line.cases)} × {money(line.unitAmountCents)} · {loafLabel(line.loaves)}
                </Text>
              </View>
              <Text style={styles.lineTotal}>{money(line.lineTotalCents)}</Text>
            </View>
          ))}

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal · {caseLabel(summary.caseCount)}</Text>
              <Text style={styles.totalValue}>{money(summary.subtotalCents)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Shipping · {summary.boxCount} {summary.boxCount === 1 ? "box" : "boxes"}
              </Text>
              <Text style={styles.totalValue}>{money(summary.shippingCents)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandRow]}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandValue}>{money(summary.totalCents)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.deliverCard}>
          <Text style={styles.deliverKicker}>DELIVERING TO</Text>
          <Text style={styles.deliverName}>{deliverTo.businessName}</Text>
          <Text style={styles.deliverAddress}>
            {[deliverTo.street, deliverTo.street2].filter(Boolean).join(", ")}
            {"\n"}
            {[deliverTo.city, deliverTo.state, deliverTo.zip].filter(Boolean).join(" ")}
          </Text>
          <Text style={styles.deliverNote}>
            Wholesale ships only to your approved storefront, so this address cannot be changed here.
          </Text>
        </View>

        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

        {accountFirst && credit && onOrderOnAccount ? (
          <>
            <PrimaryButton
              label="PLACE ORDER ON ACCOUNT"
              loading={placingOnAccount}
              onPress={onOrderOnAccount}
            />
            <Text style={styles.accountFirstHint}>
              {money(credit.availableCents)} of your {money(credit.limitCents)} available on your Net {credit.termsDays || 15} account · invoiced, not charged
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={paying || placingOnAccount}
              onPress={onPay}
              style={({ pressed }) => [styles.accountButton, (pressed || paying) && styles.accountButtonPressed]}
            >
              {paying ? (
                <ActivityIndicator color={colors.chocolate} size="small" />
              ) : (
                <Text style={styles.accountButtonText}>PAY {money(summary.totalCents)} BY CARD INSTEAD</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <PrimaryButton
              label={`PAY ${money(summary.totalCents)}`}
              loading={paying}
              onPress={onPay}
            />
            {credit?.enabled && onOrderOnAccount && overdueCents > 0 ? (
              <Text style={styles.accountShort}>
                Your Net {credit.termsDays || 15} balance is past due ({money(overdueCents)} overdue) — pay this order by card. Your account reopens once the past-due balance is settled.
              </Text>
            ) : credit?.enabled && onOrderOnAccount && summary.totalCents > credit.availableCents ? (
              <Text style={styles.accountShort}>
                {credit.outstandingCents > 0
                  ? `This order is over your available credit (${money(credit.availableCents)} left). Pay your open invoice balance (${money(credit.outstandingCents)}) to free up credit, or pay this order by card.`
                  : `This order is over your ${money(credit.limitCents)} net limit, so it needs a card — or place a smaller order on account.`}
              </Text>
            ) : null}
          </>
        )}
        <Text style={styles.note}>
          🔒  Encrypted end to end. You can close the card sheet at any time without being charged.
          {`\n`}Questions? sales@dallasbakery.com · (469) 729-4706
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: { minHeight: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.chocolate },
  back: { width: 38, color: colors.gold, fontSize: 35 },
  secure: { width: 76, color: "#BEAEA3", fontFamily: fonts.sansMedium, fontSize: 6, letterSpacing: 0.6, textAlign: "right" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11 },
  content: { padding: 18, paddingTop: 26, paddingBottom: 40 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1.3 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 36 },
  description: { marginTop: 9, marginBottom: 20, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  summary: { padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  line: { minHeight: 56, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
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
  deliverCard: { marginTop: 14, marginBottom: 16, padding: 15, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.paper },
  deliverKicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  deliverName: { marginTop: 7, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12 },
  deliverAddress: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  deliverNote: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 8.5, lineHeight: 13 },
  error: { marginBottom: 12, padding: 12, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  accountButton: { marginTop: 10, minHeight: 52, paddingVertical: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.chocolate, backgroundColor: "transparent" },
  accountButtonPressed: { opacity: 0.6 },
  accountButtonText: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 1 },
  accountFirstHint: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 8.5, textAlign: "center" },
  accountShort: { marginTop: 10, padding: 12, color: colors.rust, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, fontFamily: fonts.sans, fontSize: 9.5, lineHeight: 14 },
  note: { marginTop: 12, color: colors.muted, fontFamily: fonts.sans, fontSize: 8.5, lineHeight: 13, textAlign: "center" },
});
