import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { PageHeader } from "../components/PageHeader";
import { colors, fonts } from "../theme";
import type { NotificationPreferences } from "../types";

type Props = {
  onBack: () => void;
  /** Null while the device's stored choices are still loading. */
  preferences: NotificationPreferences | null;
  /** False when the phone has not granted permission, or push is unavailable. */
  enabled: boolean;
  busy: boolean;
  error: string;
  onChange: (next: NotificationPreferences) => void;
  onEnable: () => void;
};

/**
 * Which alerts this phone gets.
 *
 * Both switches are real: turning one off is stored against this device on the
 * server, which is where the decision to send is made — a preference that only
 * lived on the phone could not stop a push already on its way. Nothing in the
 * app requires notifications to work, and the screen says so, because that is
 * both true and what Apple asks an app to make clear.
 */
export function NotificationSettingsScreen({
  onBack,
  preferences,
  enabled,
  busy,
  error,
  onChange,
  onEnable,
}: Props) {
  const rows: Array<{
    key: keyof NotificationPreferences;
    title: string;
    detail: string;
  }> = [
    {
      key: "orderUpdates",
      title: "Order updates",
      detail: "When we receive your order, and when it leaves the bakery with a tracking number.",
    },
    {
      key: "invoiceReminders",
      title: "Invoice reminders",
      detail: "Three days before an invoice is due, on the day, and weekly if it goes past due.",
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <PageHeader backLabel="Back to account" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>THIS DEVICE</Text>
        <Text accessibilityRole="header" style={styles.title}>Notifications</Text>
        <Text style={styles.intro}>
          Everything in the app works whether these are on or off. Order confirmations, tracking,
          and invoices always reach you by email as well.
        </Text>

        {!enabled ? (
          <View style={styles.offCard}>
            <Text style={styles.offTitle}>Notifications are off for this app</Text>
            <Text style={styles.offText}>
              Turn them on to hear when an order ships without opening the app. We only send you
              things about your own orders and invoices — never marketing.
            </Text>
            <Pressable
              accessibilityLabel="Turn on notifications"
              accessibilityRole="button"
              disabled={busy}
              onPress={onEnable}
              style={styles.offButton}
            >
              <Text style={styles.offButtonText}>{busy ? "…" : "TURN ON NOTIFICATIONS"}</Text>
            </Pressable>
            <Text
              accessibilityRole="link"
              onPress={() => void Linking.openSettings()}
              style={styles.offLink}
            >
              Or open your phone&apos;s Settings
            </Text>
          </View>
        ) : !preferences ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.rust} />
          </View>
        ) : (
          <View style={styles.panel}>
            {rows.map((row, index) => (
              <View key={row.key} style={[styles.row, index > 0 && styles.rowDivided]}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowDetail}>{row.detail}</Text>
                </View>
                <Switch
                  accessibilityLabel={row.title}
                  disabled={busy}
                  onValueChange={(value) => onChange({ ...preferences, [row.key]: value })}
                  thumbColor={colors.paper}
                  trackColor={{ false: colors.line, true: colors.sage }}
                  value={preferences[row.key]}
                />
              </View>
            ))}
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.noteCard}>
          <Text style={styles.noteKicker}>WHAT WE NEVER SEND</Text>
          <Text style={styles.noteText}>
            No promotions, no offers, no &ldquo;we miss you&rdquo;. A notification from this app is
            always about an order or an invoice of yours. Prices never appear in one either — a
            lock screen is read by whoever is holding the phone.
          </Text>
        </View>

        <Text
          accessibilityRole="link"
          onPress={() => void Linking.openSettings()}
          style={styles.systemLink}
        >
          Manage permission in your phone&apos;s Settings
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingTop: 26, paddingBottom: 48 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 1.2 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 32, lineHeight: 37 },
  intro: { marginTop: 11, color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 19 },

  loading: { marginTop: 30, alignItems: "center" },

  offCard: { marginTop: 20, padding: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  offTitle: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12.5 },
  offText: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 18 },
  offButton: { marginTop: 14, minHeight: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.rust },
  offButtonText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 9.5, letterSpacing: 0.9 },
  offLink: { marginTop: 12, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, textAlign: "center", textDecorationLine: "underline" },

  panel: { marginTop: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  row: { minHeight: 76, padding: 15, flexDirection: "row", alignItems: "center", gap: 14 },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.line },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12 },
  rowDetail: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },

  error: { marginTop: 14, padding: 12, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },

  noteCard: { marginTop: 20, padding: 16, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.chocolate },
  noteKicker: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  noteText: { marginTop: 8, color: "#CDBFB5", fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 17 },

  systemLink: { marginTop: 24, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5, textAlign: "center", textDecorationLine: "underline" },
});
