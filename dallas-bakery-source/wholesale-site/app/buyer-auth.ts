/**
 * Buyer sign-in — email plus a six-digit code, checked against the approved
 * applications table. Ordering runs entirely on Stripe, so there is no
 * external identity provider, and the bakery already knows exactly which
 * email addresses it approved.
 *
 * Codes are stored hashed with a short expiry and a hard attempt cap. The
 * session that follows is a signed token (HMAC-SHA256), so no session table
 * is needed and a stolen database row cannot mint one.
 *
 * Secret: BUYER_SESSION_SECRET (npx wrangler secret put BUYER_SESSION_SECRET)
 */

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { buyerLoginCodes, wholesaleApplications } from "../db/schema";

export const CODE_TTL_MINUTES = 15;
export const MAX_CODE_ATTEMPTS = 5;
export const SESSION_TTL_DAYS = 14;
const RESEND_COOLDOWN_SECONDS = 45;

export class BuyerAuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BuyerAuthError";
    this.status = status;
  }
}

function encoder() {
  return new TextEncoder();
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder().encode(value));
  return base64Url(new Uint8Array(signature));
}

function sessionSecret() {
  const secret = String(process.env.BUYER_SESSION_SECRET || "").trim();
  if (secret.length < 32) {
    throw new BuyerAuthError("Buyer sign-in is not configured yet.", 503);
  }
  return secret;
}

function codeSecret() {
  // Codes are hashed with the same secret; they are short-lived and
  // single-use, so a separate key would add ceremony without security.
  return sessionSecret();
}

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

/** Six digits, uniformly drawn — never Math.random for a credential. */
function generateCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

export type ApprovedBuyer = {
  applicationId: string;
  email: string;
  businessName: string;
  contactName: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
};

export async function findApprovedBuyer(email: string): Promise<ApprovedBuyer | null> {
  const [row] = await getDb()
    .select({
      applicationId: wholesaleApplications.id,
      email: wholesaleApplications.email,
      businessName: wholesaleApplications.businessName,
      contactName: wholesaleApplications.contactName,
      street: wholesaleApplications.street,
      street2: wholesaleApplications.street2,
      city: wholesaleApplications.city,
      state: wholesaleApplications.state,
      zip: wholesaleApplications.zip,
      phone: wholesaleApplications.phone,
    })
    .from(wholesaleApplications)
    .where(and(
      eq(wholesaleApplications.email, normalizeEmail(email)),
      eq(wholesaleApplications.status, "approved"),
    ))
    .limit(1);
  return row ? (row as ApprovedBuyer) : null;
}

/**
 * Issues a code for an approved buyer. Returns null when the email has no
 * approved account — the caller answers identically either way so the
 * endpoint cannot be used to discover who holds an account.
 */
export async function issueLoginCode(email: string) {
  const address = normalizeEmail(email);
  const buyer = await findApprovedBuyer(address);
  if (!buyer) return null;

  const db = getDb();
  const now = Date.now();
  const [existing] = await db
    .select({ createdAt: buyerLoginCodes.createdAt })
    .from(buyerLoginCodes)
    .where(eq(buyerLoginCodes.email, address))
    .limit(1);
  if (existing && now - existing.createdAt < RESEND_COOLDOWN_SECONDS * 1000) {
    throw new BuyerAuthError("A code was just sent. Check your email, or try again in a moment.", 429);
  }

  const code = generateCode();
  const codeHash = await hmac(`${address}:${code}`, codeSecret());
  await db
    .insert(buyerLoginCodes)
    .values({
      email: address,
      codeHash,
      expiresAt: now + CODE_TTL_MINUTES * 60_000,
      attempts: 0,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: buyerLoginCodes.email,
      set: { codeHash, expiresAt: now + CODE_TTL_MINUTES * 60_000, attempts: 0, createdAt: now },
    });

  return { buyer, code };
}

export type BuyerSessionClaims = { email: string; expiresAt: number };

export async function createSessionToken(email: string) {
  const address = normalizeEmail(email);
  const expiresAt = Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${address}.${expiresAt}`;
  const signature = await hmac(payload, sessionSecret());
  return { token: `${base64Url(encoder().encode(payload))}.${signature}`, expiresAt };
}

export async function readSessionToken(token: string): Promise<BuyerSessionClaims | null> {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;
  let payload: string;
  try {
    payload = atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const expected = await hmac(payload, sessionSecret());
  if (!timingSafeEqual(expected, signature)) return null;

  const separator = payload.lastIndexOf(".");
  const email = payload.slice(0, separator);
  const expiresAt = Number(payload.slice(separator + 1));
  if (!email || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { email, expiresAt };
}

/**
 * Verifies a submitted code. Every failure burns an attempt, and the code is
 * deleted on success so it cannot be replayed.
 */
export async function verifyLoginCode(email: string, code: string) {
  const address = normalizeEmail(email);
  const submitted = String(code || "").replace(/\D/g, "");
  const db = getDb();
  const [row] = await db
    .select()
    .from(buyerLoginCodes)
    .where(eq(buyerLoginCodes.email, address))
    .limit(1);

  if (!row) throw new BuyerAuthError("That code is no longer valid. Request a new one.", 400);
  if (row.expiresAt < Date.now()) {
    await db.delete(buyerLoginCodes).where(eq(buyerLoginCodes.email, address));
    throw new BuyerAuthError("That code expired. Request a new one.", 400);
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    await db.delete(buyerLoginCodes).where(eq(buyerLoginCodes.email, address));
    throw new BuyerAuthError("Too many attempts. Request a new code.", 429);
  }

  const expected = await hmac(`${address}:${submitted}`, codeSecret());
  if (!timingSafeEqual(expected, row.codeHash)) {
    await db
      .update(buyerLoginCodes)
      .set({ attempts: sql`${buyerLoginCodes.attempts} + 1` })
      .where(eq(buyerLoginCodes.email, address));
    throw new BuyerAuthError("That code doesn't match. Check the email and try again.", 401);
  }

  await db.delete(buyerLoginCodes).where(eq(buyerLoginCodes.email, address));
  const buyer = await findApprovedBuyer(address);
  if (!buyer) throw new BuyerAuthError("This account is no longer active.", 403);
  return { buyer, session: await createSessionToken(address) };
}

/** Guard for buyer API routes. Returns the approved buyer or throws. */
export async function requireBuyer(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const claims = await readSessionToken(token);
  if (!claims) throw new BuyerAuthError("Your session expired. Sign in again.", 401);
  const buyer = await findApprovedBuyer(claims.email);
  if (!buyer) throw new BuyerAuthError("This account is no longer active.", 403);
  return buyer;
}
