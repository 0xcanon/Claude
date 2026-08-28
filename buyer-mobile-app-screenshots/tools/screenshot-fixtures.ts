import type {
  BuyerAccount,
  CatalogProduct,
  ShippingSettings,
  TrackedApplication,
} from "./types";
import type { ConfirmedOrder, PaymentStart } from "./lib/storefront";

export const shipping: ShippingSettings = {
  rateCents: 1250,
  unitsPerBox: 25,
  formattedRate: "$12.50",
  updatedAt: "2026-08-20T15:00:00.000Z",
};

export const account: BuyerAccount = {
  id: "app_7Yh2",
  displayName: "Mina Farahani",
  firstName: "Mina",
  lastName: "Farahani",
  email: "mina@saffronkitchen.com",
  locations: [
    {
      id: "loc-lower-greenville",
      name: "Saffron Kitchen — Lower Greenville",
      companyName: "Saffron Kitchen Group",
      currencyCode: "USD",
      address: {
        address1: "1914 Greenville Ave",
        address2: "Suite 120",
        city: "Dallas",
        state: "TX",
        zip: "75206",
        formattedAddress: ["1914 Greenville Ave, Suite 120", "Dallas TX 75206"],
      },
    },
    {
      id: "loc-plano",
      name: "Saffron Kitchen — Plano",
      companyName: "Saffron Kitchen Group",
      currencyCode: "USD",
      address: {
        address1: "4400 Legacy Dr",
        address2: "",
        city: "Plano",
        state: "TX",
        zip: "75024",
        formattedAddress: ["4400 Legacy Dr", "Plano TX 75024"],
      },
    },
    {
      id: "loc-richardson",
      name: "Saffron Market — Richardson",
      companyName: "Saffron Kitchen Group",
      currencyCode: "USD",
      address: {
        address1: "101 S Coit Rd",
        address2: "Bldg C",
        city: "Richardson",
        state: "TX",
        zip: "75080",
        formattedAddress: ["101 S Coit Rd, Bldg C", "Richardson TX 75080"],
      },
    },
  ],
  orders: [
    {
      id: "ord-1042",
      name: "#1042",
      processedAt: "2026-08-21T16:12:00.000Z",
      shippedAt: "2026-08-21T23:40:00.000Z",
      stage: "shipped",
      stageLabel: "Shipped",
      stageDetail: "On its way. Track it with the number below.",
      stageStep: 3,
      trackable: true,
      trackingNumber: "1Z999AA10123456784",
      trackingUrl: "https://www.ups.com/track?loc=en_US&tracknum=1Z999AA10123456784",
      caseCount: 3,
      boxCount: 3,
      loafCount: 75,
      items: [
        { sku: "WS-BARBARI-25", name: "Barbari — Case of 25", quantity: 2, unitAmountCents: 6_250 },
        { sku: "WS-NATURAL-25", name: "Natural, No Sesame — Case of 25", quantity: 1, unitAmountCents: 6_250 },
      ],
      subtotal: "187.50",
      shipping: "37.50",
      total: { amount: "225.00", currencyCode: "USD" },
      deliverTo: {
        name: "Saffron Kitchen Group",
        street: "1914 Greenville Ave",
        street2: "Suite 120",
        city: "Dallas",
        state: "TX",
        zip: "75206",
      },
      fulfillmentStatus: "FULFILLED",
      financialStatus: "PAID",
      statusPageUrl: "https://www.ups.com/track?loc=en_US&tracknum=1Z999AA10123456784",
    },
    {
      id: "ord-1036",
      name: "#1036",
      processedAt: "2026-08-27T14:03:00.000Z",
      shippedAt: null,
      stage: "labeled",
      stageLabel: "Packed",
      stageDetail: "Boxed and waiting for the UPS pickup.",
      stageStep: 2,
      trackable: false,
      trackingNumber: "",
      trackingUrl: "",
      caseCount: 2,
      boxCount: 2,
      loafCount: 50,
      items: [
        { sku: "WS-SESAME-25", name: "Sesame — Case of 25", quantity: 2, unitAmountCents: 4_500 },
      ],
      subtotal: "90.00",
      shipping: "25.00",
      total: { amount: "115.00", currencyCode: "USD" },
      deliverTo: {
        name: "Saffron Kitchen Group",
        street: "4400 Legacy Dr",
        street2: "",
        city: "Plano",
        state: "TX",
        zip: "75024",
      },
      fulfillmentStatus: "UNFULFILLED",
      financialStatus: "PAID",
      statusPageUrl: "",
    },
    {
      id: "ord-1021",
      name: "#1021",
      processedAt: "2026-08-28T09:41:00.000Z",
      shippedAt: null,
      stage: "paid",
      stageLabel: "Baking",
      stageDetail: "Your cases are in the bake schedule.",
      stageStep: 1,
      trackable: false,
      trackingNumber: "",
      trackingUrl: "",
      caseCount: 4,
      boxCount: 4,
      loafCount: 100,
      items: [
        { sku: "WS-BARBARI-25", name: "Barbari — Case of 25", quantity: 3, unitAmountCents: 6_250 },
        { sku: "WS-WHEAT-25", name: "Whole Wheat — Case of 25", quantity: 1, unitAmountCents: 6_250 },
      ],
      subtotal: "250.00",
      shipping: "50.00",
      total: { amount: "300.00", currencyCode: "USD" },
      deliverTo: {
        name: "Saffron Kitchen Group",
        street: "1914 Greenville Ave",
        street2: "Suite 120",
        city: "Dallas",
        state: "TX",
        zip: "75206",
      },
      fulfillmentStatus: "UNFULFILLED",
      financialStatus: "PAID",
      statusPageUrl: "",
    },
  ],
};

