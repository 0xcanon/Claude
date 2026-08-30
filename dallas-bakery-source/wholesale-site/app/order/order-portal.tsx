"use client";

import { useCallback, useEffect, useState } from "react";

import { CheckoutForm, type CheckoutSummary, type DeliverTo } from "./checkout-form";
import { OrderConfirmation, type ConfirmedOrder } from "./order-confirmation";

type ProductSpec = {
  ingredients: string;
  allergens: string;
  netWeight: string;
  shelfLife: string;
  storage: string;
  certifications: string;
};

type StockState = {
  available: boolean;
  remainingToday: number | null;
  maxPerOrder: number | null;
  label: string;
};

type Product = {
  id: string;
  handle: string;
  title: string;
  description: string;
  imageUrl: string;
  spec?: ProductSpec;
  stock?: StockState;
  variant: {
    id: string;
    title: string;
    price: { amount: string; currencyCode: string };
    unitsPerCase?: number;
    availableForSale?: boolean;
    quantityRule?: { minimum: number; maximum: number | null; increment: number };
  };
};

type DeliveryWindow = {
  shipDate: string;
  earliest: string;
  latest: string;
  options: string[];
};

type Invoice = {
  orderId: string;
  invoiceNumber: string;
  orderNumber: number;
  placedAt: string;
  poNumber: string;
  paymentTerms: string;
  dueAt: string;
  paidAt: string;
  totalCents: number;
  balanceCents: number;
  status: "paid" | "due" | "overdue" | "card";
  statusLabel: string;
};

type Credit = {
  enabled: boolean;
  limitCents: number;
  outstandingCents: number;
  availableCents: number;
  /** 15 or 30 for Net terms; 0 when the account has none. */
  termsDays: number;
  /** The slice of the balance past its due date — locks on-account ordering. */
  overdueCents: number;
};

type Location = {
  id: string;
  name: string;
  address: { formattedAddress: string[] } | null;
};

type Rules = {
  cutoffLabel: string;
  minimumLabel: string;
  leadTimeLabel: string;
};

type Cutoff = { shipsToday: boolean; label: string };

type OrderItem = { sku: string; name: string; quantity: number; unitAmountCents: number };

type Order = {
  id: string;
  name: string;
  processedAt: string;
  shippedAt: string | null;
  stage: "paid" | "labeled" | "shipped" | "refunded";
  stageLabel: string;
  stageDetail: string;
  stageStep: 1 | 2 | 3;
  trackable: boolean;
  trackingNumber: string;
  trackingUrl: string;
  caseCount: number;
  boxCount: number;
  loafCount: number;
  items: OrderItem[];
  subtotal: string;
  shipping: string;
  total: { amount: string };
  paymentTerms?: "card" | "account";
  invoicePaid?: boolean;
  invoiceDueAt?: string;
};

