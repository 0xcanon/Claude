import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { publicSubmissionLimits, wholesaleApplications } from "../../../db/schema";
import {
  applicationTrackingSecret,
  createApplicationTrackingToken,
  hashApplicationTrackingToken,
  isBuyerAppRequest,
} from "../../application-tracking";
import {
  newApplicationOwnerEmail,
  sendMail,
} from "../../email-notifications";
import { OUT_OF_AREA_MESSAGE, isDeliverableState } from "../../order-rules";
import {
  clean,
  cleanWebsite,
  isAllowedBusinessType,
  isMailboxAddress,
  normalizeAddress,
  type Address,
  type ApplicationPayload,
} from "../../wholesale-validation";

const deniedPlaceTypes = new Set([
  "furniture_store",
  "home_goods_store",
  "home_improvement_store",
  "hardware_store",
  "auto_parts_store",
  "car_dealer",
  "car_repair",
  "clothing_store",
  "electronics_store",
  "jewelry_store",
  "shoe_store",
  "toy_store",
  "apartment_building",
  "apartment_complex",
  "condominium_complex",
  "housing_complex",
]);

const categoryTypes: Record<string, Set<string>> = {
  restaurant: new Set([
    "restaurant", "bakery", "bagel_shop", "cafe", "cafeteria",
    "catering_service", "deli", "food_court", "meal_delivery",
    "meal_takeaway", "sandwich_shop", "pizza_restaurant", "food",
  ]),
  grocery: new Set([
    "grocery_store", "supermarket", "asian_grocery_store", "butcher_shop",
    "convenience_store", "discount_supermarket", "farmers_market",
    "food_store", "health_food_store", "market",
  ]),
  hospitality: new Set([
    "hotel", "lodging", "motel", "resort_hotel", "extended_stay_hotel",
    "banquet_hall", "convention_center", "event_venue",
  ]),
  institution: new Set([
    "school", "primary_school", "secondary_school", "university",
    "educational_institution", "hospital", "general_hospital",
    "medical_center", "government_office",
  ]),
  "food-distributor": new Set([
    "wholesaler", "supplier", "warehouse_store", "food_store", "food",
  ]),
};

function reject(message: string, reason: string, status = 403) {
  return Response.json(
    { status: "rejected", message, reason },
    { status },
  );
}

function sameOrigin(request: Request) {
  // The native app sends no Origin header. A browser always does on a
  // cross-site JSON POST, so the app header alone can never bypass the
  // same-origin requirement for browser traffic.
  if (isBuyerAppRequest(request) && !request.headers.get("origin")) return true;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  return !origin || origin === new URL(request.url).origin;
}

function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
}

async function submissionKey(kind: string, value: string) {
  const secret = String(
    process.env.APPLICATION_RATE_LIMIT_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    "dallas-bakery-wholesale",
  );
  const material = new TextEncoder().encode(
    `${process.env.APPLICATION_RATE_LIMIT_EPOCH || "1"}|${kind}|${value}`,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, material));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeSubmissionLimit(
  key: string,
  maximum: number,
  windowMs: number,
  now: number,
) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(publicSubmissionLimits)
    .where(eq(publicSubmissionLimits.key, key))
    .limit(1);

  if (existing?.blockedUntil && existing.blockedUntil > now) return false;
  const insideWindow = Boolean(existing && now - existing.windowStartedAt < windowMs);
  const attempts = insideWindow && existing ? existing.attempts + 1 : 1;
  const windowStartedAt = insideWindow && existing ? existing.windowStartedAt : now;
  const blockedUntil = attempts > maximum ? windowStartedAt + windowMs : 0;
  await db.insert(publicSubmissionLimits).values({
    key,
    attempts,
    windowStartedAt,
    blockedUntil,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: publicSubmissionLimits.key,
    set: { attempts, windowStartedAt, blockedUntil, updatedAt: now },
  });
  return blockedUntil <= now;
}

