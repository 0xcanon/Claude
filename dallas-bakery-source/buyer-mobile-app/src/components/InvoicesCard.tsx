import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { formatCents, formatDate } from "../lib/format";
import { colors, fonts } from "../theme";
import type { BuyerInvoice } from "../types";

type Props = {
  invoices: BuyerInvoice[];
  openBalanceCents: number;
  termsLabel: string;
  busyId: string;
  error: string;
  onOpenInvoice: (orderId: string) => void;
  onOpenStatement: () => void;
};

const MAX_LISTED = 8;

/**
 * The buyer's invoices, and the one button their bookkeeper actually wants:
 * a statement of everything still owed.
 *
 * Each row opens the printable document in the phone's browser rather than an
 * in-app viewer — printing and "save as PDF" already live there, and a
 * bookkeeper needs to forward the file, not look at it.
 */
export function InvoicesCard({
  invoices,
  openBalanceCents,
  termsLabel,
  busyId,
  error,
  onOpenInvoice,
  onOpenStatement,
}: Props) {
  if (!invoices.length) return null;
  const listed = invoices.slice(0, MAX_LISTED);
  const hidden = invoices.length - listed.length;

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>INVOICES &amp; STATEMENTS</Text>
      <Text style={styles.balance}>
        {openBalanceCents > 0 ? formatCents(openBalanceCents) : "Nothing outstanding"}
      </Text>
      <Text style={styles.balanceNote}>
        {openBalanceCents > 0
          ? `Open balance${termsLabel ? ` on your ${termsLabel} account` : ""}.`
          : "Your account is settled in full."}
      </Text>

      <View style={styles.list}>
        {listed.map((invoice) => (
          <Pressable
            accessibilityLabel={`Open invoice ${invoice.invoiceNumber}`}
            accessibilityRole="button"
            key={invoice.orderId}
            onPress={() => onOpenInvoice(invoice.orderId)}
            style={styles.row}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{invoice.invoiceNumber}</Text>
              <Text style={styles.rowDetail}>
                {formatDate(invoice.placedAt)}
                {invoice.poNumber ? ` · PO ${invoice.poNumber}` : ""}
              </Text>
              <Text style={invoice.status === "overdue" ? styles.rowStatusLate : styles.rowStatus}>
                {invoice.statusLabel.toUpperCase()}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowAmount}>{formatCents(invoice.totalCents)}</Text>
              {busyId === invoice.orderId
                ? <ActivityIndicator color={colors.rust} size="small" />
                : <Text style={styles.rowOpen}>OPEN →</Text>}
            </View>
          </Pressable>
        ))}
      </View>

      {hidden > 0 && (
        <Text style={styles.more}>
          {hidden} older invoice{hidden === 1 ? "" : "s"} are on the statement.
        </Text>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        accessibilityLabel="Open account statement"
        accessibilityRole="button"
        onPress={onOpenStatement}
        style={styles.statement}
      >
        <Text style={styles.statementText}>
          {busyId === "statement" ? "OPENING…" : "OPEN ACCOUNT STATEMENT"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 17, padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1 },
  balance: { marginTop: 9, color: colors.chocolate, fontFamily: fonts.serif, fontWeight: "700", fontSize: 26 },
  balanceNote: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 },
  list: { marginTop: 13, borderTopWidth: 1, borderTopColor: colors.line },
  row: { minHeight: 62, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line },
  rowCopy: { flex: 1, paddingRight: 10 },
  rowTitle: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  rowDetail: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  rowStatus: { marginTop: 4, color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 9.2, letterSpacing: 0.6 },
  rowStatusLate: { marginTop: 4, color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 9.2, letterSpacing: 0.6 },
  rowRight: { alignItems: "flex-end", gap: 5 },
  rowAmount: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  rowOpen: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 0.6 },
  more: { marginTop: 10, color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  error: { marginTop: 10, padding: 10, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 },
  statement: { marginTop: 14, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.rust },
  statementText: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 0.8 },
});
