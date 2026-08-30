import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { PageHeader } from "../components/PageHeader";
import { EFFECTIVE_DATE, LEGAL_DOCUMENTS, type LegalDocument } from "../lib/legal-copy";
import { colors, fonts } from "../theme";

type Props = {
  document: LegalDocument["key"];
  onBack: () => void;
};

/**
 * The privacy notice and the wholesale terms, read inside the app.
 *
 * Both are reachable without signing in — a customer should be able to read
 * what an app does with their information before handing any of it over, and
 * a reviewer should not have to leave the app to find it. The same words are
 * published on the website; the link at the bottom goes there for anyone who
 * wants to save or forward a copy.
 */
export function LegalScreen({ document, onBack }: Props) {
  const doc = LEGAL_DOCUMENTS[document];
  return (
    <SafeAreaView style={styles.safe}>
      <PageHeader backLabel="Back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>EFFECTIVE {EFFECTIVE_DATE.toUpperCase()}</Text>
        <Text accessibilityRole="header" style={styles.title}>{doc.title}</Text>
        <Text style={styles.intro}>{doc.intro}</Text>

        {doc.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>{section.heading}</Text>
            {section.body.map((paragraph) => (
              <Text key={paragraph} style={styles.body}>{paragraph}</Text>
            ))}
            {section.bullets?.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>·</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text
          accessibilityRole="link"
          onPress={() => void Linking.openURL(doc.webUrl)}
          style={styles.webLink}
        >
          Read this on dallasbakery.net
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
  intro: { marginTop: 12, color: colors.ink, fontFamily: fonts.sans, fontSize: 12, lineHeight: 20 },
  section: { marginTop: 26 },
  heading: {
    color: colors.chocolate,
    fontFamily: fonts.sansMedium,
    fontSize: 9.8,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  body: { marginTop: 9, color: colors.ink, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 19 },
  bulletRow: { marginTop: 8, flexDirection: "row", gap: 8, paddingRight: 4 },
  bulletDot: { width: 8, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 19 },
  bulletText: { flex: 1, color: colors.ink, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 19 },
  webLink: {
    marginTop: 34,
    color: colors.muted,
    fontFamily: fonts.sans,
    fontSize: 10.5,
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
