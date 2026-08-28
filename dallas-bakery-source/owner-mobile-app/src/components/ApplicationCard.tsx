import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  businessTypeLabel,
  formatApplicationDate,
} from "../lib/application-utils";
import { colors, fonts, shadow } from "../theme";
import type { WholesaleApplication } from "../types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  application: WholesaleApplication;
  onPress: () => void;
};

export function ApplicationCard({ application, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review ${application.businessName}`}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.badges}>
        <StatusBadge status={application.status} />
        <View style={styles.signalBadge}>
          <Text style={styles.signalText}>
            {application.screeningStatus === "auto_matched" ? "AUTO-MATCHED" : "CHECK DETAILS"}
          </Text>
        </View>
        {application.multipleLocations && (
          <View style={styles.locationBadge}>
            <Text style={styles.locationText}>{application.locationCount} LOCATIONS</Text>
          </View>
        )}
      </View>

      <View style={styles.headingRow}>
        <View style={styles.monogram}>
          <Text style={styles.monogramText}>{application.businessName.trim().slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.name}>{application.businessName}</Text>
          <Text style={styles.meta}>{businessTypeLabel(application.businessType)} · {application.city}, {application.state}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </View>

      <View style={styles.divider} />
      <View style={styles.footer}>
        <View style={styles.footerCopy}>
          <Text style={styles.footerLabel}>CONTACT</Text>
          <Text style={styles.contact} numberOfLines={1}>{application.contactName}</Text>
        </View>
        <View style={[styles.footerCopy, styles.received]}>
          <Text style={styles.footerLabel}>RECEIVED</Text>
          <Text style={styles.date}>{formatApplicationDate(application.createdAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    ...shadow,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 16, paddingBottom: 3 },
  signalBadge: {
    minHeight: 25,
    justifyContent: "center",
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.line,
  },
  signalText: { color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 0.8 },
  locationBadge: {
    minHeight: 25,
    justifyContent: "center",
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.line,
  },
  locationText: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 0.8 },
  headingRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  monogram: { width: 46, height: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.rust },
  monogramText: { color: colors.paper, fontFamily: fonts.serif, fontSize: 21 },
  headingCopy: { flex: 1 },
  name: { color: colors.ink, fontFamily: fonts.serif, fontSize: 20, lineHeight: 24 },
  meta: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },
  arrow: { color: colors.rust, fontFamily: fonts.serif, fontSize: 34, lineHeight: 34 },
  divider: { height: 1, backgroundColor: colors.line },
  footer: { flexDirection: "row", padding: 14 },
  footerCopy: { width: "43%" },
  received: { width: "57%", alignItems: "flex-end" },
  footerLabel: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8, letterSpacing: 1.1 },
  contact: { marginTop: 5, color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 11 },
  date: { marginTop: 5, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, textAlign: "right" },
});
