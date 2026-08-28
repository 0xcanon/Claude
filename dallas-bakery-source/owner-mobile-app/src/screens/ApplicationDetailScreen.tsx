import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { StatusBadge } from "../components/StatusBadge";
import { ApiError, updateApplication } from "../lib/api";
import {
  addressOf,
  businessTypeLabel,
  formatApplicationDate,
  normalizeSignal,
} from "../lib/application-utils";
import { colors, fonts } from "../theme";
import type { ApplicationStatus, WholesaleApplication } from "../types";

type Props = {
  application: WholesaleApplication;
  onBack: () => void;
  onSessionExpired: () => Promise<void>;
  onPasswordChangeRequired: () => Promise<void>;
  onUpdated: (application: WholesaleApplication) => void;
  token: string;
};

type InfoBlockProps = {
  children: React.ReactNode;
  label: string;
};

function InfoBlock({ children, label }: InfoBlockProps) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

async function openLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn’t open this link", "Try again from the browser owner portal.");
  }
}

export function ApplicationDetailScreen({
  application,
  onBack,
  onSessionExpired,
  onPasswordChangeRequired,
  onUpdated,
  token,
}: Props) {
  const [notes, setNotes] = useState(application.ownerNotes);
  const [saving, setSaving] = useState<ApplicationStatus | "notes" | null>(null);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => setNotes(application.ownerNotes), [application.id, application.ownerNotes]);

  async function perform(
    status: ApplicationStatus,
    mode: ApplicationStatus | "notes" = status,
  ) {
    setSaving(mode);
    setError("");
    setSavedMessage("");
    try {
      const updated = await updateApplication(token, application.id, status, notes);
      onUpdated(updated);
      setSavedMessage(
        mode === "notes" ? "Private notes saved." : `Account moved to ${status}.`,
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await onSessionExpired();
        return;
      }
      if (caught instanceof ApiError && caught.status === 403 && caught.message === "Password change required") {
        await onPasswordChangeRequired();
        return;
      }
      setError(caught instanceof Error ? caught.message : "The application could not be updated.");
    } finally {
      setSaving(null);
    }
  }

  function confirmDecision(status: ApplicationStatus) {
    const action = status === "approved" ? "Approve" : status === "declined" ? "Decline" : "Move to pending";
    Alert.alert(
      `${action} this account?`,
      `${application.businessName} will be marked ${status}. Your private notes will be saved too.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action,
          style: status === "declined" ? "destructive" : "default",
          onPress: () => void perform(status),
        },
      ],
    );
  }

  const fullAddress = addressOf(application);
  const isBusy = saving !== null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>APPLICATIONS</Text>
        </Pressable>
        <Text style={styles.headerTitle}>ACCOUNT REVIEW</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.badgeRow}>
            <StatusBadge status={application.status} />
            <View style={styles.outlineBadge}>
              <Text style={styles.outlineBadgeText}>{application.screeningStatus === "auto_matched" ? "AUTO-MATCHED" : "CHECK DETAILS"}</Text>
            </View>
            {application.multipleLocations && (
              <View style={styles.outlineBadge}><Text style={styles.outlineBadgeText}>{application.locationCount} LOCATIONS</Text></View>
            )}
          </View>

          <View style={styles.identity}>
            <View style={styles.monogram}>
              <Text style={styles.monogramText}>{application.businessName.trim().slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.businessName}>{application.businessName}</Text>
              <Text style={styles.businessMeta}>{businessTypeLabel(application.businessType)} · {application.city}, {application.state}</Text>
              <Text style={styles.received}>Received {formatApplicationDate(application.createdAt)}</Text>
            </View>
          </View>

          <View style={styles.grid}>
            <InfoBlock label="Contact">
              <Text style={styles.infoStrong}>{application.contactName}</Text>
              <Pressable onPress={() => openLink(`mailto:${application.email}?subject=${encodeURIComponent("Dallas Bakery wholesale account")}`)}>
                <Text style={styles.infoLink}>{application.email}</Text>
              </Pressable>
              <Pressable onPress={() => openLink(`tel:${application.phone}`)}>
                <Text style={styles.infoLink}>{application.phone}</Text>
              </Pressable>
            </InfoBlock>

            <InfoBlock label="Primary delivery location">
              <Text style={styles.infoStrong}>{fullAddress}</Text>
              {!!application.standardizedAddress && <Text style={styles.infoMuted}>Matched to {application.standardizedAddress}</Text>}
              <Pressable onPress={() => openLink(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`)}>
                <Text style={styles.infoAction}>OPEN MAP ↗</Text>
              </Pressable>
            </InfoBlock>

            <InfoBlock label="Business details">
              <Text style={styles.infoStrong}>{application.matchedBusiness || "Listing not automatically matched"}</Text>
              {application.website ? (
                <Pressable onPress={() => openLink(application.website)}>
                  <Text style={styles.infoAction}>OPEN WEBSITE / LISTING ↗</Text>
                </Pressable>
              ) : <Text style={styles.infoMuted}>No website provided</Text>}
            </InfoBlock>

            <InfoBlock label="Additional locations">
              <Text style={styles.infoStrong}>{application.multipleLocations ? `${application.locationCount} total locations` : "Single location"}</Text>
              <Text style={styles.infoMuted}>{application.additionalMarkets || "No additional cities provided"}</Text>
            </InfoBlock>
          </View>

          <View style={styles.signalRow}>
            <View style={styles.signal}>
              <Text style={styles.signalLabel}>ADDRESS SIGNAL</Text>
              <Text style={styles.signalValue}>✓ {normalizeSignal(application.addressScreening)}</Text>
            </View>
            <View style={styles.signal}>
              <Text style={styles.signalLabel}>BUSINESS SIGNAL</Text>
              <Text style={styles.signalValue}>✓ {normalizeSignal(application.categoryScreening)}</Text>
            </View>
          </View>

          {application.status === "approved" && (
            <View style={[styles.orderingCard, styles.orderingReady]}>
              <View style={styles.orderingIcon}>
                <Text style={styles.orderingIconText}>✓</Text>
              </View>
              <View style={styles.orderingCopy}>
                <Text style={styles.orderingTitle}>Private catalog ready</Text>
                <Text style={styles.orderingDescription}>
                  This buyer can sign in and order cases now. Approval is the only
                  step — there is no store connection to wait on.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.notesCard}>
            <Text style={styles.notesLabel}>PRIVATE OWNER NOTES</Text>
            <TextInput
              editable={!isBusy}
              maxLength={2000}
              multiline
              onChangeText={setNotes}
              placeholder="Add order needs, follow-up details, or a reason for your decision…"
              placeholderTextColor={colors.muted}
              style={styles.notesInput}
              textAlignVertical="top"
              value={notes}
            />
            <View style={styles.notesFooter}>
              <Text style={styles.characterCount}>{notes.length}/2000</Text>
              <Pressable
                disabled={isBusy}
                onPress={() => perform(application.status, "notes")}
                style={styles.saveNotes}
              >
                {saving === "notes" ? <ActivityIndicator color={colors.rust} size="small" /> : <Text style={styles.saveNotesText}>SAVE NOTES</Text>}
              </Pressable>
            </View>
          </View>

          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!savedMessage && <Text accessibilityRole="alert" style={styles.success}>{savedMessage}</Text>}

          <View style={styles.actions}>
            {application.status !== "approved" && (
              <Pressable
                disabled={isBusy}
                onPress={() => confirmDecision("approved")}
                style={({ pressed }: { pressed: boolean }) => [styles.actionPrimary, pressed && styles.actionPressed, isBusy && styles.disabled]}
              >
                {saving === "approved" ? <ActivityIndicator color={colors.paper} /> : <Text style={styles.actionPrimaryText}>APPROVE ACCOUNT</Text>}
              </Pressable>
            )}
            {application.status !== "declined" && (
              <Pressable
                disabled={isBusy}
                onPress={() => confirmDecision("declined")}
                style={({ pressed }: { pressed: boolean }) => [styles.actionSecondary, pressed && styles.actionPressed, isBusy && styles.disabled]}
              >
                {saving === "declined" ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.actionSecondaryText}>DECLINE</Text>}
              </Pressable>
            )}
            {application.status !== "pending" && (
              <Pressable disabled={isBusy} onPress={() => confirmDecision("pending")} style={styles.pendingButton}>
                <Text style={styles.pendingText}>MOVE TO PENDING</Text>
              </Pressable>
            )}
            {application.status === "approved" && (
              <View style={styles.approvedMessage}><Text style={styles.approvedText}>✓ ACCOUNT APPROVED</Text></View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.chocolate },
  keyboard: { flex: 1, backgroundColor: colors.cream },
  header: {
    minHeight: 62,
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight : 0,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.chocolate,
  },
  backButton: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 6 },
  backArrow: { color: colors.gold, fontFamily: fonts.serif, fontSize: 34, lineHeight: 36 },
  backText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  headerTitle: { color: "#BFAFA4", fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1.4 },
  content: { padding: 18, paddingBottom: 48 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 4 },
  outlineBadge: { minHeight: 25, justifyContent: "center", paddingHorizontal: 9, borderWidth: 1, borderColor: colors.line },
  outlineBadgeText: { color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 0.8 },
  identity: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 14, paddingBottom: 21, borderBottomWidth: 1, borderBottomColor: colors.line },
  monogram: { width: 56, height: 56, alignItems: "center", justifyContent: "center", backgroundColor: colors.rust },
  monogramText: { color: colors.paper, fontFamily: fonts.serif, fontSize: 25 },
  identityCopy: { flex: 1 },
  businessName: { color: colors.chocolate, fontFamily: fonts.serif, fontSize: 27, lineHeight: 31 },
  businessMeta: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },
  received: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 9 },
  grid: { marginTop: 18, borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.line },
  infoBlock: { minHeight: 128, padding: 16, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  infoLabel: { marginBottom: 10, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1.2 },
  infoStrong: { color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 20 },
  infoMuted: { marginTop: 7, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  infoLink: { marginTop: 6, color: colors.rust, fontFamily: fonts.sans, fontSize: 12, textDecorationLine: "underline" },
  infoAction: { marginTop: 12, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 0.7 },
  signalRow: { flexDirection: "row", gap: 9, marginTop: 14 },
  signal: { flex: 1, minHeight: 82, padding: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  signalLabel: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 7, letterSpacing: 0.8 },
  signalValue: { marginTop: 10, color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 16, textTransform: "capitalize" },
  orderingCard: { marginTop: 14, minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  orderingReady: { borderColor: "#B8C9B4", backgroundColor: colors.sagePale },
  orderingIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.chocolate },
  orderingIconText: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 13 },
  orderingCopy: { flex: 1 },
  orderingTitle: { color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 11 },
  orderingDescription: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  notesCard: { marginTop: 14, padding: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  notesLabel: { marginBottom: 10, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1.2 },
  notesInput: { minHeight: 132, padding: 13, borderWidth: 1, borderColor: colors.line, color: colors.ink, backgroundColor: colors.white, fontFamily: fonts.sans, fontSize: 13, lineHeight: 20 },
  notesFooter: { marginTop: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  characterCount: { color: colors.muted, fontFamily: fonts.sans, fontSize: 9 },
  saveNotes: { minWidth: 104, minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.rust },
  saveNotesText: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 0.9 },
  error: { marginTop: 14, padding: 13, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 17 },
  success: { marginTop: 14, padding: 13, color: colors.sage, backgroundColor: colors.sagePale, fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 17 },
  actions: { marginTop: 18, gap: 10 },
  actionPrimary: { minHeight: 58, alignItems: "center", justifyContent: "center", backgroundColor: colors.rust },
  actionPrimaryText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 1.2 },
  actionSecondary: { minHeight: 56, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.paper },
  actionSecondaryText: { color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 1.2 },
  actionPressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  pendingButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  pendingText: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  approvedMessage: { minHeight: 56, alignItems: "center", justifyContent: "center", backgroundColor: colors.sagePale },
  approvedText: { color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 1 },
});
