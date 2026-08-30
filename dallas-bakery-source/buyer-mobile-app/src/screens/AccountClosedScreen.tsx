import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandLockup } from "../components/BrandLockup";
import { PrimaryButton } from "../components/PrimaryButton";
import { formatCents } from "../lib/format";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_DIAL } from "../lib/legal-copy";
import { colors, fonts } from "../theme";

type Props = {
  businessName: string;
  ordersRetained: number;
  outstandingCents: number;
  onDone: () => void;
};

/**
 * The receipt for closing an account.
 *
 * Shown once, immediately after, because a person who has just deleted
 * something permanent deserves to see that it worked and what remains — not
 * be dropped back at a sign-in screen wondering.
 */
export function AccountClosedScreen({
  businessName,
  ordersRetained,
  outstandingCents,
  onDone,
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><BrandLockup compact /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>DONE</Text>
        <Text accessibilityRole="header" style={styles.title}>Your account is deleted</Text>
        <Text style={styles.body}>
          The wholesale account for {businessName} is deleted and you are signed out. Your business
          and contact details, saved addresses, saved card, standing order, exclusive pricing,
          notification devices, and email-list entry are deleted.
        </Text>

        {ordersRetained > 0 && (
          <View style={styles.panel}>
            <Text style={styles.panelKicker}>WHAT WE KEPT</Text>
            <Text style={styles.panelText}>
              {ordersRetained} past order{ordersRetained === 1 ? "" : "s"}, with the name and address
              each one shipped to. Sales records have to stay for tax and accounting.
            </Text>
          </View>
        )}

        {outstandingCents > 0 && (
          <View accessibilityRole="alert" style={styles.balancePanel}>
            <Text style={styles.balanceKicker}>STILL OWED</Text>
            <Text style={styles.balanceAmount}>{formatCents(outstandingCents)}</Text>
            <Text style={styles.balanceText}>
              Deleting the account did not cancel this. Call {SUPPORT_PHONE} and we&apos;ll settle it
              with you.
            </Text>
          </View>
        )}

        <Text style={styles.body}>
          A confirmation is on its way to the email address that was on the account — the last
          message we&apos;ll send there.
        </Text>
        <Text style={styles.body}>
          If you ever want to come back, apply again from the opening screen. We&apos;d be glad to
          have you.
        </Text>

        <View style={styles.actions}>
          <PrimaryButton label="BACK TO START" onPress={onDone} />
        </View>

        <Text
          accessibilityRole="link"
          onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE_DIAL}`)}
          style={styles.help}
        >
          Something wrong? Call {SUPPORT_PHONE} or email {SUPPORT_EMAIL}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.paper,
  },
  content: { padding: 20, paddingTop: 32, paddingBottom: 48 },
  kicker: { color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 1.2 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 32, lineHeight: 37 },
  body: { marginTop: 14, color: colors.ink, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 19 },

  panel: { marginTop: 18, padding: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  panelKicker: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  panelText: { marginTop: 8, color: colors.ink, fontFamily: fonts.sans, fontSize: 11, lineHeight: 18 },

  balancePanel: { marginTop: 14, padding: 16, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.rosePale },
  balanceKicker: { color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  balanceAmount: { marginTop: 6, color: colors.danger, fontFamily: fonts.serif, fontWeight: "700", fontSize: 26 },
  balanceText: { marginTop: 7, color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11, lineHeight: 18 },

  actions: { marginTop: 26 },
  help: { marginTop: 22, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16, textAlign: "center", textDecorationLine: "underline" },
});
