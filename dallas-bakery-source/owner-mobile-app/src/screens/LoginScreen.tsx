import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BrandLockup } from "../components/BrandLockup";
import { colors, fonts } from "../theme";
import type { MobileSession } from "../types";
import { signIn } from "../lib/api";

type Props = {
  onSignedIn: (session: MobileSession) => Promise<void>;
};

export function LoginScreen({ onSignedIn }: Props) {
  const [email, setEmail] = useState("sales@dallasbakery.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter your owner email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const session = await signIn(email.trim(), password);
      await onSignedIn(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <BrandLockup />
        </View>

        <View style={styles.intro}>
          <Text style={styles.kicker}>PRIVATE WHOLESALE ACCESS</Text>
          <Text style={styles.title}>Approvals, wherever you are.</Text>
          <Text style={styles.description}>
            Review real businesses, manage locations, and protect Dallas Bakery wholesale pricing.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formKicker}>WELCOME BACK</Text>
          <Text style={styles.formTitle}>Sign in to approvals.</Text>

          <Text style={styles.label}>OWNER EMAIL</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!loading}
            inputMode="email"
            onChangeText={setEmail}
            placeholder="sales@dallasbakery.com"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <View style={styles.passwordRow}>
            <TextInput
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!loading}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              placeholder="Your private password"
              placeholderTextColor={colors.muted}
              returnKeyType="go"
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
              value={password}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              hitSlop={8}
              onPress={() => setShowPassword((current) => !current)}
              style={styles.showButton}
            >
              <Text style={styles.showText}>{showPassword ? "HIDE" : "SHOW"}</Text>
            </Pressable>
          </View>

          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}

          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={submit}
            style={({ pressed }: { pressed: boolean }) => [styles.submit, pressed && styles.submitPressed, loading && styles.disabled]}
          >
            {loading ? (
              <ActivityIndicator color={colors.paper} />
            ) : (
              <>
                <Text style={styles.submitText}>OPEN OWNER PORTAL</Text>
                <Text style={styles.submitArrow}>→</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.securityNote}>Five failed attempts temporarily lock sign-in for 15 minutes.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: Platform.OS === "android" ? 46 : 68, paddingBottom: 36 },
  brandRow: { marginBottom: 44 },
  intro: { marginBottom: 30 },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 2.2 },
  title: { marginTop: 15, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 42, lineHeight: 47 },
  description: { marginTop: 16, color: colors.muted, fontFamily: fonts.sans, fontSize: 15, lineHeight: 24 },
  formCard: { padding: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  formKicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.9 },
  formTitle: { marginTop: 8, marginBottom: 24, color: colors.ink, fontFamily: fonts.serif, fontSize: 26, lineHeight: 31 },
  label: { marginTop: 16, marginBottom: 8, color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.3 },
  input: { height: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, color: colors.ink, backgroundColor: colors.white, fontFamily: fonts.sans, fontSize: 15 },
  passwordRow: { height: 52, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  passwordInput: { flex: 1, height: 50, paddingHorizontal: 14, color: colors.ink, fontFamily: fonts.sans, fontSize: 15 },
  showButton: { minWidth: 62, height: 50, alignItems: "center", justifyContent: "center" },
  showText: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1 },
  error: { marginTop: 14, color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 18 },
  submit: { height: 56, marginTop: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, backgroundColor: colors.rust },
  submitPressed: { backgroundColor: colors.rustDark },
  submitText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 1.4 },
  submitArrow: { color: colors.paper, fontSize: 23 },
  disabled: { opacity: 0.68 },
  securityNote: { marginTop: 13, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15, textAlign: "center" },
});
