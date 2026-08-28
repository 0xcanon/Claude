/**
 * UPS Shipping API — label creation for the admin shipping queue.
 *
 * Auth is the OAuth client-credentials flow, which is the correct one here:
 * Dallas Bakery is both the integration owner and the shipper, so a single
 * client id/secret pair represents the UPS account directly. The bearer token
 * is cached in memory for the life of the isolate and refreshed before it
 * expires.
 *
 * Labels are requested as 4x6 ZPL for a thermal printer (Zebra/Rollo). UPS
 * returns them base64-encoded; several labels concatenate into one .zpl file
 * that prints as a batch.
 *
 * Secrets (npx wrangler secret put NAME):
 *   UPS_CLIENT_ID, UPS_CLIENT_SECRET, UPS_ACCOUNT_NUMBER
 * Optional:
 *   UPS_ENVIRONMENT=test|production   (defaults to test — switch deliberately)
 *   UPS_SERVICE_CODE                  (defaults to 03, UPS Ground)
 */

const TEST_BASE_URL = "https://wwwcie.ups.com";
const PRODUCTION_BASE_URL = "https://onlinetools.ups.com";
const TOKEN_SAFETY_WINDOW_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

export const SHIP_FROM = {
  name: "Dallas Bakery",
  phone: "4697294706",
  street: "2643 Manana Dr",
  city: "Dallas",
  state: "TX",
  zip: "75220",
  country: "US",
};

import type { ShipmentPackage } from "./parcel-packing.ts";

export type ParcelSettings = {
  boxWeightOz: number;
  boxLengthIn: number;
  boxWidthIn: number;
  boxHeightIn: number;
};

export type LabelRecipient = {
  name: string;
  phone: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
};

export type LabelResult =
  | { ok: true; trackingNumber: string; labelBase64: string; format: "ZPL" }
  | { ok: false; error: string };

export function upsConfigured() {
  return Boolean(
    String(process.env.UPS_CLIENT_ID || "").trim() &&
    String(process.env.UPS_CLIENT_SECRET || "").trim() &&
    String(process.env.UPS_ACCOUNT_NUMBER || "").trim(),
  );
}

export function upsIsProduction() {
  return String(process.env.UPS_ENVIRONMENT || "test").trim().toLowerCase() === "production";
}

