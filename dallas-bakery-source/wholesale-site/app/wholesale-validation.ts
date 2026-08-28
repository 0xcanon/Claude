export type Address = {
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
};

export type ApplicationPayload = {
  contactName: string;
  businessName: string;
  businessType: string;
  email: string;
  phone: string;
  storeAddress: Address;
  shippingAddress: Address;
  website?: string;
  multipleLocations?: boolean;
  locationCount?: string;
  additionalMarkets?: string;
  privacyAgreement?: boolean;
  honeypot?: string;
  elapsedMs?: number;
};

const allowedBusinessTypes = new Set([
  "restaurant",
  "grocery",
  "hospitality",
  "institution",
  "food-distributor",
]);

export function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

export function cleanWebsite(value: unknown) {
  const candidate = clean(value, 300);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeAddress(address: Address) {
  return [
    address.street,
    address.street2 || "",
    address.city,
    address.state,
    address.zip,
  ]
    .map((value) =>
      clean(value)
        .toUpperCase()
        .replace(/[.,#]/g, " ")
        .replace(/\bSTREET\b/g, "ST")
        .replace(/\bAVENUE\b/g, "AVE")
        .replace(/\bROAD\b/g, "RD")
        .replace(/\bBOULEVARD\b/g, "BLVD")
        .replace(/\bSUITE\b/g, "STE")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join("|");
}

export function isAllowedBusinessType(value: string) {
  return allowedBusinessTypes.has(value);
}

export function isMailboxAddress(street: string) {
  return /\bP\.?\s*O\.?\s*BOX\b|\bPMB\b/i.test(street);
}
