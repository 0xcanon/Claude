import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { BrandLockup } from "./src/components/BrandLockup";
import { getShippingSettings, getTrackedApplication } from "./src/lib/api";
import {
  BuyerAccountError,
  getBuyerAccount,
  requestSignInCode,
  signOutBuyer,
  verifySignInCode,
} from "./src/lib/buyer-auth";
import { cartQuantity, formatMoney, normalizeQuantity } from "./src/lib/format";
import {
  clearBuyerSession,
  loadApplicationTrackingToken,
  loadBuyerSession,
  loadSelectedLocationId,
  saveApplicationTrackingToken,
  saveBuyerSession,
  saveSelectedLocationId,
} from "./src/lib/secure-session";
import { paymentSheet } from "./src/lib/payments";
import {
  CatalogError,
  getCatalogPayload,
  getOrderStatus,
  getStandingOrder,
  orderOnAccount,
  pauseStandingOrder,
  saveStandingOrder,
  startBuyerPayment,
  type ConfirmedOrder,
  type CreditState,
  type CutoffState,
  type PaymentStart,
  type StandingOrderInfo,
} from "./src/lib/storefront";
import { AccountScreen } from "./src/screens/AccountScreen";
import { ApplicationScreen } from "./src/screens/ApplicationScreen";
import { ApplicationStatusScreen } from "./src/screens/ApplicationStatusScreen";
import { CartScreen } from "./src/screens/CartScreen";
import { CatalogScreen } from "./src/screens/CatalogScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LocationsScreen } from "./src/screens/LocationsScreen";
import { OrderDetailScreen } from "./src/screens/OrderDetailScreen";
import { OrderSuccessScreen } from "./src/screens/OrderSuccessScreen";
import { OrdersScreen } from "./src/screens/OrdersScreen";
import { PaymentScreen } from "./src/screens/PaymentScreen";
import { ProductDetailScreen } from "./src/screens/ProductDetailScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import { colors, fonts } from "./src/theme";
import type {
  BuyerAccount,
  BuyerOrder,
  BuyerSession,
  CatalogProduct,
  CartQuantityMap,
  MainTab,
  ShippingSettings,
  TrackedApplication,
} from "./src/types";

type Screen =
  | "welcome" | "apply" | "status" | "signin"
  | MainTab | "product" | "cart" | "pay" | "paid" | "order";

// How long the confirmation screen waits for Stripe's webhook to record the
// order before it stops polling. The payment is captured either way.
const ORDER_POLL_ATTEMPTS = 12;
const ORDER_POLL_INTERVAL_MS = 1500;

