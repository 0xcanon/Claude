// Screenshot harness. `App.original.tsx` is the shipping app, untouched.
// With no ?screen= query parameter this renders the real app; with one it
// mounts a single screen against fixture data so every state can be captured
// without a live backend.
import { useState } from "react";
import { StatusBar } from "expo-status-bar";

import RealApp from "./App.original";
import { AccountScreen } from "./src/screens/AccountScreen";
import { ApplicationScreen } from "./src/screens/ApplicationScreen";
import { ApplicationStatusScreen } from "./src/screens/ApplicationStatusScreen";
import { CartScreen } from "./src/screens/CartScreen";
import { CatalogScreen } from "./src/screens/CatalogScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LocationsScreen } from "./src/screens/LocationsScreen";
import { OrderSuccessScreen } from "./src/screens/OrderSuccessScreen";
import { OrdersScreen } from "./src/screens/OrdersScreen";
import { PaymentScreen } from "./src/screens/PaymentScreen";
import { ProductDetailScreen } from "./src/screens/ProductDetailScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import * as fx from "./src/screenshot-fixtures";
import type { CartQuantityMap } from "./src/types";

const noop = () => undefined;
const [firstLocation] = fx.account.locations;
const [firstProduct] = fx.products;
const locationId = firstLocation?.id || "";
const initials = "MF";

export default function App() {
  const screen =
    typeof globalThis.location === "undefined"
      ? ""
      : new URLSearchParams(globalThis.location.search).get("screen") || "";
  const [cart, setCart] = useState<CartQuantityMap>(fx.cart);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  if (!screen) return <RealApp />;

  switch (screen) {
    case "welcome":
      return (
        <>
          <StatusBar style="dark" />
          <WelcomeScreen
            error=""
            hasTracking
            onApply={noop}
            onOpenStatus={noop}
            onSignIn={noop}
            shipping={fx.shipping}
            signingIn={false}
          />
        </>
      );
    case "apply":
      return (
        <>
          <StatusBar style="dark" />
          <ApplicationScreen onBack={noop} onSubmitted={async () => undefined} />
        </>
      );
    case "status-pending":
    case "status-approved":
      return (
        <>
          <StatusBar style="dark" />
          <ApplicationStatusScreen
            application={screen === "status-approved" ? fx.approvedApplication : fx.pendingApplication}
            error=""
            loading={false}
            onBack={noop}
            onRefresh={noop}
            onSignIn={noop}
            signingIn={false}
          />
        </>
      );
    case "signin-email":
    case "signin-code":
      return (
        <SignInScreen
          busy={false}
          error=""
          initialEmail="mina@saffronkitchen.com"
          notice={screen === "signin-code" ? "We emailed a six-digit code to mina@saffronkitchen.com." : ""}
          onBack={noop}
          onRequestCode={noop}
          onVerifyCode={noop}
          stage={screen === "signin-code" ? "code" : "email"}
        />
      );
    case "home":
      return (
        <>
          <StatusBar style="light" />
          <HomeScreen
            account={fx.account}
            cartCount={cartCount}
            loading={false}
            locations={fx.account.locations}
            onCart={noop}
            onRefresh={noop}
            onSelectLocation={noop}
            onTab={noop}
            products={fx.products}
            selectedLocationId={locationId}
            shipping={fx.shipping}
          />
        </>
      );
    case "catalog":
      return (
        <>
          <StatusBar style="light" />
          <CatalogScreen
            cart={cart}
            cartCount={cartCount}
            error=""
            loading={false}
            locations={fx.account.locations}
            onAdd={(p) => setCart((c) => ({ ...c, [p.variant.id]: (c[p.variant.id] || 0) + p.variant.quantityRule.increment }))}
            onCart={noop}
            onOpenProduct={noop}
            onRetry={noop}
            onSelectLocation={noop}
            onTab={noop}
            products={fx.products}
            selectedLocationId={locationId}
            userInitials={initials}
          />
        </>
      );
    case "product":
      return (
        <>
          <StatusBar style="dark" />
          <ProductDetailScreen
            initialQuantity={2}
            location={firstLocation || null}
            onBack={noop}
            onSetQuantity={noop}
            product={firstProduct!}
          />
        </>
      );
    case "cart":
      return (
        <>
          <StatusBar style="light" />
          <CartScreen
            cart={cart}
            checkoutError=""
            checkingOut={false}
            locations={fx.account.locations}
            onBack={noop}
            onCheckout={noop}
            onQuantity={(p, q) => setCart((c) => ({ ...c, [p.variant.id]: q }))}
            onSelectLocation={noop}
            products={fx.products}
            selectedLocationId={locationId}
            shipping={fx.shipping}
          />
        </>
      );
    case "pay":
      return (
        <>
          <StatusBar style="light" />
          <PaymentScreen error="" onBack={noop} onPay={noop} paying={false} payment={fx.payment} />
        </>
      );
    case "pay-loading":
      return (
        <>
          <StatusBar style="light" />
          <PaymentScreen error="" onBack={noop} onPay={noop} paying={false} payment={null} />
        </>
      );
    case "order-success":
      return (
        <>
          <StatusBar style="dark" />
          <OrderSuccessScreen
            cutoffLabel="Ordered before noon Central, so it bakes and ships today."
            onDone={noop}
            onViewOrders={noop}
            order={fx.confirmedOrder}
            settling={false}
          />
        </>
      );
    case "order-settling":
      return (
        <>
          <StatusBar style="dark" />
          <OrderSuccessScreen
            cutoffLabel=""
            onDone={noop}
            onViewOrders={noop}
            order={null}
            settling
          />
        </>
      );
    case "orders":
      return (
        <>
          <StatusBar style="light" />
          <OrdersScreen
            cartCount={cartCount}
            onCart={noop}
            onStartOrder={noop}
            onTab={noop}
            orders={fx.account.orders}
            userInitials={initials}
          />
        </>
      );
    case "locations":
      return (
        <>
          <StatusBar style="light" />
          <LocationsScreen
            cartCount={cartCount}
            locations={fx.account.locations}
            onCart={noop}
            onSelectLocation={noop}
            onTab={noop}
            selectedLocationId={locationId}
            userInitials={initials}
          />
        </>
      );
    case "account":
      return (
        <>
          <StatusBar style="light" />
          <AccountScreen
            account={fx.account}
            cartCount={cartCount}
            onCart={noop}
            onSignOut={noop}
            onTab={noop}
            userInitials={initials}
          />
        </>
      );
    default:
      return <RealApp />;
  }
}
