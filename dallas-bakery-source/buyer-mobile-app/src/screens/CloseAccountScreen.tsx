import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageHeader } from "../components/PageHeader";
import { PrimaryButton } from "../components/PrimaryButton";
import { formatCents } from "../lib/format";
import { SUPPORT_PHONE, SUPPORT_PHONE_DIAL } from "../lib/legal-copy";
import { colors, fonts } from "../theme";
import type { ClosurePreview } from "../types";

type Props = {
  onBack: () => void;
  onLoadPreview: () => Promise<ClosurePreview | null>;
  onClose: (confirm: string, reason: string) => Promise<void>;
  closing: boolean;
  error: string;
};

const CONFIRM_PHRASE = "DELETE";

/**
 * Closing the account, from inside the app.
 *
 * Written to be honest rather than reassuring. Everything that will be erased
 * is listed, everything the bakery has to keep is listed next to it with the
 * reason, and an unpaid balance is stated in bold before the buyer can
 * confirm — a person deleting an account deserves to know the debt does not
 * go with it. The confirmation phrase exists so a mis-tap cannot do this.
 */
export function CloseAccountScreen({ onBack, onLoadPreview, onClose, closing, error }: Props) {
  const [preview, setPreview] = useState<ClosurePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await onLoadPreview();
      if (!active) return;
      /* eslint-disable react-hooks/set-state-in-effect */
      setPreview(loaded);
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    })();
    return () => { active = false; };
  }, [onLoadPreview]);

  const owes = (preview?.outstandingCents || 0) > 0;
  const ready = confirm.trim().toUpperCase() === CONFIRM_PHRASE;

  const erased = preview
    ? [
        "Your business name, contact name, email, phone, and addresses",
        preview.locationCount > 0
          ? `Your ${preview.locationCount} saved delivery address${preview.locationCount === 1 ? "" : "es"}`
          : "",
        preview.hasSavedCard ? "Your saved card — removed at our payment processor too" : "",
        preview.hasStandingOrder ? "Your standing weekly order" : "",
        "Any pricing set specifically for your business",
        preview.pushDeviceCount > 0
          ? `Notifications on ${preview.pushDeviceCount} device${preview.pushDeviceCount === 1 ? "" : "s"}`
          : "",
        preview.onMarketingList ? "Your entry on our email list" : "",
        "Your sign-in — this session ends immediately",
      ].filter(Boolean)
    : [];

  return (
    <SafeAreaView style={styles.safe}>
      <PageHeader backLabel="Back to account" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>THIS CANNOT BE UNDONE</Text>
        <Text accessibilityRole="header" style={styles.title}>Delete your account</Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.rust} />
            <Text style={styles.loadingText}>Checking what this would affect…</Text>
          </View>
        ) : !preview ? (
          <Text style={styles.error}>
            {error || "This account could not be loaded. Call us and we'll close it for you."}
          </Text>
        ) : (
          <>
            <Text style={styles.intro}>
              Deleting the account for <Text style={styles.strong}>{preview.businessName}</Text> takes
              effect straight away. You can apply again later, but nothing below comes back.
            </Text>

            {owes && (
              <View accessibilityRole="alert" style={styles.balanceCard}>
                <Text style={styles.balanceKicker}>YOU STILL OWE</Text>
                <Text style={styles.balanceAmount}>{formatCents(preview.outstandingCents)}</Text>
                <Text style={styles.balanceText}>
                  {preview.overdueCents > 0
                    ? `${formatCents(preview.overdueCents)} of this is past due. `
                    : ""}
                  Deleting your account does not cancel what is owed — the invoices stay on the
                  bakery&apos;s books. Settle it first if you can, or call us and we&apos;ll sort it out.
                </Text>
                <Pressable
                  accessibilityLabel={`Call the bakery at ${SUPPORT_PHONE}`}
                  accessibilityRole="button"
                  onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE_DIAL}`)}
                  style={styles.balanceCall}
                >
                  <Text style={styles.balanceCallText}>CALL {SUPPORT_PHONE}</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.panel}>
              <Text style={styles.panelKicker}>WHAT WE DELETE</Text>
              {erased.map((line) => (
                <View key={line} style={styles.row}>
                  <Text style={styles.rowMark}>✕</Text>
                  <Text style={styles.rowText}>{line}</Text>
                </View>
              ))}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelKicker}>WHAT WE HAVE TO KEEP</Text>
              {preview.orderCount > 0 ? (
                <View style={styles.row}>
                  <Text style={styles.rowKeep}>•</Text>
                  <Text style={styles.rowText}>
                    Your {preview.orderCount} past order{preview.orderCount === 1 ? "" : "s"}, with the
                    name and address each one shipped to. Sales records have to stay for tax and
                    accounting, and we can&apos;t delete them.
                  </Text>
                </View>
              ) : (
                <View style={styles.row}>
                  <Text style={styles.rowKeep}>•</Text>
                  <Text style={styles.rowText}>Nothing — you have no orders on file.</Text>
                </View>
              )}
            </View>

            <Text style={styles.fieldLabel}>WHY ARE YOU LEAVING? (OPTIONAL)</Text>
            <TextInput
              accessibilityLabel="Why are you leaving, optional"
              multiline
              maxLength={500}
              onChangeText={setReason}
              placeholder="It helps us know what went wrong."
              placeholderTextColor={colors.muted}
              style={styles.reasonInput}
              value={reason}
            />

            <Text style={styles.fieldLabel}>TYPE {CONFIRM_PHRASE} TO CONFIRM</Text>
            <TextInput
              accessibilityLabel={`Type ${CONFIRM_PHRASE} to confirm`}
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={setConfirm}
              placeholder={CONFIRM_PHRASE}
              placeholderTextColor={colors.muted}
              style={styles.confirmInput}
              value={confirm}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable
                accessibilityLabel="Delete my account permanently"
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready || closing }}
                disabled={!ready || closing}
                onPress={() => void onClose(confirm, reason)}
                style={[styles.destructive, (!ready || closing) && styles.destructiveOff]}
              >
                <Text style={styles.destructiveText}>
                  {closing ? "DELETING…" : "DELETE MY ACCOUNT PERMANENTLY"}
                </Text>
              </Pressable>
              <PrimaryButton label="KEEP MY ACCOUNT" onPress={onBack} outline />
            </View>

            <Text style={styles.footnote}>
              Would rather talk to someone first? Call {SUPPORT_PHONE}. Deleting here does the same
              thing, immediately, without waiting for us to pick up.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingTop: 26, paddingBottom: 48 },
  kicker: { color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 1.2 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 32, lineHeight: 37 },
  intro: { marginTop: 12, color: colors.ink, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 19 },
  strong: { fontFamily: fonts.sansMedium },

  loading: { marginTop: 34, alignItems: "center", gap: 12 },
  loadingText: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11 },

  balanceCard: { marginTop: 18, padding: 16, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.rosePale },
  balanceKicker: { color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  balanceAmount: { marginTop: 6, color: colors.danger, fontFamily: fonts.serif, fontWeight: "700", fontSize: 28 },
  balanceText: { marginTop: 8, color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11, lineHeight: 18 },
  balanceCall: { marginTop: 13, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger },
  balanceCallText: { color: colors.white, fontFamily: fonts.sansMedium, fontSize: 9.5, letterSpacing: 0.9 },

  panel: { marginTop: 18, padding: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  panelKicker: { marginBottom: 4, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  row: { marginTop: 9, flexDirection: "row", gap: 9 },
  rowMark: { width: 12, color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 10, lineHeight: 18 },
  rowKeep: { width: 12, color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 18 },
  rowText: { flex: 1, color: colors.ink, fontFamily: fonts.sans, fontSize: 11, lineHeight: 18 },

  fieldLabel: { marginTop: 22, marginBottom: 7, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 1 },
  reasonInput: {
    minHeight: 78,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    lineHeight: 18,
    textAlignVertical: "top",
  },
  confirmInput: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.paper,
    color: colors.chocolate,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    letterSpacing: 2,
  },

  error: { marginTop: 14, padding: 12, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },

  actions: { marginTop: 20, gap: 10 },
  destructive: { minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger },
  destructiveOff: { opacity: 0.4 },
  destructiveText: { color: colors.white, fontFamily: fonts.sansMedium, fontSize: 10.5, letterSpacing: 1 },

  footnote: { marginTop: 20, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16, textAlign: "center" },
});
