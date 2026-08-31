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
import { OwnerHeader } from "./src/components/OwnerHeader";
import { OwnerTabBar, type OwnerTab } from "./src/components/OwnerTabBar";
import {
  ApiError,
  createLabels,
  getApplications,
  getOrderHistory,
  getOrders,
  getOwnerProducts,
  getOwnerSummary,
  getShippingSettings,
  getSupportCases,
  markInvoicePaid,
  markShipped,
  orderAction,
  registerPushToken,
  respondToCase,
  unregisterPushToken,
  updateProductStock,
  updateShippingSettings,
} from "./src/lib/api";
import { configureForegroundBehaviour, devicePlatform, getPushToken } from "./src/lib/push";
import { clearSession, loadSession, saveSession } from "./src/lib/secure-session";
import { ApplicationDetailScreen } from "./src/screens/ApplicationDetailScreen";
import { BreadScreen } from "./src/screens/BreadScreen";
import { ChangePasswordScreen } from "./src/screens/ChangePasswordScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { OrdersScreen } from "./src/screens/OrdersScreen";
import { OwnerOrderScreen } from "./src/screens/OwnerOrderScreen";
import { ProblemsScreen } from "./src/screens/ProblemsScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { colors, fonts } from "./src/theme";
import type {
  MobileSession,
  OrderEvent,
  OwnerOrder,
  OwnerProduct,
  OwnerSummary,
  ShippingSettings,
  SupportCase,
  WholesaleApplication,
} from "./src/types";

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

  /* ------------------------------------- running the bakery from the app -- */

  const [tab, setTab] = useState<OwnerTab>("today");
  const [summary, setSummary] = useState<OwnerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [orderScope, setOrderScope] = useState<"unshipped" | "today" | "all">("unshipped");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [ordersBusy, setOrdersBusy] = useState("");
  const [ordersNotice, setOrdersNotice] = useState("");

  const [openOrderId, setOpenOrderId] = useState("");
  const [orderEvents, setOrderEvents] = useState<OrderEvent[]>([]);
  const [orderReasons, setOrderReasons] = useState<string[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderNotice, setOrderNotice] = useState("");

  const [cases, setCases] = useState<SupportCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState("");
  const [caseBusy, setCaseBusy] = useState("");
  const [caseNotice, setCaseNotice] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const [ownerProducts, setOwnerProducts] = useState<OwnerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [productBusy, setProductBusy] = useState("");
  const [productNotice, setProductNotice] = useState("");

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

  /* ------------------------------------------------- loading and acting -- */

  /**
   * Every owner-app call can come back "your session ended" or "change your
   * password first". Rather than repeat that handling in a dozen places, each
   * loader hands its error here and gets back true if it was dealt with.
   */
  const handleAuthFailure = useCallback(async (caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401) {
      await expireSession();
      return true;
    }
    if (caught instanceof ApiError && caught.status === 403
      && caught.message === "Password change required") {
      await requirePasswordChange();
      return true;
    }
    return false;
  }, [expireSession, requirePasswordChange]);

  const loadSummary = useCallback(async () => {
    if (!session) return;
    setSummaryLoading(true);
    try {
      setSummary(await getOwnerSummary(session.token));
      setSummaryError("");
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      setSummaryError(caught instanceof Error ? caught.message : "Today could not be loaded.");
    } finally {
      setSummaryLoading(false);
    }
  }, [session, handleAuthFailure]);

  const loadOrders = useCallback(async (scope: "unshipped" | "today" | "all") => {
    if (!session) return;
    setOrdersLoading(true);
    try {
      setOrders(await getOrders(session.token, scope));
      setOrdersError("");
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      setOrdersError(caught instanceof Error ? caught.message : "Orders could not be loaded.");
    } finally {
      setOrdersLoading(false);
    }
  }, [session, handleAuthFailure]);

  const loadHistory = useCallback(async (id: string) => {
    if (!session || !id) return;
    setHistoryLoading(true);
    try {
      const result = await getOrderHistory(session.token, id);
      setOrderEvents(result.events);
      setOrderReasons(result.reasons);
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      // The history is context, not the job — the buttons still work.
    } finally {
      setHistoryLoading(false);
    }
  }, [session, handleAuthFailure]);

  const loadCases = useCallback(async () => {
    if (!session) return;
    setCasesLoading(true);
    try {
      setCases((await getSupportCases(session.token)).cases);
      setCasesError("");
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      setCasesError(caught instanceof Error ? caught.message : "Problems could not be loaded.");
    } finally {
      setCasesLoading(false);
    }
  }, [session, handleAuthFailure]);

  const loadProducts = useCallback(async () => {
    if (!session) return;
    setProductsLoading(true);
    try {
      setOwnerProducts(await getOwnerProducts(session.token));
      setProductsError("");
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      setProductsError(caught instanceof Error ? caught.message : "Bread could not be loaded.");
    } finally {
      setProductsLoading(false);
    }
  }, [session, handleAuthFailure]);

  // Each tab loads when it is opened, and the summary loads on sign-in so the
  // first screen is never empty.
  useEffect(() => {
    if (!session || session.requiresPasswordChange) return;
    if (tab === "today") void loadSummary();
    if (tab === "orders") void loadOrders(orderScope);
    if (tab === "problems") void loadCases();
    if (tab === "bread") void loadProducts();
  }, [session, tab, orderScope, loadSummary, loadOrders, loadCases, loadProducts]);

  const openOrder = orders.find((order) => order.id === openOrderId) || null;

  async function runBatch(action: "labels" | "shipped", ids: string[]) {
    if (!session || !ids.length) return;
    setOrdersBusy(action);
    setOrdersNotice("");
    setOrdersError("");
    try {
      if (action === "labels") {
        const result = await createLabels(session.token, ids);
        const failed = result.results.filter((row) => !row.ok);
        const made = result.results.length - failed.length;
        setOrdersNotice(
          result.message
          || `${made} label${made === 1 ? "" : "s"} bought.`
            + (failed.length ? ` ${failed.length} could not be — see the orders below.` : ""),
        );
      } else {
        const shipped = await markShipped(session.token, ids);
        setOrdersNotice(`${shipped} order${shipped === 1 ? "" : "s"} marked shipped. Tracking sent.`);
      }
      await loadOrders(orderScope);
      void loadSummary();
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      setOrdersError(caught instanceof Error ? caught.message : "That did not go through.");
    } finally {
      setOrdersBusy("");
    }
  }

  async function runOrderAction(body: {
    action: "hold" | "release" | "cancel" | "refund" | "mark-delivered";
    reason?: string;
    amountCents?: number;
  }) {
    if (!session || !openOrderId) return;
    setOrderBusy(true);
    setOrderError("");
    setOrderNotice("");
    try {
      const result = await orderAction(session.token, { ...body, id: openOrderId });
      setOrderNotice(`Order #${result.order.orderNumber} is now ${result.order.status}.`);
      await Promise.all([loadOrders(orderScope), loadHistory(openOrderId)]);
      void loadSummary();
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      setOrderError(caught instanceof Error ? caught.message : "That did not go through.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function settleInvoice() {
    if (!session || !openOrderId) return;
    setOrderBusy(true);
    setOrderError("");
    try {
      const result = await markInvoicePaid(session.token, openOrderId);
      setOrderNotice(`Invoice for #${result.orderNumber} marked paid — credit released.`);
      await Promise.all([loadOrders(orderScope), loadHistory(openOrderId)]);
      void loadSummary();
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      setOrderError(caught instanceof Error ? caught.message : "That did not go through.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function answerCase(id: string, reply: string, notes: string, close: boolean) {
    if (!session) return;
    setCaseBusy(id);
    setCaseNotice("");
    setCasesError("");
    try {
      await respondToCase(session.token, {
        id, reply, ownerNotes: notes, ...(close ? { status: "resolved" as const } : {}),
      });
      setCaseNotice(close ? "Answered and closed." : "Sent — they have it by email.");
      await loadCases();
      void loadSummary();
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      setCasesError(caught instanceof Error ? caught.message : "That could not be sent.");
    } finally {
      setCaseBusy("");
    }
  }

  async function changeStock(sku: string, patch: { inStock?: boolean; dailyCapacityCases?: number }) {
    if (!session) return;
    setProductBusy(sku);
    setProductNotice("");
    setProductsError("");
    try {
      const result = await updateProductStock(session.token, { sku, ...patch });
      setOwnerProducts((current) => current.map((row) => (row.sku === sku ? result.product : row)));
      setProductNotice(
        patch.inStock === false ? `${result.product.title} is off sale.`
          : patch.inStock === true ? `${result.product.title} is back on sale.`
          : "Daily limit saved.",
      );
      void loadSummary();
    } catch (caught) {
      if (await handleAuthFailure(caught)) return;
      setProductsError(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setProductBusy("");
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

  // One order, pushed over the tabs rather than living in them: it is a place
  // you go and come back from, not a place you switch to.
  if (openOrder) {
    return (
      <>
        <StatusBar style="light" />
        <SafeAreaView style={styles.shell}>
          <OwnerHeader backLabel="Orders" onBack={() => { setOpenOrderId(""); setOrderNotice(""); setOrderError(""); }} />
          <OwnerOrderScreen
            busy={orderBusy}
            error={orderError}
            events={orderEvents}
            loadingHistory={historyLoading}
            notice={orderNotice}
            onAct={runOrderAction}
            onMarkInvoicePaid={settleInvoice}
            order={openOrder}
            reasons={orderReasons}
          />
        </SafeAreaView>
      </>
    );
  }

  const badges = {
    orders: (summary?.summary.readyToShip || 0) + (summary?.summary.onHold || 0),
    problems: summary?.problemsOpen || 0,
    accounts: summary?.applicationsWaiting || 0,
  };

  return (
    <>
      <StatusBar style="light" />
      <SafeAreaView style={styles.shell}>
        <View style={styles.body}>
          {tab === "today" && (
            <TodayScreen
              error={summaryError}
              loading={summaryLoading}
              onOpenAccounts={() => setTab("accounts")}
              onOpenOrders={() => setTab("orders")}
              onOpenProblems={() => setTab("problems")}
              onRefresh={loadSummary}
              summary={summary}
            />
          )}

          {tab === "orders" && (
            <OrdersScreen
              busy={ordersBusy}
              error={ordersError}
              loading={ordersLoading}
              notice={ordersNotice}
              onCreateLabels={(ids) => runBatch("labels", ids)}
              onMarkShipped={(ids) => runBatch("shipped", ids)}
              onOpenOrder={(order) => {
                setOpenOrderId(order.id);
                setOrderNotice("");
                setOrderError("");
                void loadHistory(order.id);
              }}
              onRefresh={() => loadOrders(orderScope)}
              onScope={setOrderScope}
              orders={orders}
              scope={orderScope}
            />
          )}

          {tab === "problems" && (
            <ProblemsScreen
              busy={caseBusy}
              cases={cases}
              error={casesError}
              loading={casesLoading}
              notice={caseNotice}
              onRefresh={loadCases}
              onRespond={answerCase}
              onShowResolved={setShowResolved}
              showResolved={showResolved}
            />
          )}

          {tab === "accounts" && (
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
          )}

          {tab === "bread" && (
            <BreadScreen
              busy={productBusy}
              error={productsError}
              loading={productsLoading}
              notice={productNotice}
              onRefresh={loadProducts}
              onSetCapacity={(sku, cases) => changeStock(sku, { dailyCapacityCases: cases })}
              onSetStock={(sku, inStock) => changeStock(sku, { inStock })}
              products={ownerProducts}
            />
          )}
        </View>

        <OwnerTabBar active={tab} badges={badges} onSelect={setTab} />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.cream },
  body: { flex: 1 },
  bootScreen: { flex: 1, backgroundColor: colors.chocolate },
  bootContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  bootSpinner: { marginTop: 48 },
  bootText: { marginTop: 15, color: "#C8B9AF", fontFamily: fonts.sans, fontSize: 12 },
});