function baseUrl() {
  return upsIsProduction() ? PRODUCTION_BASE_URL : TEST_BASE_URL;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_SAFETY_WINDOW_MS) {
    return cachedToken.value;
  }
  const credentials = btoa(
    `${String(process.env.UPS_CLIENT_ID).trim()}:${String(process.env.UPS_CLIENT_SECRET).trim()}`,
  );
  const response = await fetchWithTimeout(`${baseUrl()}/security/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json().catch(() => null) as
    | { access_token?: string; expires_in?: string | number }
    | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(`UPS sign-in failed (HTTP ${response.status}). Check the client id and secret.`);
  }
  const lifetimeMs = (Number(payload.expires_in) || 3600) * 1000;
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + lifetimeMs };
  return cachedToken.value;
}

/** Digits only; UPS rejects formatted phone numbers. */
function digits(value: string) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function buildShipmentBody(
  recipient: LabelRecipient,
  packages: ShipmentPackage[],
  reference: string,
) {
  const addressLines = [recipient.street, recipient.street2].filter(Boolean);
  return {
    ShipmentRequest: {
      Request: { RequestOption: "nonvalidate", TransactionReference: { CustomerContext: reference } },
      Shipment: {
        Description: "Bakery goods",
        Shipper: {
          Name: SHIP_FROM.name,
          AttentionName: SHIP_FROM.name,
          Phone: { Number: SHIP_FROM.phone },
          ShipperNumber: String(process.env.UPS_ACCOUNT_NUMBER).trim(),
          Address: {
            AddressLine: [SHIP_FROM.street],
            City: SHIP_FROM.city,
            StateProvinceCode: SHIP_FROM.state,
            PostalCode: SHIP_FROM.zip,
            CountryCode: SHIP_FROM.country,
          },
        },
        ShipFrom: {
          Name: SHIP_FROM.name,
          AttentionName: SHIP_FROM.name,
          Phone: { Number: SHIP_FROM.phone },
          Address: {
            AddressLine: [SHIP_FROM.street],
            City: SHIP_FROM.city,
            StateProvinceCode: SHIP_FROM.state,
            PostalCode: SHIP_FROM.zip,
            CountryCode: SHIP_FROM.country,
          },
        },
        ShipTo: {
          Name: recipient.name || "Customer",
          AttentionName: recipient.name || "Customer",
          Phone: { Number: digits(recipient.phone) || SHIP_FROM.phone },
          Address: {
            AddressLine: addressLines.length ? addressLines : ["Address on file"],
            City: recipient.city,
            StateProvinceCode: recipient.state,
            PostalCode: recipient.zip,
            CountryCode: "US",
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: "01", // transportation charges
            BillShipper: { AccountNumber: String(process.env.UPS_ACCOUNT_NUMBER).trim() },
          },
        },
        Service: { Code: String(process.env.UPS_SERVICE_CODE || "03").trim(), Description: "UPS Ground" },
        // One Package entry per box, each with its own product's weight and
        // dimensions — UPS returns one label per entry, so a three-case order
        // prints three labels and every box is billed at its real weight.
        Package: packages.map((box) => ({
          Description: box.description.slice(0, 35) || "Bread",
          Packaging: { Code: "02", Description: "Customer supplied package" },
          Dimensions: {
            UnitOfMeasurement: { Code: "IN" },
            Length: String(box.lengthIn),
            Width: String(box.widthIn),
            Height: String(box.heightIn),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: "LBS" },
            Weight: String(Math.max(1, Math.ceil(box.weightOz / 16))),
          },
          ReferenceNumber: [{ Code: "PO", Value: reference }],
        })),
      },
      LabelSpecification: {
        LabelImageFormat: { Code: "ZPL", Description: "ZPL" },
        LabelStockSize: { Height: "6", Width: "4" },
      },
    },
  };
}

function readUpsError(payload: unknown, status: number) {
  const errors = (payload as { response?: { errors?: { code?: string; message?: string }[] } })
    ?.response?.errors;
  if (Array.isArray(errors) && errors.length) {
    return errors.map((item) => item.message || item.code).filter(Boolean).join("; ");
  }
  return `UPS rejected the shipment (HTTP ${status}).`;
}

/**
 * Creates one shipment — one package per box — and returns the shipment's
 * lead tracking number plus every package label merged into one printable
 * ZPL payload. Never throws — a failed label is reported per order so one
 * bad address cannot stop the rest of the day's batch.
 */
export async function createUpsLabel(
  recipient: LabelRecipient,
  packages: ShipmentPackage[],
  reference: string,
): Promise<LabelResult> {
  if (!packages.length) {
    return { ok: false, error: "This order has no boxes to ship." };
  }
  if (!upsConfigured()) {
    return { ok: false, error: "UPS is not connected yet. Add the UPS credentials in the deployment settings." };
  }
  try {
    const token = await accessToken();
    const response = await fetchWithTimeout(`${baseUrl()}/api/shipments/v1/ship`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        transId: reference.slice(0, 32),
        transactionSrc: "dallas-bakery-admin",
      },
      body: JSON.stringify(buildShipmentBody(recipient, packages, reference)),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      // A stale cached token is the one failure worth retrying automatically.
      if (response.status === 401) cachedToken = null;
      return { ok: false, error: readUpsError(payload, response.status) };
    }
    const results = (payload as {
      ShipmentResponse?: {
        ShipmentResults?: {
          ShipmentIdentificationNumber?: string;
          PackageResults?: unknown;
        };
      };
    })?.ShipmentResponse?.ShipmentResults;
    const packageResults = (Array.isArray(results?.PackageResults)
      ? results?.PackageResults
      : [results?.PackageResults]) as { ShippingLabel?: { GraphicImage?: string }; TrackingNumber?: string }[];
    const labels = packageResults
      .map((entry) => entry?.ShippingLabel?.GraphicImage || "")
      .filter(Boolean);
    // The shipment id is the lead tracking number and covers every package;
    // scanning it shows the whole delivery.
    const trackingNumber =
      results?.ShipmentIdentificationNumber ||
      packageResults[0]?.TrackingNumber ||
      "";
    if (!labels.length || !trackingNumber) {
      return { ok: false, error: "UPS accepted the shipment but returned no label. Check the UPS account status." };
    }
    return { ok: true, trackingNumber, labelBase64: btoa(mergeZplLabels(labels)), format: "ZPL" };
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : "UPS could not be reached." };
  }
}

/**
 * Joins several base64 ZPL labels into one printable file. ZPL is plain text,
 * so concatenating the decoded payloads yields a batch the printer feeds
 * one label after another.
 */
export function mergeZplLabels(labelsBase64: string[]) {
  return labelsBase64
    .map((label) => atob(label).trim())
    .filter(Boolean)
    .join("\n");
}
