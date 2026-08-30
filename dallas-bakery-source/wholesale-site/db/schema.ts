import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const wholesaleApplications = sqliteTable(
  "wholesale_applications",
  {
    id: text("id").primaryKey(),
    businessName: text("business_name").notNull(),
    businessType: text("business_type").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    website: text("website").notNull().default(""),
    street: text("street").notNull(),
    street2: text("street_2").notNull().default(""),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    multipleLocations: integer("multiple_locations", { mode: "boolean" })
      .notNull()
      .default(false),
    locationCount: integer("location_count").notNull().default(1),
    additionalMarkets: text("additional_markets").notNull().default(""),
    screeningStatus: text("screening_status").notNull(),
    addressScreening: text("address_screening").notNull(),
    categoryScreening: text("category_screening").notNull(),
    standardizedAddress: text("standardized_address").notNull().default(""),
    matchedBusiness: text("matched_business").notNull().default(""),
    termsVersion: text("terms_version").notNull().default(""),
    termsAcceptedAt: text("terms_accepted_at").notNull().default(""),
    trackingTokenHash: text("tracking_token_hash").notNull().default(""),
    trackingTokenIssuedAt: integer("tracking_token_issued_at").notNull().default(0),
    status: text("status", { enum: ["pending", "approved", "declined"] })
      .notNull()
      .default("pending"),
    ownerNotes: text("owner_notes").notNull().default(""),
    // Stripe Customer for this business, created on first card payment so a
    // saved card can be reused — including off-session for standing orders.
    stripeCustomerId: text("stripe_customer_id").notNull().default(""),
    // Owner-granted credit line in cents. Zero means card-only. Orders placed
    // on account count against it until their invoice is marked paid.
    creditLimitCents: integer("credit_limit_cents").notNull().default(0),
    // Net payment terms in days (15 or 30), chosen by the owner per business.
    // Zero means no net terms. Only credit customers carry terms.
    creditTermsDays: integer("credit_terms_days").notNull().default(0),
    // Set when the buyer closes the account from the app. The row survives
    // because order records point at it, but its personal details are
    // scrubbed and every buyer lookup excludes it — so a live session stops
    // working the moment this is stamped.
    closedAt: text("closed_at"),
    closedReason: text("closed_reason").notNull().default(""),
    decidedBy: text("decided_by").notNull().default(""),
    decidedAt: text("decided_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("wholesale_applications_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("wholesale_applications_email_idx").on(table.email),
    index("wholesale_applications_tracking_token_idx").on(table.trackingTokenHash),
    index("wholesale_applications_closed_idx").on(table.closedAt),
  ],
);

export const adminAccounts = sqliteTable("admin_accounts", {
  email: text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  credentialEpoch: text("credential_epoch").notNull().default("1"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminLoginAttempts = sqliteTable("admin_login_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  firstFailedAt: integer("first_failed_at").notNull().default(0),
  lockedUntil: integer("locked_until").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const publicSubmissionLimits = sqliteTable("public_submission_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: integer("window_started_at").notNull().default(0),
  blockedUntil: integer("blocked_until").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const wholesaleShippingSettings = sqliteTable("wholesale_shipping_settings", {
  id: text("id").primaryKey(),
  rateCents: integer("rate_cents").notNull().default(1250),
  unitsPerBox: integer("units_per_box").notNull().default(25),
  // Parcel details for UPS label creation. Carton is 24 x 16 x 6 in; a
  // packed box weighs 27 lb (432 oz) — the owner's measured weight.
  boxWeightOz: integer("box_weight_oz").notNull().default(432),
  boxLengthIn: integer("box_length_in").notNull().default(24),
  boxWidthIn: integer("box_width_in").notNull().default(16),
  boxHeightIn: integer("box_height_in").notNull().default(6),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Orders — one row per paid Stripe Checkout session, for both the retail
 * store (dallasbakery.com) and the wholesale store (dallasbakery.net).
 * This is the shipping queue the admin portal prints UPS labels from.
 */
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  // "retail" or "wholesale" — set from Checkout Session metadata.
  channel: text("channel").notNull(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull().default(""),
  orderNumber: integer("order_number").notNull(),
  customerName: text("customer_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  street: text("street").notNull().default(""),
  street2: text("street2").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  zip: text("zip").notNull().default(""),
  // JSON array of { sku, name, quantity, unitAmountCents }.
  itemsJson: text("items_json").notNull().default("[]"),
  loafCount: integer("loaf_count").notNull().default(0),
  boxCount: integer("box_count").notNull().default(1),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  shippingCents: integer("shipping_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  // Which wholesale application placed the order. Empty for retail.
  applicationId: text("application_id").notNull().default(""),
  // "card" was charged at checkout; "account" is invoiced against the
  // buyer's credit limit and stays outstanding until invoicePaidAt is set.
  paymentTerms: text("payment_terms").notNull().default("card"),
  invoicePaidAt: text("invoice_paid_at"),
  // Account orders only: when the invoice is due, stamped at order time from
  // the customer's net terms so a later terms change never moves it.
  invoiceDueAt: text("invoice_due_at"),
  // The buyer's own purchase-order reference, for their accounts-payable team.
  poNumber: text("po_number").notNull().default(""),
  // The delivery date the buyer asked for (YYYY-MM-DD), when they chose one.
  requestedDeliveryDate: text("requested_delivery_date"),
  // paid -> labeled -> shipped -> delivered, with held and cancelled as the
  // two ways an order leaves that path. "refunded" is kept for orders that
  // were sent back in full; a partial refund leaves the status alone and
  // records the amount in refundedCents.
  status: text("status").notNull().default("paid"),
  // Why the owner paused it — a bad address, a credit question, an oven
  // problem. Cleared when it is released.
  holdReason: text("hold_reason").notNull().default(""),
  // The buyer asked to cancel. The owner still has to agree, because by then
  // the bread may already be baked.
  cancelRequestedAt: text("cancel_requested_at"),
  cancelReason: text("cancel_reason").notNull().default(""),
  cancelledAt: text("cancelled_at"),
  deliveredAt: text("delivered_at"),
  // Money sent back, in cents. A short shipment is refunded in part and the
  // rest of the order still ships, so this is an amount and not a flag.
  refundedCents: integer("refunded_cents").notNull().default(0),
  trackingNumber: text("tracking_number").notNull().default(""),
  labelFormat: text("label_format").notNull().default(""),
  // Base64 label payload returned by UPS (ZPL for thermal printers).
  labelData: text("label_data").notNull().default(""),
  labelError: text("label_error").notNull().default(""),
  labeledAt: text("labeled_at"),
  shippedAt: text("shipped_at"),
  trackingEmailSentAt: text("tracking_email_sent_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * One-time sign-in codes for approved wholesale buyers. One row per email:
 * requesting a new code replaces the old one, so an old code can never be
 * used after a fresh one is sent.
 */
export const buyerLoginCodes = sqliteTable("buyer_login_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  createdAt: integer("created_at").notNull().default(0),
});

/**
 * Additional approved delivery addresses for a business. The application's
 * own storefront is always the primary; the owner adds these in /admin, which
 * is the screening step. Buyers choose among approved addresses at checkout
 * and can never add one themselves.
 */
export const buyerLocations = sqliteTable(
  "buyer_locations",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id").notNull(),
    name: text("name").notNull().default(""),
    street: text("street").notNull(),
    street2: text("street2").notNull().default(""),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("buyer_locations_application_idx").on(table.applicationId, table.active),
  ],
);

/**
 * One standing weekly order per buyer. `lines` uses the same compact
 * "SKU:cases|SKU:cases" encoding as Stripe metadata and is re-priced from the
 * catalog on every run, so a price change never silently charges the old
 * amount. `lastRunDate` (Central-time YYYY-MM-DD) makes the daily cron
 * idempotent: a retried run on the same day is a no-op.
 */
export const standingOrders = sqliteTable("standing_orders", {
  applicationId: text("application_id").primaryKey(),
  email: text("email").notNull(),
  // 0 = Sunday … 6 = Saturday, evaluated in Central time.
  weekday: integer("weekday").notNull(),
  lines: text("lines").notNull(),
  locationId: text("location_id").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastRunDate: text("last_run_date").notNull().default(""),
  lastRunStatus: text("last_run_status").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * The product catalog. The owner adds, edits, and retires breads in /admin;
 * pricing and per-case parcel details live here so UPS labels are bought from
 * each item's own weight and dimensions. Orders snapshot their line items, so
 * editing or deleting a product never rewrites history.
 */
export const products = sqliteTable("products", {
  sku: text("sku").primaryKey(),
  handle: text("handle").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  loafPriceCents: integer("loaf_price_cents").notNull(),
  loavesPerCase: integer("loaves_per_case").notNull().default(25),
  imageUrl: text("image_url").notNull().default("/images/case.jpg"),
  boxWeightOz: integer("box_weight_oz").notNull().default(432),
  boxLengthIn: integer("box_length_in").notNull().default(24),
  boxWidthIn: integer("box_width_in").notNull().default(16),
  boxHeightIn: integer("box_height_in").notNull().default(6),
  // Food spec, in the buyer's own words. The physical label carries these
  // already; these fields put the same text in the catalog where a buyer can
  // read, copy, and file it for their own allergen matrix.
  ingredients: text("ingredients").notNull().default(""),
  allergens: text("allergens").notNull().default(""),
  netWeight: text("net_weight").notNull().default(""),
  shelfLife: text("shelf_life").notNull().default(""),
  storage: text("storage").notNull().default(""),
  certifications: text("certifications").notNull().default(""),
  // Stock control. inStock is the "sold out today" switch; the capacity
  // numbers stop the oven being oversold. Zero means no limit.
  inStock: integer("in_stock", { mode: "boolean" }).notNull().default(true),
  dailyCapacityCases: integer("daily_capacity_cases").notNull().default(0),
  maxCasesPerOrder: integer("max_cases_per_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Exclusive per-customer prices. One row overrides one product's price per
 * loaf for one business; no row means the catalog price applies. Overrides
 * are resolved server-side everywhere a cart is priced, so an exclusive
 * price follows the buyer through checkout, standing orders, and intake.
 */
export const customerPrices = sqliteTable(
  "customer_prices",
  {
    applicationId: text("application_id").notNull(),
    sku: text("sku").notNull(),
    loafPriceCents: integer("loaf_price_cents").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.applicationId, table.sku] })],
);

/**
 * The marketing email list — deliberately separate from transactional mail.
 * Nobody lands here without ticking a box, and every row carries its own
 * unsubscribe token so any send can include a working one-click footer.
 */
export const marketingSubscribers = sqliteTable(
  "marketing_subscribers",
  {
    email: text("email").primaryKey(),
    businessName: text("business_name").notNull().default(""),
    source: text("source").notNull().default("application"),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    subscribedAt: text("subscribed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    unsubscribedAt: text("unsubscribed_at"),
  },
  (table) => [index("marketing_subscribers_active_idx").on(table.unsubscribedAt)],
);

/**
 * Expo push tokens, one row per device. `audience` separates the buyer app
 * from the owner app; a buyer's token is scoped to the business it signed in
 * as, so an order update only ever reaches that business's own devices.
 */
export const pushDevices = sqliteTable(
  "push_devices",
  {
    token: text("token").primaryKey(),
    audience: text("audience").notNull().default("buyer"),
    applicationId: text("application_id").notNull().default(""),
    email: text("email").notNull().default(""),
    platform: text("platform").notNull().default(""),
    // What this device wants to hear about. Stored server-side because that
    // is where the decision to send is made; a switch that only lived on the
    // phone could not stop a push already on its way.
    orderUpdates: integer("order_updates", { mode: "boolean" }).notNull().default(true),
    invoiceReminders: integer("invoice_reminders", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("push_devices_audience_idx").on(table.audience, table.applicationId)],
);

/**
 * Everything that ever happened to an order, in order, never edited.
 *
 * This is what answers "what happened to order 1042, who did it, and what did
 * we tell the buyer" six months later — for a dispute, a chargeback, or an
 * accountant. Rows are only ever inserted.
 */
export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    kind: text("kind").notNull(),
    /** One line, written for whoever reads it next. */
    summary: text("summary").notNull(),
    /** Anything longer: an address correction, a refund reason, a note. */
    detail: text("detail").notNull().default(""),
    /** "owner:sales@…", "buyer:ap@…", "system", "stripe". Never blank. */
    actor: text("actor").notNull(),
    /** Money moved by this event, in cents. Zero for everything else. */
    amountCents: integer("amount_cents").notNull().default(0),
    /** Whether the buyer sees this line in their own order history. */
    buyerVisible: integer("buyer_visible", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("order_events_order_idx").on(table.orderId, table.createdAt)],
);

/**
 * A problem a buyer raised, and what the bakery did about it.
 *
 * Reasons are structured rather than free text so the owner can see that
 * three shops reported a damaged box on the same day — which is a pallet
 * problem, not three unlucky customers.
 */
export const supportCases = sqliteTable(
  "support_cases",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id").notNull(),
    businessName: text("business_name").notNull().default(""),
    contactEmail: text("contact_email").notNull().default(""),
    /** Empty when the question is not about one order. */
    orderId: text("order_id").notNull().default(""),
    orderNumber: integer("order_number").notNull().default(0),
    reason: text("reason").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("open"),
    /** What the bakery said back. The buyer sees this. */
    reply: text("reply").notNull().default(""),
    /** Internal, never shown to the buyer. */
    ownerNotes: text("owner_notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("support_cases_status_idx").on(table.status, table.createdAt),
    index("support_cases_application_idx").on(table.applicationId),
  ],
);