/**
 * Shaped exactly like /api/buyer/catalog's catalogForClients(): the id is the
 * SKU, the price is the price of a whole CASE, and quantity rules count cases.
 */
function caseProduct(sku: string, title: string, description: string, casePrice: string): CatalogProduct {
  return {
    id: sku,
    handle: sku.toLowerCase(),
    title,
    description,
    imageUrl: "",
    imageAlt: title,
    variant: {
      id: sku,
      title: "Case of 25",
      availableForSale: true,
      price: { amount: casePrice, currencyCode: "USD" },
      quantityRule: { minimum: 1, maximum: null, increment: 1 },
      unitsPerCase: 25,
    },
  };
}

export const products: CatalogProduct[] = [
  caseProduct("WS-BARBARI-25", "Barbari — Case of 25", "The classic Persian flatbread, hand-raked and sesame-finished.", "62.50"),
  caseProduct("WS-NATURAL-25", "Natural, No Sesame — Case of 25", "Same dough and bake, finished plain.", "62.50"),
  caseProduct("WS-WHEAT-25", "Whole Wheat — Case of 25", "Nuttier and denser, holds up under soups and stews.", "62.50"),
  caseProduct("WS-SESAME-25", "Sesame — Case of 25", "Generously seeded across the whole loaf.", "45.00"),
];

/** Case counts, matching what the app sends to checkout. */
export const cart = {
  "WS-BARBARI-25": 2,
  "WS-NATURAL-25": 1,
};

export const pendingApplication: TrackedApplication = {
  id: "app_7Yh2",
  businessName: "Saffron Kitchen Group",
  contactName: "Mina Farahani",
  email: "mina@saffronkitchen.com",
  primaryLocation: {
    street: "1914 Greenville Ave",
    street2: "Suite 120",
    city: "Dallas",
    state: "TX",
    zip: "75206",
  },
  multipleLocations: true,
  locationCount: 3,
  additionalMarkets: "Plano, Richardson",
  status: "pending",
  orderingReady: false,
  createdAt: "2026-08-26T18:30:00.000Z",
  decidedAt: null,
};

export const approvedApplication: TrackedApplication = {
  ...pendingApplication,
  status: "approved",
  orderingReady: true,
  decidedAt: "2026-08-27T15:05:00.000Z",
};

/** What POST /api/buyer/payment-intent returns for the cart above. */
export const payment: PaymentStart = {
  clientSecret: "pi_3QexampleSecret_secret_screenshotonly",
  publishableKey: "pk_test_screenshot",
  paymentIntentId: "pi_3Qexample",
  summary: {
    caseCount: 3,
    loafCount: 75,
    boxCount: 3,
    subtotalCents: 18_750,
    shippingCents: 3_750,
    totalCents: 22_500,
    lines: [
      {
        sku: "WS-BARBARI-25",
        title: "Barbari — Case of 25",
        cases: 2,
        loaves: 50,
        unitAmountCents: 6_250,
        lineTotalCents: 12_500,
      },
      {
        sku: "WS-NATURAL-25",
        title: "Natural, No Sesame — Case of 25",
        cases: 1,
        loaves: 25,
        unitAmountCents: 6_250,
        lineTotalCents: 6_250,
      },
    ],
  },
  deliverTo: {
    businessName: "Saffron Kitchen Group",
    street: "1914 Greenville Ave",
    street2: "Suite 120",
    city: "Dallas",
    state: "TX",
    zip: "75206",
  },
};

/** What GET /api/buyer/order-status returns once the webhook has landed. */
export const confirmedOrder: ConfirmedOrder = {
  id: "ord-1043",
  name: "#1043",
  placedAt: "2026-08-28T14:22:00.000Z",
  caseCount: 3,
  boxCount: 3,
  loafCount: 75,
  subtotal: "187.50",
  shipping: "37.50",
  total: "225.00",
  currencyCode: "USD",
  items: [
    { sku: "WS-BARBARI-25", name: "Barbari — Case of 25", quantity: 2, unitAmountCents: 6_250 },
    { sku: "WS-NATURAL-25", name: "Natural, No Sesame — Case of 25", quantity: 1, unitAmountCents: 6_250 },
  ],
  trackingNumber: "",
  statusPageUrl: "",
  deliverTo: {
    name: "Saffron Kitchen Group",
    street: "1914 Greenville Ave",
    street2: "Suite 120",
    city: "Dallas",
    state: "TX",
    zip: "75206",
  },
};
