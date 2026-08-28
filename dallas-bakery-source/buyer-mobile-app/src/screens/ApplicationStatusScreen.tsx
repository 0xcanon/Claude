import { Linking, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { PrimaryButton } from "../components/PrimaryButton";
import { colors, fonts } from "../theme";
import type { TrackedApplication } from "../types";

type Props = {
  application: TrackedApplication | null;
  error: string;
  loading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onSignIn: () => void;
  signingIn: boolean;
};

export function ApplicationStatusScreen({
  application,
  error,
  loading,
  onBack,
  onRefresh,
  onSignIn,
  signingIn,
}: Props) {
  const approved = application?.status === "approved";
  const declined = application?.status === "declined";
  const title = application?.orderingReady
    ? "Your account is\nready."
    : approved
      ? "We’re finishing\nyour account."
      : declined
        ? "Let’s check your\ndetails."
        : "We’re reviewing\nyour account.";
  const description = application?.orderingReady
    ? "Sign in to select a storefront, see private pricing, and order."
    : approved
      ? "Dallas Bakery approved the business. Your private catalog and locations are being prepared — you can sign in now, and your storefront appears the moment setup finishes."
      : declined
        ? "Contact our wholesale team so we can help confirm the right business details."
        : "We’ll email you as soon as your private catalog and approved delivery locations are ready.";

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader light />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={loading} tintColor={colors.rust} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>ACCOUNT STATUS</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <View style={styles.timeline}>
          <StatusStep complete={Boolean(application)} label="Business details received" detail={application?.businessName || "Loading your request…"} number="1" />
          <StatusStep complete={Boolean(application)} label="Primary store saved" detail={application ? [application.primaryLocation.street, application.primaryLocation.city, application.primaryLocation.state].filter(Boolean).join(" · ") : ""} number="2" />
          <StatusStep complete={approved} current={!approved && !declined} declined={declined} label="Dallas Bakery review" detail={declined ? "Contact us to review the details" : approved ? "Business approved" : "Application is being reviewed"} number="3" />
          <StatusStep complete={Boolean(application?.orderingReady)} current={approved && !application?.orderingReady} label="Private catalog" detail={application?.orderingReady ? "Ready for secure ordering" : approved ? "Final account setup" : "Unlocks after account approval"} number="4" last />
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {approved && (
          <PrimaryButton
            label={application?.orderingReady ? "SIGN IN TO PRIVATE CATALOG" : "SIGN IN TO YOUR ACCOUNT"}
            loading={signingIn}
            onPress={onSignIn}
          />
        )}
        {!application?.orderingReady && (
          <PrimaryButton label="REFRESH STATUS" loading={loading} onPress={onRefresh} outline />
        )}
        <View style={styles.secondary}><PrimaryButton label="BACK TO WELCOME" onPress={onBack} outline /></View>
        <Text onPress={() => void Linking.openURL("mailto:sales@dallasbakery.com")} style={styles.help}>Questions? sales@dallasbakery.com</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusStep({ complete, current = false, declined = false, detail, label, last = false, number }: {
  complete: boolean;
  current?: boolean;
  declined?: boolean;
  detail: string;
  label: string;
  last?: boolean;
  number: string;
}) {
  return (
    <View style={styles.statusRow}>
      <View style={styles.markerColumn}>
        <View style={[styles.marker, complete && styles.markerComplete, current && styles.markerCurrent, declined && styles.markerDeclined]}>
          <Text style={[styles.markerText, (complete || current || declined) && styles.markerTextActive]}>{complete ? "✓" : declined ? "!" : number}</Text>
        </View>
        {!last && <View style={[styles.line, complete && styles.lineComplete]} />}
      </View>
      <View style={styles.statusCopy}>
        <Text style={styles.statusLabel}>{label}</Text>
        {!!detail && <Text style={styles.statusDetail}>{detail}</Text>}
      </View>
      {current && <Text style={styles.pill}>IN REVIEW</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 18, paddingTop: 36, paddingBottom: 42 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1.5 },
  title: { marginTop: 12, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 39, lineHeight: 42 },
  description: { marginTop: 12, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 18 },
  timeline: { marginTop: 24, marginBottom: 14, padding: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  statusRow: { minHeight: 78, flexDirection: "row", alignItems: "flex-start" },
  markerColumn: { width: 34, alignItems: "center", alignSelf: "stretch" },
  marker: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream },
  markerComplete: { borderColor: colors.sage, backgroundColor: colors.sage },
  markerCurrent: { borderColor: colors.gold, backgroundColor: colors.gold },
  markerDeclined: { borderColor: colors.danger, backgroundColor: colors.danger },
  markerText: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9 },
  markerTextActive: { color: colors.paper },
  line: { width: 1, flex: 1, backgroundColor: colors.line },
  lineComplete: { backgroundColor: colors.sage },
  statusCopy: { flex: 1, paddingTop: 4, paddingLeft: 8 },
  statusLabel: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  statusDetail: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 },
  pill: { marginTop: 1, paddingVertical: 5, paddingHorizontal: 7, borderRadius: 10, overflow: "hidden", color: colors.chocolate, backgroundColor: colors.goldPale, fontFamily: fonts.sansMedium, fontSize: 6, letterSpacing: 0.5 },
  error: { marginBottom: 12, padding: 12, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  secondary: { marginTop: 9 },
  help: { marginTop: 26, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, textAlign: "center", textDecorationLine: "underline" },
});
