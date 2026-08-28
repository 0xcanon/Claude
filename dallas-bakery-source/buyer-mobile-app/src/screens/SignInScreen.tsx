import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader } from "../components/AppHeader";
import { PrimaryButton } from "../components/PrimaryButton";
import { colors, fonts } from "../theme";

type Props = {
  busy: boolean;
  error: string;
  notice: string;
  onBack: () => void;
  onRequestCode: (email: string) => void;
  onVerifyCode: (email: string, code: string) => void;
  stage: "email" | "code";
  initialEmail?: string;
};

/**
 * Two-step sign-in: the buyer enters the email on their approved application
 * and then the six-digit code emailed to it. No password ever exists, so
 * there is nothing to reset, reuse, or leak.
 */
export function SignInScreen({
  busy,
  error,
  notice,
  onBack,
  onRequestCode,
  onVerifyCode,
  stage,
  initialEmail = "",
}: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.backRow}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>

          <Text style={styles.kicker}>APPROVED BUYER SIGN-IN</Text>
          <Text style={styles.title}>
            {stage === "email" ? "Sign in to your\nwholesale catalog." : "Enter your\nsix-digit code."}
          </Text>
          <Text style={styles.body}>
            {stage === "email"
              ? "Use the email on your approved application. We'll send a six-digit code — there's no password to remember."
              : `We sent a code to ${email}. It expires in 15 minutes.`}
          </Text>

          {stage === "email" ? (
            <View style={styles.field}>
              <Text style={styles.label}>BUSINESS EMAIL</Text>
              <TextInput
                accessibilityLabel="Business email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@business.com"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={email}
              />
              <PrimaryButton
                disabled={!email.trim()}
                label="SEND CODE"
                loading={busy}
                onPress={() => onRequestCode(email.trim())}
              />
            </View>
          ) : (
            <View style={styles.field}>
              <Text style={styles.label}>SIX-DIGIT CODE</Text>
              <TextInput
                accessibilityLabel="Six-digit code"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
                placeholder="000000"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.codeInput]}
                textContentType="oneTimeCode"
                value={code}
              />
              <PrimaryButton
                disabled={code.length !== 6}
                label="SIGN IN"
                loading={busy}
                onPress={() => onVerifyCode(email.trim(), code)}
              />
              <Pressable onPress={() => onRequestCode(email.trim())}>
                <Text style={styles.resend}>Send a new code</Text>
              </Pressable>
            </View>
          )}

          {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  content: { padding: 24, paddingBottom: 48 },
  backRow: { paddingVertical: 8 },
  back: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink },
  kicker: { marginTop: 12, fontFamily: fonts.sans, fontSize: 10, letterSpacing: 1.6, color: colors.sage },
  title: { marginTop: 10, fontFamily: fonts.serif, fontSize: 30, lineHeight: 34, color: colors.ink },
  body: { marginTop: 12, fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.muted },
  field: { marginTop: 28, gap: 10 },
  label: { fontFamily: fonts.sans, fontSize: 10, letterSpacing: 1.3, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  codeInput: { fontSize: 22, letterSpacing: 8, textAlign: "center" },
  resend: { marginTop: 14, textAlign: "center", fontFamily: fonts.sans, fontSize: 12, color: colors.ink, textDecorationLine: "underline" },
  notice: { marginTop: 18, padding: 12, backgroundColor: colors.sagePale, color: colors.sage, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
  error: { marginTop: 12, padding: 12, backgroundColor: colors.rosePale, color: colors.danger, fontFamily: fonts.sans, fontSize: 11, lineHeight: 17 },
});
