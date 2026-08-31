import { useState } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";

import { colors, fonts } from "../theme";
import type { SupportCase } from "../types";

type Props = {
  cases: SupportCase[];
  loading: boolean;
  error: string;
  busy: string;
  notice: string;
  showResolved: boolean;
  onShowResolved: (show: boolean) => void;
  onRefresh: () => Promise<void>;
  onRespond: (id: string, reply: string, notes: string, close: boolean) => Promise<void>;
};

const URGENCY = { now: "ANSWER TODAY", today: "TODAY", soon: "WHEN YOU CAN" } as const;

/**
 * What buyers have told us went wrong.
 *
 * Sorted by what it is costing them right now rather than when it arrived, so
 * working from the top is the correct order without anyone deciding it. A case
 * cannot be closed without writing something — somebody is waiting.
 */
export function ProblemsScreen({
  cases, loading, error, busy, notice, showResolved, onShowResolved, onRefresh, onRespond,
}: Props) {
  const [open, setOpen] = useState("");
  const [reply, setReply] = useState("");
  const [notes, setNotes] = useState("");

  const shown = showResolved ? cases : cases.filter((row) => row.status !== "resolved");

  function openCase(row: SupportCase) {
    const next = open === row.id ? "" : row.id;
    setOpen(next);
    setReply(next ? row.reply : "");
    setNotes(next ? row.ownerNotes : "");
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.filters}>
        {[false, true].map((resolved) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: showResolved === resolved }}
            key={String(resolved)}
            onPress={() => onShowResolved(resolved)}
            style={[styles.filter, showResolved === resolved && styles.filterOn]}
          >
            <Text style={[styles.filterText, showResolved === resolved && styles.filterTextOn]}>
              {resolved ? "EVERYTHING" : "STILL OPEN"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void onRefresh()} tintColor={colors.rust} />}
        showsVerticalScrollIndicator={false}
      >
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && cases.length === 0 ? <ActivityIndicator color={colors.rust} style={styles.loading} /> : null}
        {!loading && shown.length === 0 ? (
          <Text style={styles.empty}>
            {showResolved ? "No one has reported a problem yet." : "Nothing outstanding. Every problem raised has been answered."}
          </Text>
        ) : null}

        {shown.map((row) => {
          const expanded = open === row.id;
          return (
            <View key={row.id} style={[styles.case, styles[`u_${row.urgency}` as "u_now"], row.status === "resolved" && styles.done]}>
              <Pressable accessibilityRole="button" onPress={() => openCase(row)}>
                <View style={styles.head}>
                  <Text style={styles.business}>{row.businessName}</Text>
                  <Text style={[styles.urgency, styles[`t_${row.urgency}` as "t_now"]]}>
                    {row.status === "resolved" ? "CLOSED" : URGENCY[row.urgency]}
                  </Text>
                </View>
                <Text style={styles.reason}>{row.reasonLabel}</Text>
                <Text style={styles.meta}>
                  {row.orderNumber > 0 ? `Order #${row.orderNumber} · ` : ""}
                  {row.waitingFor ? `waiting ${row.waitingFor}` : row.status}
                  {row.likelyRefund && row.status !== "resolved" ? " · probably owe money back" : ""}
                </Text>
                <Text numberOfLines={expanded ? undefined : 2} style={styles.message}>{row.message}</Text>
              </Pressable>

              {expanded && (
                <View style={styles.form}>
                  <Text style={styles.label}>What we&apos;re telling them (they get this by email)</Text>
                  <TextInput
                    multiline
                    maxLength={2000}
                    onChangeText={setReply}
                    placeholder="Two cases are on tomorrow's run, no charge."
                    placeholderTextColor={colors.muted}
                    style={[styles.input, styles.multiline]}
                    value={reply}
                  />
                  <Text style={styles.label}>Your own note (they never see this)</Text>
                  <TextInput
                    maxLength={2000}
                    onChangeText={setNotes}
                    placeholder="Third short from the Tuesday pallet"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    value={notes}
                  />
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(busy) || !reply.trim()}
                      onPress={() => void onRespond(row.id, reply, notes, false)}
                      style={[styles.send, (busy || !reply.trim()) && styles.off]}
                    >
                      <Text style={styles.sendText}>{busy === row.id ? "SENDING…" : "SEND THIS REPLY"}</Text>
                    </Pressable>
                    {row.status !== "resolved" && (
                      <Pressable
                        accessibilityRole="button"
                        disabled={Boolean(busy) || !reply.trim()}
                        onPress={() => void onRespond(row.id, reply, notes, true)}
                        style={[styles.close, (busy || !reply.trim()) && styles.off]}
                      >
                        <Text style={styles.closeText}>SEND AND CLOSE</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.cream },
  filters: { flexDirection: "row", gap: 7, paddingHorizontal: 16, paddingVertical: 12 },
  filter: { minHeight: 34, paddingHorizontal: 13, justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  filterOn: { backgroundColor: colors.chocolate, borderColor: colors.chocolate },
  filterText: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 8.8, letterSpacing: 0.9 },
  filterTextOn: { color: colors.cream },

  content: { paddingHorizontal: 16, paddingBottom: 34 },
  notice: { marginBottom: 10, padding: 11, color: "#33482F", backgroundColor: colors.sagePale, fontFamily: fonts.sans, fontSize: 11 },
  error: { marginBottom: 10, padding: 11, color: "#7C2A1C", backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 11 },
  loading: { marginTop: 30 },
  empty: { marginTop: 28, color: colors.muted, fontFamily: fonts.sans, fontSize: 11.5, textAlign: "center", lineHeight: 17 },

  case: { marginBottom: 10, padding: 15, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, backgroundColor: colors.paper },
  u_now: { borderLeftColor: colors.danger },
  u_today: { borderLeftColor: colors.gold },
  u_soon: { borderLeftColor: colors.line },
  done: { opacity: 0.62 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  business: { flex: 1, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 12.5 },
  urgency: { fontFamily: fonts.sansMedium, fontSize: 8.2, letterSpacing: 0.9 },
  t_now: { color: colors.danger },
  t_today: { color: "#8A5716" },
  t_soon: { color: colors.muted },
  reason: { marginTop: 6, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11.5 },
  meta: { marginTop: 3, color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  message: { marginTop: 8, color: colors.ink, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },

  form: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  label: { marginTop: 8, color: colors.muted, fontFamily: fonts.sans, fontSize: 10 },
  input: { marginTop: 6, minHeight: 44, paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontFamily: fonts.sans, fontSize: 11.5, backgroundColor: colors.white },
  multiline: { minHeight: 86, textAlignVertical: "top" },
  actions: { marginTop: 12, gap: 8 },
  send: { minHeight: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.chocolate },
  sendText: { color: colors.white, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  close: { minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.chocolate },
  closeText: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  off: { opacity: 0.45 },
});
