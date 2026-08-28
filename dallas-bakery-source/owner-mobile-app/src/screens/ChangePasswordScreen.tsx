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
import { changePassword } from "../lib/api";
import { colors, fonts } from "../theme";

type Props = {
  token: string;
  onComplete: () => Promise<void>;
  onCancel: () => Promise<void>;
};

export function ChangePasswordScreen({ token, onComplete, onCancel }: Props) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (password.length < 14 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Use at least 14 characters with a letter and a number.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await changePassword(token, password);
      await onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The password could not be updated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BrandLockup />
        <View style={styles.card}>
          <Text style={styles.kicker}>SECURE YOUR ACCOUNT</Text>
          <Text style={styles.title}>Choose your private password.</Text>
          <Text style={styles.copy}>Your temporary password worked. Replace it once before opening wholesale applications.</Text>

          <Text style={styles.label}>NEW PASSWORD</Text>
          <TextInput
            autoComplete="new-password"
            editable={!loading}
            onChangeText={setPassword}
            placeholder="14+ characters"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Text style={styles.label}>CONFIRM PASSWORD</Text>
          <TextInput
            autoComplete="new-password"
            editable={!loading}
            onChangeText={setConfirmation}
            onSubmitEditing={submit}
            placeholder="Enter it again"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            secureTextEntry
            style={styles.input}
            value={confirmation}
          />
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

          <Pressable disabled={loading} onPress={submit} style={({ pressed }: { pressed: boolean }) => [styles.submit, pressed && styles.pressed]}>
            {loading ? <ActivityIndicator color={colors.paper} /> : <Text style={styles.submitText}>SAVE PRIVATE PASSWORD</Text>}
          </Pressable>
          <Pressable disabled={loading} onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>SIGN OUT</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: Platform.OS === "android" ? 48 : 70, paddingBottom: 36 },
  card: { marginTop: 52, padding: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.9 },
  title: { marginTop: 12, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 31, lineHeight: 36 },
  copy: { marginTop: 13, marginBottom: 13, color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 22 },
  label: { marginTop: 16, marginBottom: 8, color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.3 },
  input: { height: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, color: colors.ink, backgroundColor: colors.white, fontFamily: fonts.sans, fontSize: 15 },
  error: { marginTop: 14, color: colors.danger, fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 18 },
  submit: { height: 56, marginTop: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.rust },
  submitText: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 1.3 },
  pressed: { backgroundColor: colors.rustDark },
  cancel: { height: 50, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 1.2 },
});
