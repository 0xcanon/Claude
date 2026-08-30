import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageHeader } from "../components/PageHeader";
import { formatDate } from "../lib/format";
import { askToCancelOrder, getSupportCases, reportProblem } from "../lib/storefront";
import { colors, fonts } from "../theme";
import type { BuyerSession, BuyerSupportCase, SupportReasonOption } from "../types";

type Props = {
  onBack: () => void;
  session: BuyerSession;
  /** Set when the buyer came here from one order rather than from Account. */
  order?: { id: string; name: string; canRequestCancellation: boolean; cancelRequested: boolean };
};

/**
 * "Something went wrong with my order."
 *
 * The reasons are a fixed list rather than a blank box, because a blank box
 * gets "the bread was bad" and a list gets "the order was short", which the
 * bakery can act on before lunch. The prompt under each one asks for the
 * detail that decides what happens next.
 *
 * Nothing here promises a refund. The bakery answers, and the answer arrives
 * by email as well as in this screen.
 */
export function ReportProblemScreen({ onBack, session, order }: Props) {
  const [reasons, setReasons] = useState<SupportReasonOption[]>([]);
  const [cases, setCases] = useState<BuyerSupportCase[]>([]);
  const [maxLength, setMaxLength] = useState(2000);
  const [chosen, setChosen] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSupportCases(session);
      setReasons(data.reasons || []);
      setCases(data.cases || []);
      setMaxLength(data.maxMessageLength || 2000);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  // load awaits its request before setting anything.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const picked = reasons.find((reason) => reason.key === chosen);
  // A reason that only makes sense against an order can only be sent from an
  // order. Reached from Account, those are hidden rather than shown broken.
  const offered = order ? reasons : reasons.filter((reason) => !reason.needsOrder);

  async function send() {
    if (!picked || !message.trim()) return;
    setSending(true);
    setError("");
    try {
      const result = await reportProblem(session, {
        reason: picked.key,
        message: message.trim(),
        orderId: order?.id,
      });
      setSent(result.message);
      setChosen("");
      setMessage("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be sent.");
    } finally {
      setSending(false);
    }
  }

  function askToCancel() {
    if (!order) return;
    Alert.alert(
      `Cancel order ${order.name}?`,
      "We'll take a look straight away. If it hasn't been baked yet we'll cancel it and put the money back; if it has, we'll call you.",
      [
        { text: "Keep the order", style: "cancel" },
        {
          text: "Ask to cancel",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSending(true);
              setError("");
              try {
                const result = await askToCancelOrder(session, order.id, message.trim());
                setSent(result.message);
                setMessage("");
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "That could not be sent.");
              } finally {
                setSending(false);
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <PageHeader backLabel="Back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>{order ? `ORDER ${order.name}` : "YOUR ACCOUNT"}</Text>
        <Text accessibilityRole="header" style={styles.title}>Tell us what went wrong.</Text>
        <Text style={styles.intro}>
          A person at the bakery reads these. Say what happened and we&apos;ll come back to you by
          email — usually the same day.
        </Text>

        {sent ? <Text style={styles.sent}>{sent}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {order?.cancelRequested ? (
          <View style={styles.cancelNote}>
            <Text style={styles.cancelNoteText}>
              You&apos;ve asked us to cancel this order. We&apos;re on it — we&apos;ll confirm today.
            </Text>
          </View>
        ) : order?.canRequestCancellation ? (
          <Pressable
            accessibilityRole="button"
            disabled={sending}
            onPress={askToCancel}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelButtonText}>ASK US TO CANCEL THIS ORDER</Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionKicker}>WHAT HAPPENED</Text>
        {loading ? (
          <ActivityIndicator color={colors.rust} style={styles.loading} />
        ) : (
          <View style={styles.reasons}>
            {offered.map((reason) => {
              const active = chosen === reason.key;
              return (
                <Pressable
                  accessibilityLabel={reason.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  key={reason.key}
                  onPress={() => { setChosen(active ? "" : reason.key); setSent(""); }}
                  style={[styles.reason, active && styles.reasonActive]}
                >
                  <Text style={[styles.reasonLabel, active && styles.reasonLabelActive]}>
                    {reason.label}
                  </Text>
                  {active && <Text style={styles.reasonPrompt}>{reason.prompt}</Text>}
                </Pressable>
              );
            })}
          </View>
        )}

        {picked ? (
          <View style={styles.formCard}>
            <TextInput
              accessibilityLabel="What happened"
              multiline
              maxLength={maxLength}
              onChangeText={setMessage}
              placeholder={picked.prompt}
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={message}
            />
            <Pressable
              accessibilityRole="button"
              disabled={sending || !message.trim()}
              onPress={() => void send()}
              style={({ pressed }) => [
                styles.send,
                (sending || !message.trim()) && styles.sendDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.sendText}>{sending ? "SENDING…" : "SEND THIS TO THE BAKERY"}</Text>
            </Pressable>
          </View>
        ) : null}

        {cases.length > 0 && (
          <>
            <Text style={styles.sectionKicker}>WHAT YOU&apos;VE TOLD US BEFORE</Text>
            <View style={styles.history}>
              {cases.map((row) => (
                <View key={row.id} style={styles.case}>
                  <View style={styles.caseHead}>
                    <Text style={styles.caseReason}>{row.reasonLabel}</Text>
                    <Text style={[styles.caseStatus, row.status === "resolved" && styles.caseStatusDone]}>
                      {row.status === "resolved" ? "SORTED" : row.status === "answered" ? "ANSWERED" : "WITH US"}
                    </Text>
                  </View>
                  <Text style={styles.caseWhen}>
                    {row.orderNumber ? `Order #${row.orderNumber} · ` : ""}
                    {formatDate(row.openedAt)}
                    {row.waitingFor ? ` · waiting ${row.waitingFor}` : ""}
                  </Text>
                  <Text style={styles.caseMessage}>{row.message}</Text>
                  {row.reply ? (
                    <View style={styles.reply}>
                      <Text style={styles.replyKicker}>DALLAS BAKERY</Text>
                      <Text style={styles.replyText}>{row.reply}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        )}
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
  sent: { marginTop: 16, padding: 13, color: "#375238", backgroundColor: "#DCEBD8", fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  error: { marginTop: 16, padding: 13, color: "#7C2A1C", backgroundColor: "#F4D7D0", fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  loading: { marginTop: 24 },

  cancelNote: { marginTop: 18, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.paper },
  cancelNoteText: { color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  cancelButton: { marginTop: 18, minHeight: 52, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#9A3524" },
  cancelButtonText: { color: "#9A3524", fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.2 },
  pressed: { opacity: 0.75 },

  sectionKicker: { marginTop: 30, marginBottom: 10, color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.6, letterSpacing: 1.2 },
  reasons: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  reason: { minHeight: 54, paddingHorizontal: 15, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line },
  reasonActive: { backgroundColor: colors.cream },
  reasonLabel: { color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11.5 },
  reasonLabelActive: { fontFamily: fonts.sansMedium },
  reasonPrompt: { marginTop: 7, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },

  formCard: { marginTop: 14, padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  input: { minHeight: 104, color: colors.ink, fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 18, textAlignVertical: "top" },
  send: { marginTop: 14, minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: colors.chocolate },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.2 },

  history: { gap: 10 },
  case: { padding: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  caseHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  caseReason: { flex: 1, color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11.5 },
  caseStatus: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 8.6, letterSpacing: 1 },
  caseStatusDone: { color: colors.sage },
  caseWhen: { marginTop: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 9.5 },
  caseMessage: { marginTop: 9, color: colors.ink, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  reply: { marginTop: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.sage, backgroundColor: colors.cream },
  replyKicker: { color: colors.sage, fontFamily: fonts.sansMedium, fontSize: 8.6, letterSpacing: 1 },
  replyText: { marginTop: 6, color: colors.chocolate, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
});
