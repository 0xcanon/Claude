import type {
  BuyerAccount,
  CatalogProduct,
  ShippingSettings,
  TrackedApplication,
} from "./types";

export const shipping: ShippingSettings = {
  rateCents: 1250,
  unitsPerBox: 25,
  formattedRate: "$12.50",
  updatedAt: "2026-08-20T15:00:00.000Z",
};

export const account: BuyerAccount = {
  id: "gid://shopify/Customer/8812341",
  displayName: "Mina Farahani",
  firstName: "Mina",
  lastName: "Farahani",
  email: "mina@saffronkitchen.com",
  locations: [
    {
      id: "gid://shopify/CompanyLocation/551",
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
      id: "gid://shopify/CompanyLocation/552",
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
      id: "gid://shopify/CompanyLocation/553",
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
      id: "gid://shopify/Order/9001",
      name: "#WS-1042",
      processedAt: "2026-08-21T16:12:00.000Z",
      fulfillmentStatus: "FULFILLED",
      financialStatus: "PAID",
      total: { amount: "512.50", currencyCode: "USD" },
      statusPageUrl: "https://dallasbakery.net/orders/1042",
    },
    {
      id: "gid://shopify/Order/9002",
      name: "#WS-1036",
      processedAt: "2026-08-11T14:03:00.000Z",
      fulfillmentStatus: "IN_TRANSIT",
      financialStatus: "PAID",
      total: { amount: "287.50", currencyCode: "USD" },
      statusPageUrl: "https://dallasbakery.net/orders/1036",
    },
    {
      id: "gid://shopify/Order/9003",
      name: "#WS-1021",
      processedAt: "2026-07-29T09:41:00.000Z",
      fulfillmentStatus: "FULFILLED",
      financialStatus: "PAID",
      total: { amount: "762.50", currencyCode: "USD" },
      statusPageUrl: "https://dallasbakery.net/orders/1021",
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
  caseProduct("WS-BARBARI-25", "Barbari — Case of 25", "The classic Persian flatbread, hand-raked and sesame-finished.", "50.00"),
  caseProduct("WS-NATURAL-25", "Natural, No Sesame — Case of 25", "Same dough and bake, finished plain.", "50.00"),
  caseProduct("WS-WHEAT-25", "Whole Wheat — Case of 25", "Nuttier and denser, holds up under soups and stews.", "50.00"),
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
