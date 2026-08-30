import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { PageHeader } from "../components/PageHeader";
import {
  POSTAL_ADDRESS,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_PHONE_DIAL,
  WEBSITE,
} from "../lib/legal-copy";
import { colors, fonts } from "../theme";

type Props = {
  onBack: () => void;
  onOpenLegal: (document: "privacy" | "terms") => void;
  onOpenSupport: () => void;
  version: string;
};

/**
 * Who made this and how to reach them.
 *
 * Every app store expects a customer to be able to find the company behind an
 * app, its version, and its legal documents without hunting. This is that
 * page, and it is reachable whether or not anyone is signed in.
 */
export function AboutScreen({ onBack, onOpenLegal, onOpenSupport, version }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <PageHeader backLabel="Back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>SINCE 1998 · DALLAS, TEXAS</Text>
        <Text accessibilityRole="header" style={styles.title}>About Dallas Bakery</Text>
        <Text style={styles.body}>
          We bake Persian barbari — a ridged flatbread with a tender centre and crisp edges — and
          sell it by the case to restaurants, grocers, hotels, institutions, and distributors
          across the contiguous United States. Everything is Kosher (K Pareve), Halal, and vegan,
          with a 14-day shelf life at room temperature.
        </Text>
        <Text style={styles.body}>
          This app is for approved wholesale customers: browse the catalog with full ingredient and
          allergen information, order by the case, track shipments, and pull invoices and account
          statements. Wholesale pricing is private to each account, which is why prices appear only
          after you sign in.
        </Text>

        <View style={styles.panel}>
          <Text style={styles.panelKicker}>CONTACT</Text>
          <Pressable
            accessibilityLabel={`Call the bakery at ${SUPPORT_PHONE}`}
            accessibilityRole="button"
            onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE_DIAL}`)}
            style={styles.contactRow}
          >
            <Text style={styles.contactLabel}>Phone</Text>
            <Text style={styles.contactValue}>{SUPPORT_PHONE}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
            accessibilityRole="button"
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            style={styles.contactRow}
          >
            <Text style={styles.contactLabel}>Email</Text>
            <Text style={styles.contactValue}>{SUPPORT_EMAIL}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Open the Dallas Bakery wholesale website"
            accessibilityRole="button"
            onPress={() => void Linking.openURL(WEBSITE)}
            style={styles.contactRow}
          >
            <Text style={styles.contactLabel}>Website</Text>
            <Text style={styles.contactValue}>dallasbakery.net</Text>
          </Pressable>
          <View style={styles.contactRow}>
            <Text style={styles.contactLabel}>Address</Text>
            <Text style={styles.contactValue}>2643 Manana Dr{"\n"}Dallas, TX 75220</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelKicker}>LEGAL</Text>
          <Pressable accessibilityRole="button" onPress={() => onOpenLegal("privacy")} style={styles.linkRow}>
            <Text style={styles.linkText}>Privacy notice</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onOpenLegal("terms")} style={styles.linkRow}>
            <Text style={styles.linkText}>Wholesale terms</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onOpenSupport} style={styles.linkRow}>
            <Text style={styles.linkText}>Help &amp; contact</Text>
            <Text style={styles.linkArrow}>→</Text>
          </Pressable>
        </View>

        <Text style={styles.version}>Buyer app version {version}</Text>
        <Text style={styles.copyright}>© {new Date().getFullYear()} Dallas Bakery. {POSTAL_ADDRESS}.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingTop: 26, paddingBottom: 48 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 1.2 },
  title: { marginTop: 10, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 32, lineHeight: 37 },
  body: { marginTop: 13, color: colors.ink, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 19 },

  panel: { marginTop: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  panelKicker: {
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 4,
    color: colors.rust,
    fontFamily: fonts.sansMedium,
    fontSize: 9.4,
    letterSpacing: 1.1,
  },
  contactRow: {
    minHeight: 50,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  contactLabel: { width: 66, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 0.6 },
  contactValue: { flex: 1, color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 18 },

  linkRow: {
    minHeight: 52,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  linkText: { flex: 1, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11.5 },
  linkArrow: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 13 },

  version: { marginTop: 26, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.5, textAlign: "center" },
  copyright: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 14, textAlign: "center" },
});
