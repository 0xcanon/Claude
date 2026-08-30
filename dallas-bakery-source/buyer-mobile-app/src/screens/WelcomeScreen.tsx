import { ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { PrimaryButton } from "../components/PrimaryButton";
import { colors, fonts } from "../theme";
import type { ShippingSettings } from "../types";

type Props = {
  error: string;
  hasTracking: boolean;
  onApply: () => void;
  onOpenAbout: () => void;
  onOpenLegal: (document: "privacy" | "terms") => void;
  onOpenStatus: () => void;
  onOpenSupport: () => void;
  onSignIn: () => void;
  shipping: ShippingSettings;
  signingIn: boolean;
};

const heroImage = require("../../assets/barbari-product.jpg");

export function WelcomeScreen({
  error,
  hasTracking,
  onApply,
  onOpenAbout,
  onOpenLegal,
  onOpenStatus,
  onOpenSupport,
  onSignIn,
  shipping,
  signingIn,
}: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader light />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground imageStyle={styles.heroImage} source={heroImage} style={styles.hero}>
          <View style={styles.overlay}>
            <Text style={styles.kicker}>WHOLESALE BREAD · DALLAS, TEXAS</Text>
            <Text style={styles.title}>Bread built for{`\n`}busy kitchens.</Text>
            <Text style={styles.heroText}>Kosher and Halal Persian Barbari bread with a 14-day shelf life.</Text>
          </View>
        </ImageBackground>

        <View style={styles.actions}>
          <PrimaryButton label="APPLY FOR WHOLESALE" onPress={onApply} />
          <PrimaryButton label="I ALREADY HAVE AN ACCOUNT" loading={signingIn} onPress={onSignIn} outline />
          {hasTracking && <PrimaryButton label="VIEW MY APPLICATION STATUS" onPress={onOpenStatus} outline />}
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.sectionKicker}>BUILT FOR YOUR BUSINESS</Text>
        <View style={styles.facts}>
          <View style={styles.fact}><Text style={styles.factValue}>Cases of 25</Text><Text style={styles.factLabel}>ONE CASE MINIMUM</Text></View>
          <View style={styles.fact}><Text style={styles.factValue}>Kosher + Halal</Text><Text style={styles.factLabel}>CERTIFIED</Text></View>
          <View style={styles.fact}><Text style={styles.factValue}>14 days</Text><Text style={styles.factLabel}>SHELF LIFE</Text></View>
        </View>

        <View style={styles.shippingCard}>
          <Text style={styles.shippingKicker}>SIMPLE BOX SHIPPING</Text>
          <Text style={styles.shippingTitle}>One case, one box</Text>
          <Text style={styles.shippingText}>Bread is ordered by the case. Each case ships as its own box of up to {shipping.unitsPerBox} breads, and your exact shipping cost shows in your account before you pay.</Text>
        </View>

        {/* Help and the legal documents are reachable before anyone signs in.
            Someone deciding whether to hand over their business details should
            be able to read what happens to them first, and these are the pages
            an app store expects to find without an account. */}
        <View style={styles.publicLinks}>
          <Pressable accessibilityRole="button" onPress={onOpenSupport} style={styles.linkRow}>
            <Text style={styles.linkText}>Help &amp; contact</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onOpenAbout} style={styles.linkRow}>
            <Text style={styles.linkText}>About Dallas Bakery</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenLegal("privacy")}
            style={styles.linkRow}
          >
            <Text style={styles.linkText}>Privacy notice</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenLegal("terms")}
            style={styles.linkRow}
          >
            <Text style={styles.linkText}>Wholesale terms</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 17, paddingBottom: 40, backgroundColor: colors.cream },
  hero: { minHeight: 340, justifyContent: "flex-end", overflow: "hidden", backgroundColor: colors.chocolate },
  heroImage: { opacity: 0.72 },
  overlay: { minHeight: 340, padding: 22, justifyContent: "space-between", backgroundColor: "rgba(43,26,19,0.47)" },
  kicker: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 1.4 },
  title: { marginTop: "auto", color: colors.paper, fontFamily: fonts.serif, fontSize: 39, lineHeight: 43 },
  heroText: { marginTop: 15, maxWidth: 265, color: "#E9DCCB", fontFamily: fonts.sans, fontSize: 12, lineHeight: 19 },
  actions: { marginTop: 12, gap: 9 },
  error: { marginTop: 12, padding: 12, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  sectionKicker: { marginTop: 30, marginBottom: 11, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 1.25 },
  facts: { flexDirection: "row", gap: 7 },
  fact: { flex: 1, minHeight: 92, padding: 11, justifyContent: "space-between", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  factValue: { color: colors.chocolate, fontFamily: fonts.serif, fontWeight: "700", fontSize: 14 },
  factLabel: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 0.7 },
  shippingCard: { marginTop: 13, padding: 16, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.chocolate },
  shippingKicker: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  shippingTitle: { marginTop: 8, color: colors.paper, fontFamily: fonts.serif, fontSize: 22 },
  shippingText: { marginTop: 6, color: "#CDBFB5", fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  publicLinks: { marginTop: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  linkRow: {
    minHeight: 50,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  linkText: { flex: 1, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  linkArrow: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 13 },
});
