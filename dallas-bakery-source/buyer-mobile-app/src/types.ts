export type BuyerApplicationStatus = "pending" | "approved" | "declined";

export type ShippingSettings = {
  rateCents: number;
  unitsPerBox: number;
  formattedRate: string;
  updatedAt?: string | null;
};

export type Address = {
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
};

export type ApplicationInput = {
  contactName: string;
  businessName: string;
  businessType: string;
  email: string;
  phone: string;
  website: string;
  storeAddress: Address;
  multipleLocations: boolean;
  locationCount: number;
  additionalMarkets: string;
  privacyAgreement: boolean;
};

export type TrackedApplication = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  primaryLocation: Address;
  multipleLocations: boolean;
  locationCount: number;
  additionalMarkets: string;
  status: BuyerApplicationStatus;
  orderingReady: boolean;
  createdAt: string;
  decidedAt: string | null;
};

export type BuyerSession = {
  accessToken: string;
  idToken: string;
  expiresAt: number;
};

export type BuyerLocation = {
  id: string;
  name: string;
  companyName: string;
  currencyCode: string;
  address: {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    formattedAddress: string[];
  } | null;
};

export type OrderStage = "paid" | "labeled" | "shipped" | "refunded";

export type OrderLineItem = {
  sku: string;
  name: string;
  /** Cases of this product. */
  quantity: number;
  unitAmountCents: number;
};

export type BuyerOrder = {
  id: string;
  name: string;
  processedAt: string;
  shippedAt: string | null;

  /** Where the order is, in the buyer's language. */
  stage: OrderStage;
  stageLabel: string;
  stageDetail: string;
  stageStep: 1 | 2 | 3;

  /**
   * True once UPS can actually show something. A tracking number exists from
   * the moment a label is bought, so the button is gated on this, not on the
   * number being present.
   */
  trackable: boolean;
  trackingNumber: string;
  trackingUrl: string;

  caseCount: number;
  boxCount: number;
  loafCount: number;
  items: OrderLineItem[];

  subtotal: string;
  shipping: string;
  total: { amount: string; currencyCode: string };

  /** "account" was placed on credit and is invoiced; "card" was charged. */
  paymentTerms?: "card" | "account";
  invoicePaid?: boolean;
  /** Account orders: when the invoice is due (YYYY-MM-DD). */
  invoiceDueAt?: string;
  /** The buyer's own purchase-order reference, when they gave one. */
  poNumber?: string;
  /** The delivery day the buyer asked for (YYYY-MM-DD), when they picked one. */
  requestedDeliveryDate?: string;

  deliverTo: {
    name: string;
    street: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
  };

  fulfillmentStatus: string;
  financialStatus: string | null;
  statusPageUrl: string;
};

export type BuyerAccount = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  locations: BuyerLocation[];
  orders: BuyerOrder[];
};

export type QuantityRule = {
  minimum: number;
  maximum: number | null;
  increment: number;
};

export type CatalogVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  /** Price of one CASE, not one loaf. The server is the price authority. */
  price: { amount: string; currencyCode: string };
  /** Quantity rules are counted in cases. */
  quantityRule: QuantityRule;
  /** Loaves in a case. Sent by the server; falls back to LOAVES_PER_CASE. */
  unitsPerCase?: number;
};

/**
 * The words on the physical label, carried in the catalog so a chef can read
 * and file them without squinting at a photo of a bag.
 */
export type ProductSpec = {
  ingredients: string;
  allergens: string;
  netWeight: string;
  shelfLife: string;
  storage: string;
  certifications: string;
};

export type StockState = {
  available: boolean;
  /** Cases still sellable today, or null when there is no daily limit. */
  remainingToday: number | null;
  /** Most cases one order may take, or null when uncapped. */
  maxPerOrder: number | null;
  label: string;
};

export type CatalogProduct = {
  id: string;
  handle: string;
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  spec?: ProductSpec;
  stock?: StockState;
  variant: CatalogVariant;
};

/** The days a buyer may request delivery for, from today's cutoff. */
export type DeliveryWindow = {
  shipDate: string;
  earliest: string;
  latest: string;
  options: string[];
};

/** One row in the buyer's invoice list. */
export type BuyerInvoice = {
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

export type CartQuantityMap = Record<string, number>;

export type MainTab = "home" | "catalog" | "orders" | "locations" | "account";