async function verifyCommercialAddress(address: Address) {
  const authId = process.env.SMARTY_AUTH_ID;
  const authToken = process.env.SMARTY_AUTH_TOKEN;
  if (!authId || !authToken) {
    return { status: "manual" as const };
  }

  try {
    const url = new URL("https://us-street.api.smarty.com/street-address");
    url.searchParams.set("auth-id", authId);
    url.searchParams.set("auth-token", authToken);
    url.searchParams.set("match", "enhanced");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          street: address.street,
          street2: address.street2 || "",
          city: address.city,
          state: address.state,
          zipcode: address.zip,
          candidates: 1,
        },
      ]),
    });
    if (!response.ok) return { status: "manual" as const };

    const candidates = (await response.json()) as Array<{
      delivery_line_1?: string;
      last_line?: string;
      analysis?: {
        dpv_match_code?: string;
        dpv_vacant?: string;
        dpv_no_stat?: string;
        dpv_cmra?: string;
      };
      metadata?: {
        rdi?: string;
        record_type?: string;
      };
    }>;
    const match = candidates[0];
    if (!match) return { status: "invalid" as const };

    if (match.metadata?.rdi === "Residential") {
      return { status: "residential" as const };
    }
    if (
      match.metadata?.rdi !== "Commercial" ||
      match.metadata?.record_type === "P" ||
      match.analysis?.dpv_cmra === "Y" ||
      match.analysis?.dpv_vacant === "Y" ||
      match.analysis?.dpv_no_stat === "Y" ||
      match.analysis?.dpv_match_code !== "Y"
    ) {
      return { status: "manual" as const };
    }

    return {
      status: "verified" as const,
      standardized: [match.delivery_line_1, match.last_line].filter(Boolean).join(", "),
    };
  } catch {
    return { status: "manual" as const };
  }
}

