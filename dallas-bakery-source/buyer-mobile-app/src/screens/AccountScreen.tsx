import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { BottomNav } from "../components/BottomNav";
import { PrimaryButton } from "../components/PrimaryButton";
import { StandingOrderCard } from "../components/StandingOrderCard";
import type { StandingOrderInfo } from "../lib/storefront";
import { colors, fonts } from "../theme";
import type { BuyerAccount, MainTab } from "../types";

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
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader cartCount={cartCount} initials={userInitials} onCart={onCart} onProfile={() => undefined} />
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

        <View style={styles.menu}>
          <MenuItem label="Business locations" onPress={() => onTab("locations")} />
          <MenuItem label="Order history" onPress={() => onTab("orders")} />
          <MenuItem label="Wholesale terms" onPress={() => void Linking.openURL("https://dallasbakery.net/terms")} />
          <MenuItem label="Privacy notice" onPress={() => void Linking.openURL("https://dallasbakery.net/privacy")} />
          <MenuItem label="Email wholesale support" onPress={() => void Linking.openURL("mailto:sales@dallasbakery.com")} />
        </View>

        <View style={styles.security}>
          <Text style={styles.securityKicker}>ACCOUNT SECURITY</Text>
          <Text style={styles.securityText}>Your approved-buyer session is encrypted on this device. Passwords and store administration credentials are never stored in the app.</Text>
        </View>
        <PrimaryButton label="SIGN OUT" onPress={onSignOut} outline />
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
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1.2 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 34 },
  email: { marginTop: 7, color: colors.muted, fontFamily: fonts.sans, fontSize: 11 },
  summary: { marginTop: 22, flexDirection: "row", gap: 9 },
  summaryItem: { flex: 1, minHeight: 90, padding: 13, justifyContent: "space-between", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  summaryValue: { color: colors.chocolate, fontFamily: fonts.serif, fontWeight: "700", fontSize: 26 },
  summaryLabel: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 6.5, letterSpacing: 0.7 },
  menu: { marginTop: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  menuItem: { minHeight: 54, paddingHorizontal: 15, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.line, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  arrow: { color: colors.rust },
  security: { marginVertical: 16, padding: 15, backgroundColor: colors.chocolate },
  securityKicker: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 1 },
  securityText: { marginTop: 7, color: "#CCBFB5", fontFamily: fonts.sans, fontSize: 9, lineHeight: 15 },
  version: { marginTop: 22, color: colors.muted, fontFamily: fonts.sans, fontSize: 8, textAlign: "center" },
});
