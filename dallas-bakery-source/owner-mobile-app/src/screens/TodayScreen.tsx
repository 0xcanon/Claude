import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";
import type { OwnerSummary } from "../types";

type Props = {
  summary: OwnerSummary | null;
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
  onOpenOrders: () => void;
  onOpenProblems: () => void;
  onOpenAccounts: () => void;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The morning screen.
 *
 * Ordered the way the day runs, not the way the data is shaped: what has to
 * be baked, then what is ready to go out, then anything that needs a decision.
 * The bake sheet is the thing the person at the oven actually reads, so it
 * gets the most room.
 */
export function TodayScreen({
  summary, loading, error, onRefresh, onOpenOrders, onOpenProblems, onOpenAccounts,
}: Props) {
  const s = summary?.summary;
  const needsAttention = (summary?.problemsOpen || 0) + (s?.onHold || 0);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void onRefresh()} tintColor={colors.rust} />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.kicker}>THE BAKERY TODAY</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {s && s.toBake > 0 ? "Here's the day." : "Nothing waiting."}
      </Text>
      <Text style={styles.date}>{summary?.today || ""}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!summary && loading ? <ActivityIndicator color={colors.rust} style={styles.loading} /> : null}

      {s && (
        <>
          <View style={styles.grid}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>TO BAKE</Text>
              <Text style={styles.statValue}>{s.cases}</Text>
              <Text style={styles.statDetail}>
                {s.cases === 1 ? "case" : "cases"} across {s.toBake} {s.toBake === 1 ? "order" : "orders"}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>BOXES</Text>
              <Text style={styles.statValue}>{s.boxes}</Text>
              <Text style={styles.statDetail}>to pack and label</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>READY TO SHIP</Text>
              <Text style={styles.statValue}>{s.readyToShip}</Text>
              <Text style={styles.statDetail}>labeled, waiting on UPS</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>OWED</Text>
              <Text style={styles.statValue}>{money(s.owedCents)}</Text>
              <Text style={styles.statDetail}>
                {s.overdueInvoices > 0 ? `${s.overdueInvoices} past due` : "all inside terms"}
              </Text>
            </View>
          </View>

          {s.onHold > 0 && (
            <View style={styles.flag}>
              <Text style={styles.flagText}>
                {s.onHold} {s.onHold === 1 ? "order is" : "orders are"} on hold. Nothing is being baked for
                {s.onHold === 1 ? " it" : " them"} until you take
                {s.onHold === 1 ? " it" : " them"} off hold.
              </Text>
            </View>
          )}

          <Text style={styles.sectionKicker}>BAKE SHEET</Text>
          {summary.bakeSheet.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.empty}>No orders waiting on bread. Enjoy the quiet.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {summary.bakeSheet.map((line) => (
                <View key={line.sku} style={styles.bakeRow}>
                  <Text style={styles.bakeCases}>{line.cases}</Text>
                  <View style={styles.bakeCopy}>
                    <Text style={styles.bakeName}>{line.name}</Text>
                    <Text style={styles.bakeLoaves}>
                      {line.cases === 1 ? "case" : "cases"} · {line.loaves} loaves
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionKicker}>WHAT NEEDS YOU</Text>
          <Pressable accessibilityRole="button" onPress={onOpenOrders} style={styles.link}>
            <Text style={styles.linkTitle}>Orders</Text>
            <Text style={styles.linkDetail}>
              {s.toBake + s.readyToShip} in the queue{s.onHold > 0 ? ` · ${s.onHold} on hold` : ""}
            </Text>
            <Text style={styles.arrow}>→</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onOpenProblems} style={styles.link}>
            <Text style={styles.linkTitle}>Problems</Text>
            <Text style={styles.linkDetail}>
              {summary.problemsOpen === 0
                ? "Nothing outstanding"
                : `${summary.problemsOpen} waiting on an answer`}
            </Text>
            <Text style={styles.arrow}>→</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onOpenAccounts} style={styles.link}>
            <Text style={styles.linkTitle}>New accounts</Text>
            <Text style={styles.linkDetail}>
              {summary.applicationsWaiting === 0
                ? "No one waiting"
                : `${summary.applicationsWaiting} waiting on your decision`}
            </Text>
            <Text style={styles.arrow}>→</Text>
          </Pressable>

          {!summary.ups.connected && (
            <Text style={styles.warn}>
              UPS is not connected, so labels cannot be bought yet.
            </Text>
          )}
          {summary.ups.connected && summary.ups.environment === "test" && (
            <Text style={styles.warn}>
              UPS is in test mode — labels created now are not real shipments.
            </Text>
          )}
          {needsAttention === 0 && s.toBake === 0 && (
            <Text style={styles.calm}>Everything is answered and nothing is waiting to bake.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 24, paddingBottom: 40 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 1.4 },
  title: { marginTop: 9, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 32, lineHeight: 37 },
  date: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 11 },
  error: { marginTop: 14, padding: 12, color: "#7C2A1C", backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 11 },
  loading: { marginTop: 30 },

  grid: { marginTop: 20, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  // Width and margin rather than gap: react-native-web does not apply gap
  // reliably inside a wrapping row, and the cards collapsed to their text.
  stat: { width: "48.5%", minHeight: 112, marginBottom: 11, padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  statLabel: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 8.6, letterSpacing: 1.5 },
  statValue: { marginTop: 8, color: colors.rust, fontFamily: fonts.serif, fontSize: 30, lineHeight: 34 },
  statDetail: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 15 },

  flag: { marginTop: 14, padding: 13, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.paper },
  flagText: { color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },

  sectionKicker: { marginTop: 28, marginBottom: 10, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 1.3 },
  card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  empty: { padding: 16, color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5 },

  bakeRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, borderBottomWidth: 1, borderBottomColor: colors.line },
  bakeCases: { minWidth: 44, color: colors.rust, fontFamily: fonts.serif, fontSize: 30, textAlign: "right" },
  bakeCopy: { flex: 1 },
  bakeName: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12.5 },
  bakeLoaves: { marginTop: 3, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5 },

  link: {
    minHeight: 66, marginBottom: 9, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, justifyContent: "center",
  },
  linkTitle: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12.5 },
  linkDetail: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 10.5 },
  arrow: { position: "absolute", right: 16, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 17 },

  warn: { marginTop: 16, padding: 12, color: "#8A5716", backgroundColor: colors.goldPale, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },
  calm: { marginTop: 18, color: colors.sage, fontFamily: fonts.sans, fontSize: 11.5, textAlign: "center" },
});