const DEFAULT_SHIPPING: ShippingSettings = {
  rateCents: 1250,
  unitsPerBox: 25,
  formattedRate: "$12.50",
  updatedAt: null,
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [shipping, setShipping] = useState<ShippingSettings>(DEFAULT_SHIPPING);
  const [session, setSession] = useState<BuyerSession | null>(null);
  const [account, setAccount] = useState<BuyerAccount | null>(null);
  const [trackingToken, setTrackingToken] = useState("");
  const [trackedApplication, setTrackedApplication] = useState<TrackedApplication | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [cart, setCart] = useState<CartQuantityMap>({});
  const [signingIn, setSigningIn] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [payment, setPayment] = useState<PaymentStart | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);
  const [openOrderId, setOpenOrderId] = useState("");
  const [cutoff, setCutoff] = useState<CutoffState | null>(null);
  const [credit, setCredit] = useState<CreditState | null>(null);
  const [placingOnAccount, setPlacingOnAccount] = useState(false);
  const [standingOrder, setStandingOrder] = useState<StandingOrderInfo | null>(null);
  const [standingWeekday, setStandingWeekday] = useState(2);
  const [standingBusy, setStandingBusy] = useState(false);
  const [standingNotice, setStandingNotice] = useState("");
  const [settlingOrder, setSettlingOrder] = useState(false);
  const [publicError, setPublicError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");

  const selectedLocation = useMemo(
    () => account?.locations.find((location) => location.id === selectedLocationId) || account?.locations[0] || null,
    [account?.locations, selectedLocationId],
  );
  const selectedProduct = products.find((product) => product.id === selectedProductId) || null;
  const totalItems = cartQuantity(cart);
  const userInitials = account
    ? `${account.firstName[0] || ""}${account.lastName[0] || ""}`.toUpperCase() || "DB"
    : "DB";

  const expireBuyerSession = useCallback(async (message = "Your buyer session expired. Sign in again.") => {
    await clearBuyerSession();
    setSession(null);
    setAccount(null);
    setProducts([]);
    setCart({});
    setScreen(trackingToken ? "status" : "welcome");
    setStatusError(message);
  }, [trackingToken]);

  const loadCatalog = useCallback(async (buyerSession: BuyerSession, locationId: string) => {
    if (!locationId) {
      setProducts([]);
      return;
    }
    if (buyerSession.expiresAt <= Date.now() + 30_000) {
      await expireBuyerSession();
      return;
    }
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const payload = await getCatalogPayload(buyerSession);
      setProducts(payload.products);
      setCutoff(payload.cutoff || null);
      setCredit(payload.credit || null);
      // The standing order rides along on every catalog load, so the cart and
      // account screens always show its current state.
      getStandingOrder(buyerSession)
        .then((current) => setStandingOrder(current))
        .catch(() => { /* the card simply shows nothing until the next load */ });
    } catch (caught) {
      if (caught instanceof CatalogError && (caught.status === 401 || caught.status === 403)) {
        await expireBuyerSession();
        return;
      }
      setProducts([]);
      setCatalogError(caught instanceof Error ? caught.message : "The private catalog could not be loaded.");
    } finally {
      setCatalogLoading(false);
    }
  }, [expireBuyerSession]);

  useEffect(() => {
    let active = true;
    async function boot() {
      const [storedSession, storedTracking, storedLocation, liveShipping] = await Promise.all([
        loadBuyerSession(),
        loadApplicationTrackingToken(),
        loadSelectedLocationId(),
        getShippingSettings().catch(() => DEFAULT_SHIPPING),
      ]);
      if (!active) return;
      setShipping(liveShipping);
      if (storedTracking) {
        setTrackingToken(storedTracking);
        try {
          const application = await getTrackedApplication(storedTracking);
          if (active) setTrackedApplication(application);
        } catch {
          // The encrypted tracking token remains available for a later retry.
        }
      }

      if (storedSession && storedSession.expiresAt > Date.now() + 30_000) {
        try {
          const buyerAccount = await getBuyerAccount(storedSession);
          if (!active) return;
          setSession(storedSession);
          setAccount(buyerAccount);
          const locationId = buyerAccount.locations.some((location) => location.id === storedLocation)
            ? storedLocation || ""
            : buyerAccount.locations[0]?.id || "";
          setSelectedLocationId(locationId);
          if (locationId) await loadCatalog(storedSession, locationId);
          if (active) setScreen(buyerAccount.locations.length ? "home" : "locations");
        } catch {
          await clearBuyerSession();
          if (active) setScreen(storedTracking ? "status" : "welcome");
        }
      } else {
        if (storedSession) await clearBuyerSession();
        if (active) setScreen(storedTracking ? "status" : "welcome");
      }
      if (active) setBooting(false);
    }
    void boot();
    return () => { active = false; };
  }, [loadCatalog]);

  const refreshStatus = useCallback(async () => {
    if (!trackingToken) return;
    setStatusLoading(true);
    setStatusError("");
    try {
      setTrackedApplication(await getTrackedApplication(trackingToken));
    } catch (caught) {
      setStatusError(caught instanceof Error ? caught.message : "Application status could not be refreshed.");
    } finally {
      setStatusLoading(false);
    }
  }, [trackingToken]);

  async function handleApplicationSubmitted(token: string) {
    await saveApplicationTrackingToken(token);
    setTrackingToken(token);
    setScreen("status");
    setStatusLoading(true);
    try {
      setTrackedApplication(await getTrackedApplication(token));
    } catch (caught) {
      setStatusError(caught instanceof Error ? caught.message : "Your request was sent. Pull down to refresh its status.");
    } finally {
      setStatusLoading(false);
    }
  }

  const [signInStage, setSignInStage] = useState<"email" | "code">("email");
  const [signInEmail, setSignInEmail] = useState("");
  const [signInNotice, setSignInNotice] = useState("");
  const [signInError, setSignInError] = useState("");

  function handleSignIn() {
    // Sign-in is now email plus an emailed code, so it gets its own screen
    // rather than handing off to a browser.
    setSignInEmail(trackedApplication?.email || "");
    setSignInStage("email");
    setSignInNotice("");
    setSignInError("");
    setScreen("signin");
  }

  async function handleRequestCode(email: string) {
    setSigningIn(true);
    setSignInError("");
    try {
      const result = await requestSignInCode(email);
      setSignInEmail(email);
      setSignInNotice(result.message);
      setSignInStage("code");
    } catch (caught) {
      setSignInError(caught instanceof Error ? caught.message : "That code could not be sent.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleVerifyCode(email: string, code: string) {
    setSigningIn(true);
    setSignInError("");
    try {
      const { session: nextSession } = await verifySignInCode(email, code);
      const buyerAccount = await getBuyerAccount(nextSession);
      await saveBuyerSession(nextSession);
      setSession(nextSession);
      setAccount(buyerAccount);
      const locationId = buyerAccount.locations[0]?.id || "";
      setSelectedLocationId(locationId);
      if (locationId) {
        await saveSelectedLocationId(locationId);
        await loadCatalog(nextSession, locationId);
      }
      setSignInNotice("");
      setScreen(locationId ? "home" : "locations");
    } catch (caught) {
      setSignInError(caught instanceof Error ? caught.message : "That code did not work.");
    } finally {
      setSigningIn(false);
    }
  }

  async function refreshAccount() {
    if (!session) return;
    setAccountLoading(true);
    try {
      const next = await getBuyerAccount(session);
      setAccount(next);
      const nextLocation = next.locations.some((location) => location.id === selectedLocationId)
        ? selectedLocationId
        : next.locations[0]?.id || "";
      setSelectedLocationId(nextLocation);
      if (nextLocation) await loadCatalog(session, nextLocation);
      setShipping(await getShippingSettings().catch(() => shipping));
    } catch (caught) {
      if (caught instanceof BuyerAccountError && caught.status === 401) {
        await expireBuyerSession();
      } else {
        Alert.alert("Couldn’t refresh", caught instanceof Error ? caught.message : "Buyer account details could not be refreshed.");
      }
    } finally {
      setAccountLoading(false);
    }
  }

  function selectLocation(id: string) {
    if (!session || id === selectedLocationId) return;
    const change = async () => {
      setSelectedLocationId(id);
      setCart({});
      await saveSelectedLocationId(id);
      await loadCatalog(session, id);
    };
    if (totalItems > 0) {
      Alert.alert(
        "Change delivery location?",
        "Your cart will be cleared so products and pricing can reload for the selected storefront.",
        [
          { text: "Keep current", style: "cancel" },
          { text: "Change location", style: "destructive", onPress: () => void change() },
        ],
      );
      return;
    }
    void change();
  }

  function setProductQuantity(product: CatalogProduct, requested: number) {
    const rule = product.variant.quantityRule;
    let quantity = normalizeQuantity(requested, rule.minimum, rule.increment);
    if (rule.maximum) quantity = Math.min(quantity, rule.maximum);
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[product.variant.id];
      else next[product.variant.id] = quantity;
      return next;
    });
  }

  function addProduct(product: CatalogProduct) {
    const current = cart[product.variant.id] || 0;
    const next = current > 0
      ? current + product.variant.quantityRule.increment
      : product.variant.quantityRule.minimum;
    setProductQuantity(product, next);
  }

  /**
   * Prices the cart on the server and moves to the payment screen. Nothing is
   * charged here — the card sheet opens from that screen.
   */
  async function beginCheckout() {
    if (!session || !selectedLocationId) return;
    if (session.expiresAt <= Date.now() + 30_000) {
      await expireBuyerSession();
      return;
    }
    setCheckingOut(true);
    setCheckoutError("");
    try {
      const started = await startBuyerPayment(session, cart, selectedLocationId);
      setPayment(started);
      setPaymentError("");
      setScreen("pay");
    } catch (caught) {
      const sessionEnded =
        (caught instanceof BuyerAccountError && caught.status === 401) ||
        (caught instanceof CatalogError && (caught.status === 401 || caught.status === 403));
      if (sessionEnded) {
        await expireBuyerSession();
        return;
      }
      setCheckoutError(caught instanceof Error ? caught.message : "Payment could not be started.");
    } finally {
      setCheckingOut(false);
    }
  }

  /**
   * Opens Stripe's card sheet. A cancelled sheet returns the buyer to the
   * payment screen with nothing charged and nothing said; only a real failure
   * shows an error.
   */
  async function payNow() {
    if (!session || !payment || paying) return;
    setPaying(true);
    setPaymentError("");
    try {
      const outcome = await paymentSheet.present({
        clientSecret: payment.clientSecret,
        publishableKey: payment.publishableKey,
        merchantName: "Dallas Bakery Wholesale",
        email: account?.email || "",
        payButtonLabel: `Pay Dallas Bakery ${formatMoney(payment.summary.totalCents / 100, "USD")}`,
        customerId: payment.customerId,
        customerEphemeralKeySecret: payment.ephemeralKeySecret,
      });
      if (outcome.status === "cancelled") return;
      if (outcome.status === "failed") {
        setPaymentError(outcome.message);
        return;
      }
      // Paid. The cart is cleared here rather than on the confirmation screen
      // so a back-swipe can never re-submit an order that is already paid.
      const paidIntentId = payment.paymentIntentId;
      setCart({});
      setPayment(null);
      setConfirmedOrder(null);
      setSettlingOrder(true);
      setScreen("paid");
      void awaitOrderRecord(paidIntentId);
    } finally {
      setPaying(false);
    }
  }

  /**
   * Places the priced cart on the buyer's credit account — no card sheet.
   * The server re-checks the credit line and returns the recorded order, so
   * the success screen shows it immediately with nothing to poll.
   */
  async function orderOnAccountNow() {
    if (!session || !payment || paying || placingOnAccount) return;
    setPlacingOnAccount(true);
    setPaymentError("");
    try {
      const result = await orderOnAccount(session, cart, selectedLocationId);
      setCart({});
      setPayment(null);
      setConfirmedOrder(result.order);
      if (result.credit) setCredit(result.credit);
      setSettlingOrder(false);
      setScreen("paid");
      void refreshAccount();
    } catch (caught) {
      if (caught instanceof CatalogError && (caught.status === 401 || caught.status === 403)) {
        await expireBuyerSession();
        return;
      }
      setPaymentError(caught instanceof Error ? caught.message : "The order could not be placed on account.");
    } finally {
      setPlacingOnAccount(false);
    }
  }

  /**
   * Polls for the order row Stripe's webhook writes. Giving up only stops the
   * polling: the payment is captured and the order reaches the shipping queue
   * from the webhook regardless.
   */
  async function awaitOrderRecord(paymentIntentId: string) {
    if (!session) return;
    for (let attempt = 0; attempt < ORDER_POLL_ATTEMPTS; attempt += 1) {
      try {
        const result = await getOrderStatus(session, paymentIntentId);
        if (result.status === "recorded") {
          setConfirmedOrder(result.order);
          setSettlingOrder(false);
          void refreshAccount();
          return;
        }
      } catch {
        // A hiccup while polling is not a failed payment; keep trying.
      }
      await new Promise((resolve) => setTimeout(resolve, ORDER_POLL_INTERVAL_MS));
    }
    setSettlingOrder(false);
  }

  async function signOut() {
    await signOutBuyer(session);
    await clearBuyerSession();
    setSession(null);
    setAccount(null);
    setProducts([]);
    setCart({});
    setScreen(trackingToken ? "status" : "welcome");
  }

  /**
   * Puts a past order's cases back in the cart. Products that are no longer in
   * the catalog are skipped rather than failing the whole reorder.
   */
  function reorder(order: BuyerOrder) {
    const next: CartQuantityMap = {};
    for (const item of order.items) {
      const product = products.find((entry) => entry.variant.id === item.sku);
      if (product && item.quantity > 0) next[product.variant.id] = item.quantity;
    }
    setCart(next);
    setScreen(Object.keys(next).length ? "cart" : "catalog");
  }

  /** Turns the current cart into the weekly order for the chosen day. */
  async function makeCartWeekly(weekday: number) {
    if (!session || standingBusy) return;
    setStandingBusy(true);
    setStandingNotice("");
    try {
      const saved = await saveStandingOrder(session, cart, weekday, selectedLocationId);
      setStandingOrder(saved);
      setStandingNotice(saved ? `Saved — every ${saved.weekdayName}, charged to your saved card.` : "");
    } catch (caught) {
      setStandingNotice(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setStandingBusy(false);
    }
  }

  async function pauseWeekly() {
    if (!session || standingBusy) return;
    setStandingBusy(true);
    setStandingNotice("");
    try {
      setStandingOrder(await pauseStandingOrder(session));
      setStandingNotice("Standing order paused. Make any cart weekly to start again.");
    } catch (caught) {
      setStandingNotice(caught instanceof Error ? caught.message : "That could not be paused.");
    } finally {
      setStandingBusy(false);
    }
  }

  function openProduct(product: CatalogProduct) {
    setSelectedProductId(product.id);
    setScreen("product");
  }

  function selectTab(tab: MainTab) {
    setScreen(tab);
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.bootSafe}>
        <StatusBar style="light" />
        <View style={styles.bootContent}>
          <BrandLockup light />
          <ActivityIndicator color={colors.gold} size="large" style={styles.bootSpinner} />
          <Text style={styles.bootText}>Opening Dallas Bakery Wholesale…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "signin") {
    return (
      <SignInScreen
        busy={signingIn}
        error={signInError}
        initialEmail={signInEmail}
        notice={signInNotice}
        onBack={() => setScreen(trackingToken ? "status" : "welcome")}
        onRequestCode={handleRequestCode}
        onVerifyCode={handleVerifyCode}
        stage={signInStage}
      />
    );
  }

  if (screen === "apply") {
    return <><StatusBar style="dark" /><ApplicationScreen onBack={() => setScreen("welcome")} onSubmitted={handleApplicationSubmitted} /></>;
  }
  if (screen === "status") {
    return (
      <>
        <StatusBar style="dark" />
        <ApplicationStatusScreen
          application={trackedApplication}
          error={statusError}
          loading={statusLoading}
          onBack={() => setScreen("welcome")}
          onRefresh={() => void refreshStatus()}
          onSignIn={() => void handleSignIn()}
          signingIn={signingIn}
        />
      </>
    );
  }
  if (!session || !account) {
    return (
      <>
        <StatusBar style="dark" />
        <WelcomeScreen
          error={publicError}
          hasTracking={Boolean(trackingToken)}
          onApply={() => setScreen("apply")}
          onOpenStatus={() => setScreen("status")}
          onSignIn={() => void handleSignIn()}
          shipping={shipping}
          signingIn={signingIn}
        />
      </>
    );
  }

  if (screen === "product" && selectedProduct) {
    return (
      <>
        <StatusBar style="dark" />
        <ProductDetailScreen
          initialQuantity={cart[selectedProduct.variant.id] || 0}
          location={selectedLocation}
          onBack={() => setScreen("catalog")}
          onSetQuantity={(quantity) => setProductQuantity(selectedProduct, quantity)}
          product={selectedProduct}
        />
      </>
    );
  }
  if (screen === "pay") {
    return (
      <>
        <StatusBar style="light" />
        <PaymentScreen
          credit={credit}
          error={paymentError}
          onBack={() => { setPayment(null); setScreen("cart"); }}
          onOrderOnAccount={() => void orderOnAccountNow()}
          onPay={() => void payNow()}
          paying={paying}
          payment={payment}
          placingOnAccount={placingOnAccount}
        />
      </>
    );
  }
  if (screen === "paid") {
    return (
      <>
        <StatusBar style="dark" />
        <OrderSuccessScreen
          cutoffLabel={cutoff?.shipsToday ? "Ordered before noon Central, so it bakes and ships today." : "It bakes and ships the next business day."}
          onDone={() => setScreen("catalog")}
          onViewOrders={() => setScreen("orders")}
          order={confirmedOrder}
          settling={settlingOrder}
        />
      </>
    );
  }
  if (screen === "cart") {
    return (
      <>
        <StatusBar style="light" />
        <CartScreen
          cart={cart}
          checkoutError={checkoutError}
          checkingOut={checkingOut}
          cutoff={cutoff}
          locations={account.locations}
          onBack={() => setScreen("catalog")}
          onCheckout={() => void beginCheckout()}
          onQuantity={setProductQuantity}
          onSelectLocation={selectLocation}
          products={products}
          selectedLocationId={selectedLocationId}
          shipping={shipping}
          standingBusy={standingBusy}
          standingNotice={standingNotice}
          standingOrder={standingOrder}
          standingWeekday={standingWeekday}
          onPauseStanding={() => void pauseWeekly()}
          onSaveStanding={(weekday) => void makeCartWeekly(weekday)}
          onSelectStandingWeekday={setStandingWeekday}
        />
      </>
    );
  }
  if (screen === "catalog") {
    return (
      <>
        <StatusBar style="light" />
        <CatalogScreen
          cart={cart}
          cartCount={totalItems}
          cutoff={cutoff}
          error={catalogError}
          loading={catalogLoading}
          locations={account.locations}
          onAdd={addProduct}
          onCart={() => setScreen("cart")}
          onOpenProduct={openProduct}
          onRetry={() => void loadCatalog(session, selectedLocationId)}
          onSelectLocation={selectLocation}
          onTab={selectTab}
          products={products}
          selectedLocationId={selectedLocationId}
          userInitials={userInitials}
        />
      </>
    );
  }
  if (screen === "order") {
    const openOrder = account.orders.find((entry) => entry.id === openOrderId);
    if (openOrder) {
      return (
        <>
          <StatusBar style="dark" />
          <OrderDetailScreen
            onBack={() => setScreen("orders")}
            onReorder={() => reorder(openOrder)}
            order={openOrder}
          />
        </>
      );
    }
  }
  if (screen === "orders" || screen === "order") {
    return (
      <>
        <StatusBar style="light" />
        <OrdersScreen
          cartCount={totalItems}
          onCart={() => setScreen("cart")}
          onOpenOrder={(order) => { setOpenOrderId(order.id); setScreen("order"); }}
          onStartOrder={() => setScreen("catalog")}
          onTab={selectTab}
          orders={account.orders}
          userInitials={userInitials}
        />
      </>
    );
  }
  if (screen === "locations") {
    return (
      <>
        <StatusBar style="light" />
        <LocationsScreen cartCount={totalItems} locations={account.locations} onCart={() => setScreen("cart")} onSelectLocation={selectLocation} onTab={selectTab} selectedLocationId={selectedLocationId} userInitials={userInitials} />
      </>
    );
  }
  if (screen === "account") {
    return (
      <>
        <StatusBar style="light" />
        <AccountScreen
          account={account}
          cartCount={totalItems}
          onCart={() => setScreen("cart")}
          onPauseStanding={() => void pauseWeekly()}
          onSignOut={() => void signOut()}
          onTab={selectTab}
          standingBusy={standingBusy}
          standingOrder={standingOrder}
          userInitials={userInitials}
        />
      </>
    );
  }
  return (
    <>
      <StatusBar style="light" />
      <HomeScreen
        account={account}
        cartCount={totalItems}
        loading={accountLoading}
        locations={account.locations}
        onCart={() => setScreen("cart")}
        onRefresh={() => void refreshAccount()}
        onSelectLocation={selectLocation}
        onTab={selectTab}
        products={products}
        selectedLocationId={selectedLocationId}
        shipping={shipping}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bootSafe: { flex: 1, backgroundColor: colors.chocolate },
  bootContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  bootSpinner: { marginTop: 46 },
  bootText: { marginTop: 14, color: "#C8B9AF", fontFamily: fonts.sans, fontSize: 11 },
});
