import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { BottomNav } from "../components/BottomNav";
import { InvoicesCard } from "../components/InvoicesCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { StandingOrderCard } from "../components/StandingOrderCard";
import type { StandingOrderInfo } from "../lib/storefront";
import { colors, fonts } from "../theme";
import type { BuyerAccount, BuyerInvoice, MainTab } from "../types";

type Props = {
  account: BuyerAccount;
  cartCount: number;
  onCart: () => void;
  onPauseStanding: () => void;
  onSignOut: () => void;
  onTab: (tab: MainTab) => void;
  standingBusy: boolean;
  standingOrder: StandingOrderInfo | null;
  userInitials: string;
  invoices: BuyerInvoice[];
  openBalanceCents: number;
  termsLabel: string;
  documentBusyId: string;
  documentError: string;
  onOpenInvoice: (orderId: string) => void;
  onOpenStatement: () => void;
  onOpenSupport: () => void;
  /** Opens the screen for telling the bakery something went wrong. */
  onReportProblem: () => void;
  onOpenLegal: (document: "privacy" | "terms") => void;
  onOpenNotifications: () => void;
  onOpenAbout: () => void;
  onCloseAccount: () => void;
};

export function AccountScreen({
  account,
  cartCount,
  onCart,
  onPauseStanding,
  onSignOut,
  onTab,
  standingBusy,
  standingOrder,
  userInitials,
  invoices,
  openBalanceCents,
  termsLabel,
  documentBusyId,
  documentError,
  onOpenInvoice,
  onOpenStatement,
  onOpenSupport,
  onReportProblem,
  onOpenLegal,
  onOpenNotifications,
  onOpenAbout,
  onCloseAccount,
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader cartCount={cartCount} initials={userInitials} onCart={onCart} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>APPROVED BUYER ACCOUNT</Text>
        <Text style={styles.title}>{account.displayName}</Text>
        <Text style={styles.email}>{account.email}</Text>

        <View style={styles.summary}>
          <View style={styles.summaryItem}><Text style={styles.summaryValue}>{account.locations.length}</Text><Text style={styles.summaryLabel}>DELIVERY LOCATIONS</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryValue}>{account.orders.length}</Text><Text style={styles.summaryLabel}>RECENT ORDERS</Text></View>
        </View>

                <StandingOrderCard
          busy={standingBusy}
          cartCases={0}
          notice=""
          onPause={onPauseStanding}
          onSave={() => onTab("catalog")}
          onSelectWeekday={() => undefined}
          standingOrder={standingOrder}
          weekday={standingOrder?.weekday ?? 2}
        />

        <InvoicesCard
          busyId={documentBusyId}
          error={documentError}
          invoices={invoices}
          onOpenInvoice={onOpenInvoice}
          onOpenStatement={onOpenStatement}
          openBalanceCents={openBalanceCents}
          termsLabel={termsLabel}
        />

        <Text style={styles.menuKicker}>YOUR ACCOUNT</Text>
        <View style={styles.menu}>
          <MenuItem label="Business locations" onPress={() => onTab("locations")} />
          <MenuItem label="Order history" onPress={() => onTab("orders")} />
          <MenuItem label="Notifications" onPress={onOpenNotifications} />
        </View>

        <Text style={styles.menuKicker}>HELP &amp; LEGAL</Text>
        <View style={styles.menu}>
          <MenuItem label="Report a problem" onPress={onReportProblem} />
          <MenuItem label="Help & contact" onPress={onOpenSupport} />
          <MenuItem label="Wholesale terms" onPress={() => onOpenLegal("terms")} />
          <MenuItem label="Privacy notice" onPress={() => onOpenLegal("privacy")} />
          <MenuItem label="About this app" onPress={onOpenAbout} />
          <MenuItem label="Delete account" onPress={onCloseAccount} />
        </View>

        <View style={styles.security}>
          <Text style={styles.securityKicker}>ACCOUNT SECURITY</Text>
          <Text style={styles.securityText}>Your approved-buyer session is encrypted on this device. Passwords and store administration credentials are never stored in the app.</Text>
        </View>
        <PrimaryButton label="SIGN OUT" onPress={onSignOut} outline />

        <View style={styles.dangerZone}>
          <Text style={styles.dangerKicker}>DELETING YOUR ACCOUNT</Text>
          <Text style={styles.dangerText}>
            You can permanently delete this account from here. It takes effect immediately, and we
            show you exactly what gets deleted and what we have to keep before you confirm.
          </Text>
          <Pressable
            accessibilityLabel="Delete my account"
            accessibilityRole="button"
            onPress={onCloseAccount}
            style={styles.dangerButton}
          >
            <Text style={styles.dangerButtonText}>DELETE MY ACCOUNT</Text>
          </Pressable>
        </View>

        <Text style={styles.version}>Dallas Bakery Wholesale · Buyer app 1.0.0</Text>
      </ScrollView>
      <BottomNav active="account" cartCount={cartCount} onSelect={onTab} />
    </SafeAreaView>
  );
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text accessibilityRole="button" onPress={onPress} style={styles.menuItem}>{label}<Text style={styles.arrow}>  →</Text></Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 18, paddingTop: 30, paddingBottom: 38 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 1.2 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 34 },
  email: { marginTop: 7, color: colors.muted, fontFamily: fonts.sans, fontSize: 11 },
  summary: { marginTop: 22, flexDirection: "row", gap: 9 },
  summaryItem: { flex: 1, minHeight: 90, padding: 13, justifyContent: "space-between", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  summaryValue: { color: colors.chocolate, fontFamily: fonts.serif, fontWeight: "700", fontSize: 26 },
  summaryLabel: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.2, letterSpacing: 0.7 },
  menuKicker: { marginTop: 22, marginBottom: 8, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  menu: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  dangerZone: { marginTop: 26, padding: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  dangerKicker: { color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  dangerText: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 17 },
  dangerButton: { marginTop: 13, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.danger },
  dangerButtonText: { color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 9.5, letterSpacing: 0.9 },
  menuItem: { minHeight: 54, paddingHorizontal: 15, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.line, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  arrow: { color: colors.rust },
  security: { marginVertical: 16, padding: 15, backgroundColor: colors.chocolate },
  securityKicker: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1 },
  securityText: { marginTop: 7, color: "#CCBFB5", fontFamily: fonts.sans, fontSize: 9, lineHeight: 15 },
  version: { marginTop: 22, color: colors.muted, fontFamily: fonts.sans, fontSize: 9.8, textAlign: "center" },
});
