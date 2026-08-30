import { useState } from "react";
import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { PageHeader } from "../components/PageHeader";
import {
  POSTAL_ADDRESS,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_PHONE_DIAL,
  SUPPORT_TOPICS,
} from "../lib/legal-copy";
import { colors, fonts } from "../theme";

type Props = {
  onBack: () => void;
  /** Shown at the top when we know who is asking, so support can find them. */
  accountEmail?: string;
};

/**
 * Help, reachable with or without an account.
 *
 * Calling the bakery is put first and made the biggest target on the screen,
 * because for anything to do with a box that has already shipped it is the
 * only answer that helps today. The questions below it are the ones the
 * bakery is actually asked, so a buyer can solve their own problem at 6am.
 */
export function SupportScreen({ onBack, accountEmail }: Props) {
  const [openTopic, setOpenTopic] = useState("");

  const emailUrl = accountEmail
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Wholesale question")}&body=${
        encodeURIComponent(`\n\n—\nAccount: ${accountEmail}`)}`
    : `mailto:${SUPPORT_EMAIL}`;

  return (
    <SafeAreaView style={styles.safe}>
      <PageHeader backLabel="Back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>WE PICK UP THE PHONE</Text>
        <Text accessibilityRole="header" style={styles.title}>How can we help?</Text>
        <Text style={styles.intro}>
          A real person at the bakery answers. For anything about a box that has already shipped,
          calling is much faster than email.
        </Text>

        <Pressable
          accessibilityHint="Calls the bakery"
          accessibilityLabel={`Call the bakery at ${SUPPORT_PHONE}`}
          accessibilityRole="button"
          onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE_DIAL}`)}
          style={styles.callCard}
        >
          <Text style={styles.callKicker}>CALL THE BAKERY</Text>
          <Text style={styles.callNumber}>{SUPPORT_PHONE}</Text>
          <Text style={styles.callHours}>Monday to Friday, 7am – 4pm Central</Text>
        </Pressable>

        <Pressable
          accessibilityLabel={`Email wholesale support at ${SUPPORT_EMAIL}`}
          accessibilityRole="button"
          onPress={() => void Linking.openURL(emailUrl)}
          style={styles.emailCard}
        >
          <Text style={styles.emailKicker}>EMAIL US</Text>
          <Text style={styles.emailAddress}>{SUPPORT_EMAIL}</Text>
          <Text style={styles.emailNote}>We reply within one business day.</Text>
        </Pressable>

        <Text style={styles.sectionKicker}>COMMON QUESTIONS</Text>
        <View style={styles.faq}>
          {SUPPORT_TOPICS.map((topic) => {
            const open = openTopic === topic.question;
            return (
              <View key={topic.question} style={styles.topic}>
                <Pressable
                  accessibilityLabel={topic.question}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => setOpenTopic(open ? "" : topic.question)}
                  style={styles.topicRow}
                >
                  <Text style={styles.topicQuestion}>{topic.question}</Text>
                  <Text style={styles.topicToggle}>{open ? "–" : "+"}</Text>
                </Pressable>
                {open && <Text style={styles.topicAnswer}>{topic.answer}</Text>}
              </View>
            );
          })}
        </View>

        <View style={styles.addressCard}>
          <Text style={styles.addressKicker}>THE BAKERY</Text>
          <Text style={styles.addressText}>{POSTAL_ADDRESS}</Text>
          <Text style={styles.addressNote}>
            Wholesale pickup is by arrangement — call before you drive over.
          </Text>
        </View>
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

  callCard: { marginTop: 20, minHeight: 96, padding: 18, justifyContent: "center", backgroundColor: colors.chocolate },
  callKicker: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  callNumber: { marginTop: 7, color: colors.paper, fontFamily: fonts.serif, fontWeight: "700", fontSize: 27 },
  callHours: { marginTop: 5, color: "#CDBFB5", fontFamily: fonts.sans, fontSize: 10 },

  emailCard: {
    marginTop: 10,
    minHeight: 76,
    padding: 16,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  emailKicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.1 },
  emailAddress: { marginTop: 6, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 13 },
  emailNote: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 9.5 },

  sectionKicker: {
    marginTop: 30,
    marginBottom: 10,
    color: colors.rust,
    fontFamily: fonts.sansMedium,
    fontSize: 9.6,
    letterSpacing: 1.2,
  },
  faq: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  topic: { borderBottomWidth: 1, borderBottomColor: colors.line },
  topicRow: {
    minHeight: 54,
    paddingHorizontal: 15,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  topicQuestion: { flex: 1, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 17 },
  topicToggle: { width: 16, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 17, textAlign: "center" },
  topicAnswer: {
    paddingHorizontal: 15,
    paddingBottom: 16,
    marginTop: -3,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 18,
  },

  addressCard: { marginTop: 22, padding: 16, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.paper },
  addressKicker: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1 },
  addressText: { marginTop: 7, color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 18 },
  addressNote: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 9.5, lineHeight: 15 },
});