async function verifyBusinessCategory(
  businessName: string,
  businessType: string,
  address: Address,
) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { status: "manual" as const };

  try {
    const fullAddress = [
      address.street,
      address.street2,
      `${address.city}, ${address.state} ${address.zip}`,
    ].filter(Boolean).join(", ");
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.displayName,places.formattedAddress,places.primaryType,places.types,places.businessStatus,places.pureServiceAreaBusiness",
        },
        body: JSON.stringify({
          textQuery: `${businessName}, ${fullAddress}`,
          pageSize: 1,
          regionCode: "US",
          languageCode: "en",
        }),
      },
    );
    if (!response.ok) return { status: "manual" as const };

    const data = (await response.json()) as {
      places?: Array<{
        displayName?: { text?: string };
        formattedAddress?: string;
        primaryType?: string;
        types?: string[];
        businessStatus?: string;
        pureServiceAreaBusiness?: boolean;
      }>;
    };
    const place = data.places?.[0];
    if (!place) return { status: "manual" as const };

    const types = new Set([place.primaryType, ...(place.types || [])].filter(Boolean) as string[]);
    if ([...types].some((type) => deniedPlaceTypes.has(type))) {
      return { status: "wrong-industry" as const };
    }
    if (place.businessStatus === "CLOSED_PERMANENTLY" || place.pureServiceAreaBusiness) {
      return { status: "not-storefront" as const };
    }

    const expectedTypes = categoryTypes[businessType];
    const categoryMatch = expectedTypes && [...types].some((type) => expectedTypes.has(type));
    if (!categoryMatch) {
      return { status: "manual" as const };
    }

    const streetNumber = address.street.match(/^\s*(\d+)/)?.[1];
    const addressMatches =
      (!streetNumber || place.formattedAddress?.includes(streetNumber)) &&
      place.formattedAddress?.includes(address.zip.slice(0, 5));
    if (!addressMatches) return { status: "manual" as const };

    return {
      status: "verified" as const,
      matchedBusiness: place.displayName?.text || businessName,
    };
  } catch {
    return { status: "manual" as const };
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return reject("Please submit your request from dallasbakery.net.", "invalid-origin", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reject("Please check the form and try again.", "invalid-content-type", 415);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 20_000) {
    return reject("Please check the form and try again.", "request-too-large", 413);
  }

  let payload: ApplicationPayload;
  try {
    payload = (await request.json()) as ApplicationPayload;
  } catch {
    return reject("Please check the form and try again.", "invalid-request", 400);
  }

  if (clean(payload.honeypot) || Number(payload.elapsedMs || 0) < 1200) {
    return reject("Please try the application again.", "automated-submission", 400);
  }

  const businessName = clean(payload.businessName);
  const contactName = clean(payload.contactName);
  const businessType = clean(payload.businessType);
  const email = clean(payload.email).toLowerCase();
  const phone = clean(payload.phone);
  const storeAddress: Address = {
    street: clean(payload.storeAddress?.street),
    street2: clean(payload.storeAddress?.street2),
    city: clean(payload.storeAddress?.city),
    state: clean(payload.storeAddress?.state, 2).toUpperCase(),
    zip: clean(payload.storeAddress?.zip, 10),
  };
  const shippingAddress: Address = {
    street: clean(payload.shippingAddress?.street),
    street2: clean(payload.shippingAddress?.street2),
    city: clean(payload.shippingAddress?.city),
    state: clean(payload.shippingAddress?.state, 2).toUpperCase(),
    zip: clean(payload.shippingAddress?.zip, 10),
  };

  if (
    !businessName || !contactName || !email || !phone ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    phone.replace(/\D/g, "").length < 7 ||
    !storeAddress.street || !storeAddress.city ||
    !/^[A-Z]{2}$/.test(storeAddress.state) ||
    !/^\d{5}(-\d{4})?$/.test(storeAddress.zip) ||
    !isAllowedBusinessType(businessType) ||
    payload.privacyAgreement !== true
  ) {
    return reject("Please complete every required field.", "missing-fields", 400);
  }

  if (normalizeAddress(storeAddress) !== normalizeAddress(shippingAddress)) {
    return reject(
      "Please use your saved business location for wholesale delivery.",
      "shipping-mismatch",
      422,
    );
  }

  if (isMailboxAddress(storeAddress.street)) {
    return reject(
      "Please enter the street address where your business receives deliveries.",
      "mailbox-address",
      422,
    );
  }

  const now = Date.now();
  const buyerAppRequest = isBuyerAppRequest(request);
  const trackingSecret = applicationTrackingSecret();
  if (buyerAppRequest && trackingSecret.length < 32) {
    return Response.json(
      {
        status: "error",
        message: "Buyer-app account tracking is not ready. Please contact sales@dallasbakery.com.",
      },
      { status: 503 },
    );
  }
  const trackingToken = buyerAppRequest ? createApplicationTrackingToken() : "";
  const trackingTokenHash = trackingToken
    ? await hashApplicationTrackingToken(trackingToken, trackingSecret)
    : "";
  const ip = requestIp(request);
  const limitKeys = await Promise.all([
    ip ? submissionKey("ip", ip) : Promise.resolve(""),
    submissionKey("email", email),
  ]);
  const [ipAllowed, emailAllowed] = await Promise.all([
    limitKeys[0]
      ? consumeSubmissionLimit(limitKeys[0], 12, 60 * 60 * 1000, now)
      : Promise.resolve(true),
    consumeSubmissionLimit(limitKeys[1], 5, 24 * 60 * 60 * 1000, now),
  ]);
  if (!ipAllowed || !emailAllowed) {
    return reject(
      "We already have several recent requests from these details. Please contact sales@dallasbakery.com if you need help.",
      "too-many-requests",
      429,
    );
  }

  const [duplicate] = await getDb()
    .select({ id: wholesaleApplications.id })
    .from(wholesaleApplications)
    .where(and(
      sql`lower(${wholesaleApplications.email}) = ${email}`,
      sql`lower(${wholesaleApplications.businessName}) = ${businessName.toLowerCase()}`,
      sql`lower(${wholesaleApplications.street}) = ${storeAddress.street.toLowerCase()}`,
      eq(wholesaleApplications.zip, storeAddress.zip),
      sql`${wholesaleApplications.createdAt} >= datetime('now', '-1 day')`,
    ))
    .limit(1);
  if (!isDeliverableState(storeAddress.state)) {
    return Response.json({ error: OUT_OF_AREA_MESSAGE }, { status: 400 });
  }

  if (duplicate) {
    // Never re-issue a tracking credential for an existing application:
    // the matching fields (email, business name, street, zip) are public
    // enough that a token here would let a stranger read someone else's
    // application status. The original device keeps its stored token, and
    // decisions now go out by email either way.
    return Response.json({
      status: "submitted",
      message: "This wholesale account request is already in review. We'll email the decision to the business email on file.",
      applicationId: duplicate.id,
      alreadySubmitted: true,
    });
  }

  const [addressCheck, categoryCheck] = await Promise.all([
    verifyCommercialAddress(storeAddress),
    verifyBusinessCategory(businessName, businessType, storeAddress),
  ]);

  if (addressCheck.status === "residential") {
    return reject(
      "We couldn’t confirm delivery service at this location. Please check the address or contact our wholesale team.",
      "residential-address",
    );
  }
  if (addressCheck.status === "invalid") {
    return reject(
      "We couldn’t confirm this delivery address. Please check it and try again.",
      "invalid-address",
      422,
    );
  }
  if (categoryCheck.status === "wrong-industry") {
    return reject(
      "We couldn’t match the business name and location. Please check the information or contact sales@dallasbakery.com.",
      "industry-mismatch",
    );
  }
  if (categoryCheck.status === "not-storefront") {
    return reject(
      "We couldn’t match the business name and location. Please check the information or contact sales@dallasbakery.com.",
      "no-storefront",
    );
  }

  const fullyVerified =
    addressCheck.status === "verified" && categoryCheck.status === "verified";

  const applicationId = crypto.randomUUID();
  try {
    await getDb().insert(wholesaleApplications).values({
      id: applicationId,
      businessName,
      businessType,
      contactName,
      email,
      phone,
      website: cleanWebsite(payload.website),
      street: storeAddress.street,
      street2: storeAddress.street2 || "",
      city: storeAddress.city,
      state: storeAddress.state,
      zip: storeAddress.zip,
      multipleLocations: Boolean(payload.multipleLocations),
      locationCount: payload.multipleLocations
        ? Math.max(2, Math.min(500, Number(payload.locationCount) || 2))
        : 1,
      additionalMarkets: clean(payload.additionalMarkets, 300),
      screeningStatus: fullyVerified ? "auto_matched" : "owner_review",
      addressScreening: addressCheck.status,
      categoryScreening: categoryCheck.status,
      standardizedAddress:
        addressCheck.status === "verified" ? addressCheck.standardized || "" : "",
      matchedBusiness:
        categoryCheck.status === "verified" ? categoryCheck.matchedBusiness || "" : "",
      termsVersion: "2026-08-25",
      termsAcceptedAt: new Date().toISOString(),
      trackingTokenHash,
      trackingTokenIssuedAt: trackingToken ? now : 0,
    });
  } catch {
    return Response.json(
      {
        status: "error",
        message: "We couldn’t send your account request right now. Please try again or contact sales@dallasbakery.com.",
      },
      { status: 500 },
    );
  }

  await sendMail(newApplicationOwnerEmail(
    { id: applicationId, businessName, businessType, contactName, email, phone, city: storeAddress.city, state: storeAddress.state },
    { screeningStatus: fullyVerified ? "auto_matched" : "owner_review" },
  ));

  return Response.json({
    status: "submitted",
    message: "Your wholesale account request has been sent.",
    applicationId,
    ...(trackingToken ? { trackingToken } : {}),
  }, { status: 201 });
}
