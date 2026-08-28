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

function product(
  id: string,
  title: string,
  description: string,
  amount: string,
  minimum: number,
  increment: number,
): CatalogProduct {
  return {
    id: `gid://shopify/Product/${id}`,
    handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    description,
    imageUrl: "",
    imageAlt: title,
    variant: {
      id: `gid://shopify/ProductVariant/${id}`,
      title: "Default",
      availableForSale: true,
      price: { amount, currencyCode: "USD" },
      quantityRule: { minimum, maximum: null, increment },
    },
  };
}

export const products: CatalogProduct[] = [
  product("101", "Classic Barbari", "Persian flatbread, 14-day shelf life", "2.50", 25, 25),
  product("102", "Sesame Barbari", "Toasted sesame crust", "2.75", 25, 25),
  product("103", "Whole Wheat Barbari", "Stone-milled whole wheat", "2.85", 25, 25),
  product("104", "Mini Barbari", "Single-serve, service-ready", "1.60", 50, 50),
];

export const cart = {
  "gid://shopify/ProductVariant/101": 50,
  "gid://shopify/ProductVariant/102": 25,
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