const SESSION_KEY = "db-wholesale-session";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function orderDate(value: string) {
  const parsed = new Date(String(value).replace(" ", "T") + (String(value).endsWith("Z") ? "" : "Z"));
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Thu, Sep 12" — the same wording the server uses on the order. */
function deliveryDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const TRACK_STEPS = ["Baking", "Packed", "Shipped"] as const;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

type StandingOrder = {
  weekday: number;
  weekdayName: string;
  active: boolean;
  lastRunStatus: string;
  lines: { sku: string; cases: number }[];
  summary: { caseCount: number; totalCents: number } | null;
};

function loadSession(): { token: string; email: string } | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function OrderPortal() {
  const [session, setSession] = useState<{ token: string; email: string } | null>(null);
  const [step, setStep] = useState<"email" | "code" | "shop" | "pay" | "paid">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [cutoff, setCutoff] = useState<Cutoff | null>(null);
  const [shipping, setShipping] = useState({ rateCents: 1250, unitsPerBox: 25 });
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [locationId, setLocationId] = useState("");
  const [standingOrder, setStandingOrder] = useState<StandingOrder | null>(null);
  const [standingWeekday, setStandingWeekday] = useState(2);
  const [standingBusy, setStandingBusy] = useState(false);
  const [standingNotice, setStandingNotice] = useState("");

  // The buyer's own paperwork on this order: their PO reference, and the day
  // they'd like it to arrive. Both optional — most orders carry neither.
  const [poNumber, setPoNumber] = useState("");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryWindow | null>(null);

  // Invoices and statements, for the buyer's bookkeeper.
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [openBalanceCents, setOpenBalanceCents] = useState(0);
  const [documentBusy, setDocumentBusy] = useState("");

  // Card step. The client secret can only confirm the one payment the server
  // priced, so nothing here can change what is charged.
  const [payment, setPayment] = useState<{
    clientSecret: string;
    publishableKey: string;
    customerSessionClientSecret?: string;
    summary: CheckoutSummary;
    deliverTo: DeliverTo;
  } | null>(null);
  const [paidIntentId, setPaidIntentId] = useState("");

  // Credit account: the buyer's position, and — after an on-account order —
  // the recorded order itself (no webhook, so no polling on confirmation).
  const [credit, setCredit] = useState<Credit | null>(null);
  const [accountOrder, setAccountOrder] = useState<ConfirmedOrder | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);

  // The stored session must be read after mount, not during the first render:
  // this page is server-rendered, the server has no localStorage, and reading
  // it in a state initialiser makes the client's first render disagree with
  // the server's HTML — React then throws away the tree and rehydrates.
  useEffect(() => {
    const stored = loadSession();
    if (stored?.token) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setSession(stored);
      setStep("shop");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, []);

  const signOut = useCallback(() => {
    try { window.localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setSession(null);
    setStep("email");
    setCart({});
    setProducts([]);
    setOrders([]);
    setPayment(null);
    setPaidIntentId("");
  }, []);

  const loadShop = useCallback(async (token: string) => {
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [catalogResponse, ordersResponse, standingResponse, documentsResponse] = await Promise.all([
        fetch("/api/buyer/catalog", { headers, cache: "no-store" }),
        fetch("/api/buyer/orders", { headers, cache: "no-store" }),
        fetch("/api/buyer/standing-order", { headers, cache: "no-store" }),
        fetch("/api/buyer/documents", { headers, cache: "no-store" }),
      ]);
      if (catalogResponse.status === 401 || catalogResponse.status === 403) {
        signOut();
        setError("Your session expired. Sign in again.");
        return;
      }
      if (!catalogResponse.ok) throw new Error("The catalog could not be loaded.");
      const catalog = await catalogResponse.json();
      setProducts(catalog.products || []);
      setLocations(catalog.locations || []);
      setLocationId((current) =>
        (catalog.locations || []).some((location: Location) => location.id === current)
          ? current
          : catalog.locations?.[0]?.id || "",
      );
      setRules(catalog.orderRules || null);
      setCutoff(catalog.cutoff || null);
      setCredit(catalog.credit || null);
      setDeliveryWindow(catalog.deliveryWindow || null);
      // A date chosen before the cutoff passed can become unreachable; drop it
      // rather than sending the server a date it will reject at checkout.
      setRequestedDeliveryDate((current) =>
        current && !(catalog.deliveryWindow?.options || []).includes(current) ? "" : current,
      );
      if (catalog.shipping) setShipping(catalog.shipping);
      if (ordersResponse.ok) {
        const data = await ordersResponse.json();
        setOrders(data.orders || []);
      }
      if (standingResponse.ok) {
        const data = await standingResponse.json();
        setStandingOrder(data.standingOrder || null);
      }
      if (documentsResponse.ok) {
        const data = await documentsResponse.json();
        setInvoices(data.invoices || []);
        setOpenBalanceCents(Number(data.openBalanceCents || 0));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The catalog could not be loaded.");
    }
  }, [signOut]);

  useEffect(() => {
    // loadShop awaits the network before it touches state, so this cannot
    // cascade a render; the rule cannot see across the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session?.token && step === "shop") void loadShop(session.token);
  }, [session, step, loadShop]);

  async function requestCode() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/buyer/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That didn't work. Try again.");
      setNotice(data.message);
      setStep("code");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/buyer/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That code didn't work.");
      const next = { token: data.token, email: data.account.email };
      try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* memory only */ }
      setSession(next);
      setStep("shop");
      setCode("");
      setNotice("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  function setCases(sku: string, cases: number) {
    setCart((current) => {
      const next = { ...current };
      if (cases <= 0) delete next[sku];
      else next[sku] = Math.min(200, cases);
      return next;
    });
  }

  const caseCount = Object.values(cart).reduce<number>((sum, value) => sum + value, 0);
  const subtotalCents = products.reduce<number>(
    (sum, product) => sum + Math.round(Number(product.variant.price.amount) * 100) * (cart[product.id] || 0),
    0,
  );
  // One case ships as one box, matching priceCart on the server exactly.
  const boxCount = caseCount;
  const shippingCents = boxCount * shipping.rateCents;

  async function checkout() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/buyer/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          lines: Object.entries(cart).map(([sku, cases]) => ({ sku, cases })),
          locationId,
          poNumber,
          requestedDeliveryDate,
        }),
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        signOut();
        setError("Your session expired. Sign in again.");
        return;
      }
      if (!response.ok || !data.clientSecret) {
        throw new Error(data.error || "Payment could not be started.");
      }
      setPayment({
        clientSecret: data.clientSecret,
        publishableKey: data.publishableKey,
        customerSessionClientSecret: data.customerSessionClientSecret || "",
        summary: data.summary,
        deliverTo: data.deliverTo,
      });
      setStep("pay");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment could not be started.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Places the cart on the buyer's credit account — no card. The endpoint
   * prices the same cart server-side, checks it against available credit,
   * and returns the recorded order for immediate confirmation.
   */
  async function orderOnAccount() {
    if (!session || !caseCount) return;
    setAccountBusy(true);
    setError("");
    try {
      const response = await fetch("/api/buyer/order-on-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          lines: Object.entries(cart).map(([sku, cases]) => ({ sku, cases })),
          locationId,
          poNumber,
          requestedDeliveryDate,
        }),
      });
      const data = await response.json();
      if (response.status === 401) {
        signOut();
        setError("Your session expired. Sign in again.");
        return;
      }
      if (!response.ok || !data.order) {
        throw new Error(data.error || "The order could not be placed on account.");
      }
      setAccountOrder(data.order as ConfirmedOrder);
      if (data.credit) setCredit(data.credit as Credit);
      setCart({});
      setPoNumber("");
      setRequestedDeliveryDate("");
      setStep("paid");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The order could not be placed on account.");
    } finally {
      setAccountBusy(false);
    }
  }

  async function saveStandingOrder() {
    if (!session || !caseCount) return;
    setStandingBusy(true);
    setStandingNotice("");
    try {
      const response = await fetch("/api/buyer/standing-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          weekday: standingWeekday,
          lines: Object.entries(cart).map(([sku, cases]) => ({ sku, cases })),
          locationId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That could not be saved.");
      setStandingOrder(data.standingOrder || null);
      setStandingNotice(`Saved — every ${WEEKDAYS[standingWeekday]}, charged to your saved card.`);
    } catch (caught) {
      setStandingNotice(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setStandingBusy(false);
    }
  }

  async function pauseStandingOrder() {
    if (!session) return;
    setStandingBusy(true);
    try {
      const response = await fetch("/api/buyer/standing-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ action: "pause" }),
      });
      const data = await response.json();
      if (response.ok) setStandingOrder(data.standingOrder || null);
    } finally {
      setStandingBusy(false);
    }
  }

  /**
   * Puts a past order's cases back in the cart. Items whose SKU has left the
   * catalog are skipped rather than failing the reorder, and the page scrolls
   * back to the summary so the refilled cart is in view.
   */
  function reorder(order: Order) {
    const next: Record<string, number> = {};
    for (const item of order.items) {
      if (item.quantity > 0 && products.some((product) => product.id === item.sku)) {
        next[item.sku] = item.quantity;
      }
    }
    setCart(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Opens an invoice or the account statement in a new tab.
   *
   * The tab is opened first, synchronously, and pointed at the document once
   * the signed link comes back — a browser blocks a window opened after an
   * await, which would silently do nothing when a buyer clicks "Invoice".
   */
  async function openDocument(kind: "invoice" | "statement", orderId = "") {
    if (!session) return;
    const tab = window.open("", "_blank", "noopener");
    setDocumentBusy(orderId || "statement");
    try {
      const response = await fetch("/api/buyer/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ kind, orderId }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "That document could not be opened.");
      if (tab) tab.location.href = data.url;
      else window.location.href = data.url;
    } catch (caught) {
      tab?.close();
      setError(caught instanceof Error ? caught.message : "That document could not be opened.");
    } finally {
      setDocumentBusy("");
    }
  }

  function paymentSucceeded(paymentIntentId: string) {
    setPaidIntentId(paymentIntentId);
    setPayment(null);
    setCart({});
    setPoNumber("");
    setRequestedDeliveryDate("");
    setStep("paid");
  }

  function backToCatalog() {
    setPaidIntentId("");
    setPayment(null);
    setAccountOrder(null);
    setStep("shop");
    if (session?.token) void loadShop(session.token);
  }

  if (step === "pay" && payment && session) {
    return (
      <CheckoutForm
        clientSecret={payment.clientSecret}
        customerSessionClientSecret={payment.customerSessionClientSecret}
        deliverTo={payment.deliverTo}
        onCancel={backToCatalog}
        onPaid={paymentSucceeded}
        publishableKey={payment.publishableKey}
        summary={payment.summary}
      />
    );
  }

  if (step === "paid" && (paidIntentId || accountOrder) && session) {
    return (
      <OrderConfirmation
        cutoffLabel={cutoff?.label || ""}
        initialOrder={accountOrder}
        onDone={backToCatalog}
        paymentIntentId={paidIntentId}
        token={session.token}
      />
    );
  }

  if (step !== "shop") {
    return (
      <div className="buyer-signin">
        <h2>Sign in to order</h2>
        <p>Wholesale pricing is visible only inside an approved account. Enter the email on your approved application and we&apos;ll send a six-digit code.</p>
        {step === "email" ? (
          <div className="buyer-field">
            <label htmlFor="buyer-email">Business email</label>
            <input
              id="buyer-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@business.com"
            />
            <button type="button" disabled={busy || !email.trim()} onClick={requestCode}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </div>
        ) : (
          <div className="buyer-field">
            <label htmlFor="buyer-code">Six-digit code</label>
            <input
              id="buyer-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="000000"
            />
            <button type="button" disabled={busy || code.length !== 6} onClick={verifyCode}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button type="button" className="buyer-link" onClick={() => { setStep("email"); setCode(""); }}>
              Use a different email
            </button>
          </div>
        )}
        {notice && <p className="buyer-notice" role="status">{notice}</p>}
        {error && <p className="buyer-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="buyer-shop">
      <header className="buyer-shop-head">
        <div>
          <p className="buyer-eyebrow">Approved account</p>
          <h2>Your wholesale catalog</h2>
          {locations.length > 1 ? (
            <div className="buyer-location-picker" role="radiogroup" aria-label="Delivery location">
              <span>Deliver to</span>
              {locations.map((location) => (
                <label key={location.id} className={location.id === locationId ? "active" : ""}>
                  <input
                    type="radio"
                    name="delivery-location"
                    checked={location.id === locationId}
                    onChange={() => setLocationId(location.id)}
                  />
                  <strong>{location.name}</strong>
                  {location.address && <small>{location.address.formattedAddress.join(", ")}</small>}
                </label>
              ))}
            </div>
          ) : locations[0]?.address ? (
            <p className="buyer-ship-to">
              Ships to <strong>{locations[0].name}</strong> — {locations[0].address.formattedAddress.join(", ")}
            </p>
          ) : null}
        </div>
        <div className="buyer-account-chip">
          <span>{session?.email}</span>
          <button type="button" className="buyer-link" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {cutoff && (
        <p className={cutoff.shipsToday ? "buyer-cutoff ships-today" : "buyer-cutoff"}>
          <strong>{cutoff.label}.</strong> Cutoff is {rules?.cutoffLabel}.
        </p>
      )}

      {credit?.enabled && (
        credit.overdueCents > 0 ? (
          <p className="buyer-credit-banner past-due" role="alert">
            <strong>Net {credit.termsDays || 15} account — past due.</strong>{" "}
            {money(credit.overdueCents)} of your invoice balance is past its due
            date, so new orders need a card until it&apos;s settled. Questions?
            sales@dallasbakery.com · (469) 729-4706.
          </p>
        ) : (
          <p className="buyer-credit-banner">
            <strong>Net {credit.termsDays || 15} account.</strong>{" "}
            {money(credit.availableCents)} available of your {money(credit.limitCents)} net limit
            {credit.outstandingCents > 0
              ? <> — {money(credit.outstandingCents)} on open invoices.</>
              : "."}{" "}
            Orders on account are invoiced; no card needed.
          </p>
        )
      )}

      <div className="buyer-shop-body">
        <div className="buyer-catalog">
          {products.map((product) => {
            const cases = cart[product.id] || 0;
            const priceCents = Math.round(Number(product.variant.price.amount) * 100);
            const perCase = product.variant.unitsPerCase || 25;
            const stock = product.stock;
            const soldOut = stock ? !stock.available : false;
            // The most this order may take: whichever of the per-order cap and
            // today's remaining capacity is tighter.
            const ceiling = stock?.maxPerOrder ?? 200;
            const spec = product.spec;
            const hasSpec = Boolean(
              spec && (spec.ingredients || spec.allergens || spec.netWeight || spec.certifications),
            );
            return (
              <article
                key={product.id}
                className={`buyer-case${cases ? " in-cart" : ""}${soldOut ? " sold-out" : ""}`}
              >
                {product.imageUrl && (
                  <div className="buyer-case-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.imageUrl} alt="" loading="lazy" />
                    <span className="buyer-case-tag">
                      {spec?.certifications ? spec.certifications.toUpperCase() : "KOSHER · HALAL"}
                    </span>
                    {soldOut && <span className="buyer-case-soldout">{stock?.label || "Sold out"}</span>}
                  </div>
                )}
                <div className="buyer-case-body">
                  <h3>{product.title}</h3>
                  <p>{product.description}</p>
                  {spec?.allergens && (
                    <p className="buyer-case-allergens">
                      <strong>Contains:</strong> {spec.allergens}
                    </p>
                  )}
                  <p className="buyer-case-price">
                    <strong>{money(priceCents)}</strong>
                    <span>per case</span>
                    <small>
                      {perCase} loaves · {money(Math.round(priceCents / perCase))} a loaf
                      {spec?.netWeight ? ` · ${spec.netWeight} each` : ""}
                    </small>
                  </p>
                  {stock && !soldOut && stock.label !== "In stock" && (
                    <p className="buyer-case-stock">{stock.label}</p>
                  )}
                  {hasSpec && spec && (
                    <details className="buyer-case-spec">
                      <summary>Ingredients &amp; product spec</summary>
                      <dl>
                        {spec.ingredients && (
                          <div><dt>Ingredients</dt><dd>{spec.ingredients}</dd></div>
                        )}
                        {spec.allergens && <div><dt>Contains</dt><dd>{spec.allergens}</dd></div>}
                        {spec.netWeight && <div><dt>Net weight</dt><dd>{spec.netWeight} per loaf</dd></div>}
                        {spec.shelfLife && <div><dt>Shelf life</dt><dd>{spec.shelfLife}</dd></div>}
                        {spec.storage && <div><dt>Storage</dt><dd>{spec.storage}</dd></div>}
                        {spec.certifications && <div><dt>Certifications</dt><dd>{spec.certifications}</dd></div>}
                      </dl>
                      <p>Copy this into your allergen file — it matches the printed bag word for word.</p>
                    </details>
                  )}
                  <div className="buyer-case-actions">
                    {soldOut ? (
                      <p className="buyer-case-unavailable">
                        {stock?.label || "Sold out"} — call {"(469) 729-4706"} if you need it today.
                      </p>
                    ) : (
                      <>
                        <div className="buyer-stepper">
                          <button type="button" onClick={() => setCases(product.id, cases - 1)} aria-label={`One fewer case of ${product.title}`}>−</button>
                          <span aria-live="polite">{cases}</span>
                          <button
                            type="button"
                            disabled={cases >= ceiling}
                            onClick={() => setCases(product.id, Math.min(ceiling, cases + 1))}
                            aria-label={`One more case of ${product.title}`}
                          >
                            +
                          </button>
                        </div>
                        {cases > 0 && (
                          <span className="buyer-case-line">{cases * perCase} loaves · {money(priceCents * cases)}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="buyer-summary">
          <h3>Order summary</h3>
          {caseCount ? (
            <ul className="buyer-summary-lines">
              {products.filter((product) => cart[product.id]).map((product) => {
                const cases = cart[product.id] || 0;
                const priceCents = Math.round(Number(product.variant.price.amount) * 100);
                return (
                  <li key={product.id}>
                    <span>{product.title}</span>
                    <span>{cases} × {money(priceCents)}</span>
                    <strong>{money(priceCents * cases)}</strong>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="buyer-summary-empty">Add cases to see your total.</p>
          )}
          <p><span>Subtotal — {caseCount} case{caseCount === 1 ? "" : "s"}</span><span>{money(subtotalCents)}</span></p>
          <p><span>Shipping — {boxCount} box{boxCount === 1 ? "" : "es"}</span><span>{money(shippingCents)}</span></p>
          <p className="buyer-total"><span>Total</span><span>{money(subtotalCents + shippingCents)}</span></p>
          <small>
            One case ships as one box at {money(shipping.rateCents)}. No sales tax on bakery items.
            {rules ? ` ${rules.minimumLabel} minimum. Delivery in ${rules.leadTimeLabel}.` : ""}
          </small>

          {/* Both optional. A buyer whose accounts payable needs a PO puts it
              here so it lands on the invoice and the packing slip. */}
          <div className="buyer-order-fields">
            <label className="buyer-field-inline">
              <span>PO number <em>optional</em></span>
              <input
                value={poNumber}
                maxLength={40}
                onChange={(event) => setPoNumber(event.target.value)}
                placeholder="Your reference"
              />
            </label>
            {deliveryWindow && deliveryWindow.options.length > 0 && (
              <label className="buyer-field-inline">
                <span>Delivery day <em>optional</em></span>
                <select
                  value={requestedDeliveryDate}
                  onChange={(event) => setRequestedDeliveryDate(event.target.value)}
                >
                  <option value="">As soon as it arrives</option>
                  {deliveryWindow.options.map((option) => (
                    <option key={option} value={option}>
                      {deliveryDate(option)}
                      {option === deliveryWindow.earliest ? " — earliest" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {deliveryWindow && (
            <small className="buyer-delivery-note">
              {requestedDeliveryDate
                ? `We'll aim for ${deliveryDate(requestedDeliveryDate)}. UPS Ground dates are a request, not a guarantee.`
                : `Shipping ${deliveryDate(deliveryWindow.shipDate)}, most orders landing ${deliveryDate(deliveryWindow.earliest)}–${deliveryDate(deliveryWindow.latest)}.`}
            </small>
          )}
          {credit?.enabled && credit.overdueCents === 0 && caseCount > 0 && subtotalCents + shippingCents <= credit.availableCents ? (
            /* A buyer with credit defaults to their account — no card asked
               for. Card stays one click away for whoever prefers it. */
            <>
              <button type="button" disabled={busy || accountBusy} onClick={() => void orderOnAccount()}>
                {accountBusy ? "Placing order…" : "Place order on account — no card"}
              </button>
              <button
                type="button"
                className="buyer-account-button"
                disabled={busy || accountBusy}
                onClick={checkout}
              >
                {busy ? "Preparing…" : "Pay by card instead"}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy || accountBusy || !caseCount} onClick={checkout}>
                {busy ? "Preparing…" : "Continue to payment"}
              </button>
              {credit?.enabled && caseCount > 0 && credit.overdueCents > 0 ? (
                <small className="buyer-credit-short">
                  Your Net {credit.termsDays || 15} balance is past due ({money(credit.overdueCents)} overdue) — pay this order by card. Your account reopens once the past-due balance is settled.
                </small>
              ) : credit?.enabled && caseCount > 0 && subtotalCents + shippingCents > credit.availableCents ? (
                <small className="buyer-credit-short">
                  {credit.outstandingCents > 0
                    ? `This order is over your available credit (${money(credit.availableCents)} left). Pay your open invoice balance (${money(credit.outstandingCents)}) to free up credit, or pay this order by card.`
                    : `This order is over your ${money(credit.limitCents)} net limit, so it needs a card — or place a smaller order on account.`}
                </small>
              ) : null}
            </>
          )}
          {error && <p className="buyer-error" role="alert">{error}</p>}

          <div className="buyer-standing">
            <h4>Standing weekly order</h4>
            {standingOrder?.active ? (
              <>
                <p>
                  Every <strong>{standingOrder.weekdayName}</strong>
                  {standingOrder.summary
                    ? <> · {standingOrder.summary.caseCount} case{standingOrder.summary.caseCount === 1 ? "" : "s"} · {money(standingOrder.summary.totalCents)}</>
                    : null}
                  , charged to your saved card and confirmed by email.
                </p>
                {standingOrder.lastRunStatus.startsWith("failed") && (
                  <p className="buyer-error">Last run needs attention — check your email.</p>
                )}
                <button type="button" className="buyer-link" disabled={standingBusy} onClick={() => void pauseStandingOrder()}>
                  Pause standing order
                </button>
              </>
            ) : caseCount ? (
              <>
                <p>Get these {caseCount} case{caseCount === 1 ? "" : "s"} automatically every week — pay by card once, and the saved card covers the rest.</p>
                <div className="buyer-standing-row">
                  <select
                    aria-label="Day of the week"
                    value={standingWeekday}
                    onChange={(event) => setStandingWeekday(Number(event.target.value))}
                  >
                    {WEEKDAYS.map((day, index) => (
                      <option key={day} value={index}>Every {day}</option>
                    ))}
                  </select>
                  <button type="button" disabled={standingBusy} onClick={() => void saveStandingOrder()}>
                    {standingBusy ? "Saving…" : "Make it weekly"}
                  </button>
                </div>
              </>
            ) : (
              <p>Add cases above, then make them your automatic weekly order.</p>
            )}
            {standingNotice && <p className="buyer-notice">{standingNotice}</p>}
          </div>
        </aside>
      </div>

      {invoices.length > 0 && (
        <section className="buyer-invoices">
          <div className="buyer-invoices-head">
            <div>
              <h3>Invoices &amp; statements</h3>
              <p>
                {openBalanceCents > 0
                  ? <>Your open balance is <strong>{money(openBalanceCents)}</strong>. Each invoice opens ready to print or save as a PDF.</>
                  : "Every invoice opens ready to print or save as a PDF. Nothing is currently outstanding."}
              </p>
            </div>
            <button
              type="button"
              className="buyer-link"
              disabled={documentBusy !== ""}
              onClick={() => void openDocument("statement")}
            >
              {documentBusy === "statement" ? "Opening…" : "Open account statement"}
            </button>
          </div>
          <table className="buyer-invoice-table">
            <thead>
              <tr><th>Invoice</th><th>Date</th><th>PO</th><th>Status</th><th>Amount</th><th /></tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.orderId} className={invoice.status === "overdue" ? "overdue" : ""}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{orderDate(invoice.placedAt)}</td>
                  <td>{invoice.poNumber || "—"}</td>
                  <td><span className={`buyer-invoice-pill ${invoice.status}`}>{invoice.statusLabel}</span></td>
                  <td>{money(invoice.totalCents)}</td>
                  <td>
                    <button
                      type="button"
                      className="buyer-link"
                      disabled={documentBusy !== ""}
                      onClick={() => void openDocument("invoice", invoice.orderId)}
                    >
                      {documentBusy === invoice.orderId ? "Opening…" : "Open"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {orders.length > 0 && (
        <section className="buyer-orders">
          <h3>My orders</h3>
          <div className="buyer-order-list">
            {orders.map((order) => (
              <article className="buyer-order" key={order.id}>
                <div className="buyer-order-head">
                  <div>
                    <strong className="buyer-order-name">{order.name}</strong>
                    <span className="buyer-order-date">
                      {orderDate(order.processedAt)}
                      {" · "}
                      {order.caseCount} case{order.caseCount === 1 ? "" : "s"}
                      {" · "}
                      {order.boxCount} box{order.boxCount === 1 ? "" : "es"}
                    </span>
                  </div>
                  <div className="buyer-order-amount">
                    <strong>${order.total.amount}</strong>
                    <span className={`buyer-order-pill stage-${order.stage}`}>{order.stageLabel}</span>
                    {order.paymentTerms === "account" && (
                      <span className={`buyer-order-terms ${order.invoicePaid ? "settled" : ""}`}>
                        {order.invoicePaid
                          ? "Invoice paid"
                          : `On account${order.invoiceDueAt ? ` · due ${order.invoiceDueAt}` : ""}`}
                      </span>
                    )}
                  </div>
                </div>

                {order.stage !== "refunded" && (
                <ol className="buyer-order-track" aria-label={`Status: ${order.stageLabel}`}>
                  {TRACK_STEPS.map((label, index) => (
                    <li key={label} className={order.stageStep >= index + 1 ? "done" : ""}>
                      <span aria-hidden="true" />
                      {label}
                    </li>
                  ))}
                </ol>
                )}
                <p className="buyer-order-detail">{order.stageDetail}</p>

                {order.stage === "refunded" ? null : order.trackable ? (
                  <a className="buyer-track-link" href={order.trackingUrl} target="_blank" rel="noreferrer">
                    <span>
                      <small>TRACK SHIPMENT · UPS</small>
                      {order.trackingNumber}
                    </span>
                    <span aria-hidden="true">→</span>
                  </a>
                ) : (
                  <p className="buyer-order-pending">
                    A tracking number appears here the moment UPS collects your boxes.
                  </p>
                )}

                <button type="button" className="buyer-reorder" onClick={() => reorder(order)}>
                  Order these cases again →
                </button>

                <details className="buyer-order-items">
                  <summary>What was in this order</summary>
                  <ul>
                    {order.items.map((item) => (
                      <li key={item.sku}>
                        <span>{item.name}</span>
                        <span>{item.quantity} case{item.quantity === 1 ? "" : "s"}</span>
                      </li>
                    ))}
                    <li className="buyer-order-item-total">
                      <span>Subtotal ${order.subtotal} · Shipping ${order.shipping}</span>
                      <span>${order.total.amount}</span>
                    </li>
                  </ul>
                </details>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
