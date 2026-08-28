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

export type CatalogProduct = {
  id: string;
  handle: string;
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  variant: CatalogVariant;
};

export type CartQuantityMap = Record<string, number>;

export type MainTab = "home" | "catalog" | "orders" | "locations" | "account";
