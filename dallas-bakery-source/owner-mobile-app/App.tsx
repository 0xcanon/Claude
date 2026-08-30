import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import { BrandLockup } from "./src/components/BrandLockup";
import {
  ApiError,
  getApplications,
  getShippingSettings,
  registerPushToken,
  unregisterPushToken,
  updateShippingSettings,
} from "./src/lib/api";
import { configureForegroundBehaviour, devicePlatform, getPushToken } from "./src/lib/push";
import { clearSession, loadSession, saveSession } from "./src/lib/secure-session";
import { ApplicationDetailScreen } from "./src/screens/ApplicationDetailScreen";
import { ChangePasswordScreen } from "./src/screens/ChangePasswordScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { colors, fonts } from "./src/theme";
import type { MobileSession, ShippingSettings, WholesaleApplication } from "./src/types";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<MobileSession | null>(null);
  const [applications, setApplications] = useState<WholesaleApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [applicationError, setApplicationError] = useState("");
  const [shipping, setShipping] = useState<ShippingSettings | null>(null);
  const [shippingSaving, setShippingSaving] = useState(false);
  const [shippingError, setShippingError] = useState("");
  // The Expo token this phone registered, so sign-out can hand it back.
  const [pushToken, setPushToken] = useState("");

  // How an alert behaves while the app is open. Set once, before any arrive.
  useEffect(() => {
    configureForegroundBehaviour();
  }, []);

  /**
   * Registers this phone for new-order alerts, once signed in and past any
   * forced password change — so the permission prompt lands when it is
   * obvious what it is for. Every failure is silent; the owner still gets
   * the email.
   */
  useEffect(() => {
    if (!session || session.requiresPasswordChange) return;
    let active = true;
    void (async () => {
      const deviceToken = await getPushToken();
      if (!active || !deviceToken) return;
      const registered = await registerPushToken(session.token, deviceToken, devicePlatform());
      if (active && registered) setPushToken(deviceToken);
    })();
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    let active = true;
    void loadSession().then((stored) => {
      if (active) {
        setSession(stored);
        setBooting(false);
      }
    });
    return () => { active = false; };
  }, []);

  const logout = useCallback(async () => {
    // Stop the alerts first: a phone that leaves the bakery must not keep
    // buzzing with the day's orders.
    await unregisterPushToken(pushToken);
    setPushToken("");
    await clearSession();
    setSession(null);
    setApplications([]);
    setSelectedId(null);
    setApplicationError("");
    setShipping(null);
    setShippingError("");
  }, [pushToken]);

  const expireSession = useCallback(async () => {
    await logout();
    Alert.alert("Session expired", "Sign in again to continue reviewing wholesale accounts.");
  }, [logout]);

  const requirePasswordChange = useCallback(async () => {
    if (!session) return;
    const updated = { ...session, requiresPasswordChange: true };
    await saveSession(updated);
    setSelectedId(null);
    setSession(updated);
    Alert.alert("Password update required", "Choose a new owner password to continue.");
  }, [session]);

  const refreshApplications = useCallback(async () => {
    if (!session || session.requiresPasswordChange) return;
    setLoadingApplications(true);
    setApplicationError("");
    try {
      const [nextApplications, nextShipping] = await Promise.all([
        getApplications(session.token),
        getShippingSettings(session.token),
      ]);
      setApplications(nextApplications);
      setShipping(nextShipping);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await expireSession();
        return;
      }
      if (caught instanceof ApiError && caught.status === 403 && caught.message === "Password change required") {
        await requirePasswordChange();
        return;
      }
      setApplicationError(caught instanceof Error ? caught.message : "Applications could not be loaded.");
    } finally {
      setLoadingApplications(false);
    }
  }, [expireSession, requirePasswordChange, session]);

  useEffect(() => {
    if (session && !session.requiresPasswordChange) void refreshApplications();
  }, [session?.token, session?.requiresPasswordChange]);

  const selectedApplication = useMemo(
    () => applications.find((application) => application.id === selectedId) || null,
    [applications, selectedId],
  );

  async function handleSignedIn(nextSession: MobileSession) {
    await saveSession(nextSession);
    setSession(nextSession);
  }

  async function handlePasswordChanged() {
    if (!session) return;
    const updated = { ...session, requiresPasswordChange: false };
    await saveSession(updated);
    setSession(updated);
  }

  function handleApplicationUpdated(updated: WholesaleApplication) {
    setApplications((current) => current.map((application) => (
      application.id === updated.id ? updated : application
    )));
  }

  async function saveShipping(rateCents: number, unitsPerBox: number) {
    if (!session) return;
    setShippingSaving(true);
    setShippingError("");
    try {
      setShipping(await updateShippingSettings(session.token, rateCents, unitsPerBox));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await expireSession();
        return;
      }
      if (caught instanceof ApiError && caught.status === 403 && caught.message === "Password change required") {
        await requirePasswordChange();
        return;
      }
      const message = caught instanceof Error ? caught.message : "Shipping could not be updated.";
      setShippingError(message);
      throw caught;
    } finally {
      setShippingSaving(false);
    }
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.bootScreen}>
        <StatusBar style="light" />
        <View style={styles.bootContent}>
          <BrandLockup light />
          <ActivityIndicator color={colors.gold} size="large" style={styles.bootSpinner} />
          <Text style={styles.bootText}>Opening owner portal…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen onSignedIn={handleSignedIn} />
      </>
    );
  }

  if (session.requiresPasswordChange) {
    return (
      <>
        <StatusBar style="dark" />
        <ChangePasswordScreen token={session.token} onCancel={logout} onComplete={handlePasswordChanged} />
      </>
    );
  }

  if (selectedApplication) {
    return (
      <>
        <StatusBar style="light" />
        <ApplicationDetailScreen
          application={selectedApplication}
          onBack={() => setSelectedId(null)}
          onSessionExpired={expireSession}
          onPasswordChangeRequired={requirePasswordChange}
          onUpdated={handleApplicationUpdated}
          token={session.token}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <DashboardScreen
        applications={applications}
        error={applicationError}
        loading={loadingApplications}
        onLogout={logout}
        onOpenApplication={setSelectedId}
        onRefresh={refreshApplications}
        onSaveShipping={saveShipping}
        shipping={shipping}
        shippingError={shippingError}
        shippingSaving={shippingSaving}
        user={session.user}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bootScreen: { flex: 1, backgroundColor: colors.chocolate },
  bootContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  bootSpinner: { marginTop: 48 },
  bootText: { marginTop: 15, color: "#C8B9AF", fontFamily: fonts.sans, fontSize: 12 },
});
