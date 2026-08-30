import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApplicationCard } from "../components/ApplicationCard";
import { BrandLockup } from "../components/BrandLockup";
import { StatCard } from "../components/StatCard";
import {
  countApplications,
  filterApplications,
  statusLabel,
} from "../lib/application-utils";
import { colors, fonts } from "../theme";
import type {
  ApplicationFilter,
  OwnerUser,
  ShippingSettings,
  WholesaleApplication,
} from "../types";

type Props = {
  applications: WholesaleApplication[];
  error: string;
  loading: boolean;
  onLogout: () => Promise<void>;
  onOpenApplication: (id: string) => void;
  onRefresh: () => Promise<void>;
  onSaveShipping: (rateCents: number, unitsPerBox: number) => Promise<void>;
  shipping: ShippingSettings | null;
  shippingError: string;
  shippingSaving: boolean;
  user: OwnerUser;
};

const filters: ApplicationFilter[] = ["pending", "approved", "declined", "all"];

export function DashboardScreen({
  applications,
  error,
  loading,
  onLogout,
  onOpenApplication,
  onRefresh,
  onSaveShipping,
  shipping,
  shippingError,
  shippingSaving,
  user,
}: Props) {
  const [filter, setFilter] = useState<ApplicationFilter>("pending");
  const [query, setQuery] = useState("");
  const [shippingRate, setShippingRate] = useState("");
  const [unitsPerBox, setUnitsPerBox] = useState("");
  const [shippingMessage, setShippingMessage] = useState("");
  const [shippingInputError, setShippingInputError] = useState("");
  const counts = useMemo(() => countApplications(applications), [applications]);
  const visible = useMemo(
    () => filterApplications(applications, filter, query),
    [applications, filter, query],
  );

  useEffect(() => {
    if (!shipping) return;
    setShippingRate((shipping.rateCents / 100).toFixed(2));
    setUnitsPerBox(String(shipping.unitsPerBox));
  }, [shipping?.rateCents, shipping?.unitsPerBox]);

  async function saveLiveShipping() {
    setShippingInputError("");
    setShippingMessage("");
    const dollars = Number(shippingRate);
    const boxSize = Number(unitsPerBox);
    if (!shippingRate.trim() || !unitsPerBox.trim() || !Number.isFinite(dollars) || dollars < 0 || !Number.isInteger(boxSize) || boxSize < 1) {
      setShippingInputError("Enter a valid dollar amount and whole-number box size.");
      return;
    }
    try {
      await onSaveShipping(Math.round(dollars * 100), boxSize);
      setShippingMessage("Live shipping updated everywhere.");
    } catch {
      // The owner-visible API error is rendered below.
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BrandLockup compact light />
        <View style={styles.account}>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName} numberOfLines={1}>{user.displayName}</Text>
            <Text style={styles.accountEmail} numberOfLines={1}>{user.email}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.signOut}>
            <Text style={styles.signOutText}>SIGN OUT</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            colors={[colors.rust]}
            onRefresh={onRefresh}
            refreshing={loading && applications.length > 0}
            tintColor={colors.rust}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>WHOLESALE APPLICATIONS</Text>
          <Text style={styles.title}>Account approvals</Text>
          <Text style={styles.description}>Review screening signals and approve the right food businesses.</Text>
        </View>

        <View style={styles.shippingCard}>
          <Text style={styles.shippingKicker}>LIVE ORDER SETTINGS</Text>
          <Text style={styles.shippingTitle}>Box shipping</Text>
          <Text style={styles.shippingDescription}>
            {shipping
              ? `${shipping.formattedRate} for each box of up to ${shipping.unitsPerBox} units. Partial boxes count as a full box.`
              : "Loading the current shipping rate…"}
          </Text>
          <View style={styles.shippingInputs}>
            <View style={styles.shippingField}>
              <Text style={styles.shippingLabel}>RATE PER BOX</Text>
              <View style={styles.moneyInput}>
                <Text style={styles.currency}>$</Text>
                <TextInput
                  accessibilityLabel="Shipping dollars per box"
                  editable={!shippingSaving}
                  keyboardType="decimal-pad"
                  onChangeText={setShippingRate}
                  style={styles.shippingInput}
                  value={shippingRate}
                />
              </View>
            </View>
            <View style={styles.shippingField}>
              <Text style={styles.shippingLabel}>UNITS PER BOX</Text>
              <TextInput
                accessibilityLabel="Units per shipping box"
                editable={!shippingSaving}
                keyboardType="number-pad"
                onChangeText={setUnitsPerBox}
                style={[styles.shippingInput, styles.boxInput]}
                value={unitsPerBox}
              />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!shipping || shippingSaving}
            onPress={saveLiveShipping}
            style={({ pressed }) => [styles.shippingButton, pressed && styles.shippingButtonPressed, (!shipping || shippingSaving) && styles.shippingButtonDisabled]}
          >
            {shippingSaving ? <ActivityIndicator color={colors.paper} /> : <Text style={styles.shippingButtonText}>SAVE LIVE SHIPPING</Text>}
          </Pressable>
          {!!(shippingInputError || shippingError) && <Text style={styles.shippingError}>{shippingInputError || shippingError}</Text>}
          {!!shippingMessage && !shippingError && <Text style={styles.shippingSuccess}>{shippingMessage}</Text>}
        </View>

        <View style={styles.stats}>
          <StatCard label="Waiting" value={counts.pending} detail="Needs your decision" />
          <StatCard label="Approved" value={counts.approved} detail="Wholesale accounts" />
          <StatCard label="Multi-location" value={counts.multiLocation} detail="Businesses with 2+ stores" />
          <StatCard label="Total requests" value={counts.total} detail="All time" />
        </View>

        <ScrollView
          horizontal
          contentContainerStyle={styles.filters}
          showsHorizontalScrollIndicator={false}
        >
          {filters.map((option) => {
            const count = option === "all" ? counts.total : counts[option];
            const active = option === filter;
            return (
              <Pressable
                accessibilityRole="button"
                key={option}
                onPress={() => setFilter(option)}
                style={[styles.filter, active && styles.filterActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {option === "all" ? "ALL" : statusLabel(option).toUpperCase()}
                </Text>
                <Text style={[styles.filterCount, active && styles.filterCountActive]}>{count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.searchRow}>
          <Text style={styles.searchLabel}>SEARCH</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Business, contact, city…"
            placeholderTextColor="#A99B90"
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          {!!query && (
            <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery("")}>
              <Text style={styles.clear}>×</Text>
            </Pressable>
          )}
        </View>

        {!!error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={onRefresh}><Text style={styles.retry}>TRY AGAIN</Text></Pressable>
          </View>
        )}

        {loading && applications.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.rust} size="large" />
            <Text style={styles.loadingText}>Loading applications…</Text>
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Text style={styles.emptyCheck}>✓</Text></View>
            <Text style={styles.emptyTitle}>{filter === "pending" && !query ? "You’re all caught up." : "No applications found."}</Text>
            <Text style={styles.emptyCopy}>{filter === "pending" && !query ? "New wholesale requests will appear here automatically." : "Try another status or search term."}</Text>
          </View>
        ) : (
          visible.map((application) => (
            <ApplicationCard
              application={application}
              key={application.id}
              onPress={() => onOpenApplication(application.id)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.chocolate },
  header: {
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight : 0,
    paddingHorizontal: 18,
    paddingBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.chocolate,
  },
  account: { flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 10 },
  accountCopy: { maxWidth: 114, alignItems: "flex-end" },
  accountName: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 9 },
  accountEmail: { marginTop: 2, color: "#BAA99D", fontFamily: fonts.sans, fontSize: 9.8 },
  signOut: { minHeight: 40, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: colors.lineDark },
  signOutText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 0.7 },
  content: { paddingHorizontal: 18, paddingTop: 35, paddingBottom: 48, backgroundColor: colors.cream },
  titleBlock: { marginBottom: 26 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.9 },
  title: { marginTop: 12, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 37, lineHeight: 42 },
  description: { marginTop: 10, maxWidth: 330, color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 21 },
  shippingCard: { marginBottom: 22, padding: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  shippingKicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 1.4 },
  shippingTitle: { marginTop: 8, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 25 },
  shippingDescription: { marginTop: 7, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  shippingInputs: { marginTop: 17, flexDirection: "row", gap: 10 },
  shippingField: { flex: 1 },
  shippingLabel: { marginBottom: 7, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 0.9 },
  moneyInput: { minHeight: 48, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  currency: { paddingLeft: 12, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 13 },
  shippingInput: { flex: 1, minHeight: 46, paddingHorizontal: 10, color: colors.ink, fontFamily: fonts.sans, fontSize: 14 },
  boxInput: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  shippingButton: { minHeight: 50, marginTop: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.rust },
  shippingButtonPressed: { opacity: 0.75 },
  shippingButtonDisabled: { opacity: 0.52 },
  shippingButtonText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  shippingError: { marginTop: 10, padding: 10, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  shippingSuccess: { marginTop: 10, padding: 10, color: colors.sage, backgroundColor: colors.sagePale, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  stats: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10, marginBottom: 24 },
  filters: { gap: 8, paddingRight: 18, marginBottom: 12 },
  filter: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.lineDark, backgroundColor: colors.chocolate },
  filterActive: { borderColor: colors.paper, backgroundColor: colors.paper },
  filterText: { color: "#D0C2B8", fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  filterTextActive: { color: colors.chocolate },
  filterCount: { color: colors.gold, fontFamily: fonts.sansMedium, fontSize: 10 },
  filterCountActive: { color: colors.rust },
  searchRow: { height: 52, marginBottom: 20, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, backgroundColor: colors.chocolate },
  searchLabel: { marginRight: 12, color: "#BEAFA4", fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 1.2 },
  searchInput: { flex: 1, height: 50, color: colors.paper, fontFamily: fonts.sans, fontSize: 13 },
  clear: { paddingLeft: 10, color: colors.gold, fontSize: 25, lineHeight: 28 },
  errorBanner: { marginBottom: 16, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.danger, backgroundColor: colors.rosePale },
  errorText: { color: colors.danger, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 },
  retry: { marginTop: 8, color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  loadingState: { minHeight: 230, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 14, color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
  emptyState: { minHeight: 260, alignItems: "center", justifyContent: "center", padding: 28, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  emptyIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: colors.gold },
  emptyCheck: { color: colors.chocolate, fontSize: 22, fontWeight: "700" },
  emptyTitle: { marginTop: 17, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 23 },
  emptyCopy: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 19, textAlign: "center" },
});
