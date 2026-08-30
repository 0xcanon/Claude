import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { BrandLockup } from "../components/BrandLockup";
import { PrimaryButton } from "../components/PrimaryButton";
import { submitWholesaleApplication } from "../lib/api";
import { colors, fonts } from "../theme";
import type { ApplicationInput } from "../types";

type Props = {
  onBack: () => void;
  onSubmitted: (trackingToken: string) => Promise<void>;
};

const businessTypes = [
  ["restaurant", "Restaurant or caterer"],
  ["grocery", "Grocery or food market"],
  ["hospitality", "Hotel or hospitality"],
  ["institution", "School, hospital, or institution"],
  ["food-distributor", "Food distributor"],
] as const;

const initial: ApplicationInput = {
  contactName: "",
  businessName: "",
  businessType: "",
  email: "",
  phone: "",
  website: "",
  storeAddress: { street: "", street2: "", city: "", state: "TX", zip: "" },
  multipleLocations: false,
  locationCount: 1,
  additionalMarkets: "",
  privacyAgreement: false,
};

export function ApplicationScreen({ onBack, onSubmitted }: Props) {
  const startedAt = useRef(Date.now());
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<ApplicationInput>(initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setAddress(key: keyof ApplicationInput["storeAddress"], value: string) {
    setForm((current) => ({
      ...current,
      storeAddress: { ...current.storeAddress, [key]: value },
    }));
  }

  function continueToAddress() {
    setError("");
    if (
      !form.contactName.trim() || !form.businessName.trim() || !form.businessType ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ||
      form.phone.replace(/\D/g, "").length < 7
    ) {
      setError("Complete your name, business type, business email, and phone number.");
      return;
    }
    setStep(2);
  }

  async function submit() {
    setError("");
    const address = form.storeAddress;
    if (
      !address.street.trim() || !address.city.trim() ||
      !/^[A-Za-z]{2}$/.test(address.state.trim()) ||
      !/^\d{5}(-\d{4})?$/.test(address.zip.trim())
    ) {
      setError("Enter the complete commercial storefront address where deliveries will arrive.");
      return;
    }
    if (!form.privacyAgreement) {
      setError("Please agree to the wholesale terms and privacy notice to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const elapsed = Date.now() - startedAt.current;
      if (elapsed < 1300) await new Promise((resolve) => setTimeout(resolve, 1300 - elapsed));
      const result = await submitWholesaleApplication({
        ...form,
        email: form.email.trim().toLowerCase(),
        storeAddress: { ...address, state: address.state.trim().toUpperCase() },
      }, Math.max(1300, Date.now() - startedAt.current));
      if (result.trackingToken) {
        await onSubmitted(result.trackingToken);
        return;
      }
      // Already-submitted requests come back without a tracking credential
      // on purpose; the decision is emailed to the business address instead.
      setNotice(result.message || "This request is already in review. We'll email the decision to your business email.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your application could not be sent. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" hitSlop={10} onPress={step === 1 ? onBack : () => setStep(1)}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <BrandLockup compact />
        <Text style={styles.step}>STEP {step} OF 2</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.progress}><View style={[styles.progressFill, { width: step === 1 ? "50%" : "100%" }]} /></View>
          <Text style={styles.kicker}>ABOUT TWO MINUTES</Text>
          <Text style={styles.title}>{step === 1 ? "Tell us about\nyour business." : "Where should we\ndeliver?"}</Text>
          <Text style={styles.description}>
            {step === 1
              ? "Your primary store becomes your first delivery location. Add other stores after approval."
              : "Use the relevant commercial food-business storefront that will receive Dallas Bakery orders."}
          </Text>

          {step === 1 ? (
            <>
              <Field label="YOUR NAME" value={form.contactName} onChangeText={(value) => setField("contactName", value)} autoComplete="name" />
              <Field label="BUSINESS NAME" value={form.businessName} onChangeText={(value) => setField("businessName", value)} autoComplete="organization" />
              <Text style={styles.label}>BUSINESS TYPE</Text>
              <View style={styles.typeList}>
                {businessTypes.map(([value, label]) => (
                  <Pressable key={value} onPress={() => setField("businessType", value)} style={[styles.type, form.businessType === value && styles.typeActive]}>
                    <View style={[styles.radio, form.businessType === value && styles.radioActive]} />
                    <Text style={styles.typeText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="BUSINESS EMAIL" value={form.email} onChangeText={(value) => setField("email", value)} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
              <Field label="PHONE" value={form.phone} onChangeText={(value) => setField("phone", value)} autoComplete="tel" keyboardType="phone-pad" />
              <Field label="WEBSITE OR GOOGLE LISTING · OPTIONAL" value={form.website} onChangeText={(value) => setField("website", value)} autoCapitalize="none" keyboardType="url" />
            </>
          ) : (
            <>
              <Field label="BUSINESS STREET ADDRESS" value={form.storeAddress.street} onChangeText={(value) => setAddress("street", value)} autoComplete="street-address" />
              <Field label="SUITE · OPTIONAL" value={form.storeAddress.street2} onChangeText={(value) => setAddress("street2", value)} />
              <Field label="CITY" value={form.storeAddress.city} onChangeText={(value) => setAddress("city", value)} autoComplete="address-line2" />
              <View style={styles.row}>
                <View style={styles.smallField}><Field label="STATE" value={form.storeAddress.state} onChangeText={(value) => setAddress("state", value.slice(0, 2))} autoCapitalize="characters" /></View>
                <View style={styles.largeField}><Field label="ZIP" value={form.storeAddress.zip} onChangeText={(value) => setAddress("zip", value)} keyboardType="number-pad" /></View>
              </View>

              <View style={styles.toggleCard}>
                <Switch
                  onValueChange={(value) => {
                    setField("multipleLocations", value);
                    if (!value) setField("locationCount", 1);
                    if (value && form.locationCount < 2) setField("locationCount", 2);
                  }}
                  thumbColor={colors.paper}
                  trackColor={{ false: colors.line, true: colors.rust }}
                  value={form.multipleLocations}
                />
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleTitle}>We have more than one location</Text>
                  <Text style={styles.toggleText}>Your locations stay under one approved business account.</Text>
                </View>
              </View>
              {form.multipleLocations && (
                <>
                  <Field label="TOTAL LOCATIONS" value={String(form.locationCount)} onChangeText={(value) => setField("locationCount", Math.max(2, Math.min(500, Number(value) || 2)))} keyboardType="number-pad" />
                  <Field label="OTHER STORE CITIES · OPTIONAL" value={form.additionalMarkets} onChangeText={(value) => setField("additionalMarkets", value)} />
                </>
              )}

              <Pressable onPress={() => setField("privacyAgreement", !form.privacyAgreement)} style={styles.consent}>
                <View style={[styles.checkbox, form.privacyAgreement && styles.checkboxActive]}>
                  {form.privacyAgreement && <Text style={styles.check}>✓</Text>}
                </View>
                <Text style={styles.consentText}>
                  I agree to the wholesale terms and understand how Dallas Bakery handles my information.
                </Text>
              </Pressable>
              <View style={styles.links}>
                <Text onPress={() => void Linking.openURL("https://dallasbakery.net/terms")} style={styles.link}>Wholesale terms</Text>
                <Text onPress={() => void Linking.openURL("https://dallasbakery.net/privacy")} style={styles.link}>Privacy notice</Text>
              </View>
            </>
          )}

          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
          <PrimaryButton
            label={step === 1 ? "CONTINUE" : "SEND ACCOUNT REQUEST"}
            loading={submitting}
            onPress={step === 1 ? continueToAddress : () => void submit()}
          />
          <Text style={styles.private}>Wholesale pricing stays private until Dallas Bakery approves the business account.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string };

function Field({ label, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#A99B90"
        style={styles.input}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  header: { minHeight: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper },
  back: { width: 34, color: colors.rust, fontFamily: fonts.sans, fontSize: 35, lineHeight: 40 },
  step: { width: 62, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 0.8, textAlign: "right" },
  content: { padding: 18, paddingBottom: 42 },
  progress: { height: 3, marginBottom: 30, backgroundColor: colors.line },
  progressFill: { height: 3, backgroundColor: colors.rust },
  kicker: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9.8, letterSpacing: 1.4 },
  title: { marginTop: 9, color: colors.chocolate, fontFamily: fonts.serif, fontSize: 36, lineHeight: 39 },
  description: { marginTop: 10, marginBottom: 24, color: colors.muted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 18 },
  field: { marginBottom: 14 },
  label: { marginBottom: 7, color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 9.4, letterSpacing: 0.9 },
  input: { minHeight: 52, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line, color: colors.ink, backgroundColor: colors.white, fontFamily: fonts.sans, fontSize: 13 },
  typeList: { marginBottom: 14, gap: 7 },
  type: { minHeight: 48, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  typeActive: { borderColor: colors.rust, backgroundColor: "#FFF4EC" },
  radio: { width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  radioActive: { borderWidth: 4, borderColor: colors.rust },
  typeText: { color: colors.ink, fontFamily: fonts.sans, fontSize: 11 },
  row: { flexDirection: "row", gap: 10 },
  smallField: { flex: 0.7 },
  largeField: { flex: 1.3 },
  toggleCard: { minHeight: 80, marginBottom: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  toggleCopy: { flex: 1 },
  toggleTitle: { color: colors.chocolate, fontFamily: fonts.sansMedium, fontSize: 11 },
  toggleText: { marginTop: 4, color: colors.muted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14 },
  consent: { marginTop: 5, marginBottom: 9, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  checkboxActive: { borderColor: colors.rust, backgroundColor: colors.rust },
  check: { color: colors.paper, fontFamily: fonts.sansMedium, fontSize: 11 },
  consentText: { flex: 1, color: colors.muted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  links: { marginBottom: 17, flexDirection: "row", gap: 18 },
  link: { color: colors.rust, fontFamily: fonts.sansMedium, fontSize: 9, textDecorationLine: "underline" },
  error: { marginBottom: 12, padding: 12, color: colors.danger, backgroundColor: colors.rosePale, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  notice: { marginBottom: 12, padding: 12, color: colors.sage, backgroundColor: colors.sagePale, fontFamily: fonts.sans, fontSize: 10, lineHeight: 16 },
  private: { marginTop: 13, color: colors.muted, fontFamily: fonts.sans, fontSize: 9, lineHeight: 14, textAlign: "center" },
});
