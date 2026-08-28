import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { adminAccounts } from "../db/schema";

const SESSION_COOKIE = "dallas_bakery_admin";
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const PASSWORD_ITERATIONS = 210_000;

type AdminSession = {
  email: string;
  expiresAt: number;
  loginEpoch: string;
};

export function configuredAdminEmail() {
  return String(process.env.ADMIN_LOGIN_EMAIL || "").trim().toLowerCase();
}

function configuredLoginEpoch() {
  return String(process.env.ADMIN_LOGIN_EPOCH || "1");
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const saltBuffer = salt.slice().buffer as ArrayBuffer;
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    material,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashAdminPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(18));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyAdminPassword(password: string, encoded: string) {
  const [algorithm, iterationValue, saltValue, hashValue] = encoded.split("$");
  const iterations = Number(iterationValue);
  if (
    algorithm !== "pbkdf2_sha256" ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    !saltValue ||
    !hashValue
  ) return false;

  try {
    const expected = base64UrlToBytes(hashValue);
    const actual = await derivePassword(password, base64UrlToBytes(saltValue), iterations);
    return equalBytes(actual, expected);
  } catch {
    return false;
  }
}

async function signSessionPayload(payload: string) {
  const secret = String(process.env.ADMIN_SESSION_SECRET || "");
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

export async function createAdminSession(email: string) {
  const loginEpoch = configuredLoginEpoch();
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    email: email.toLowerCase(),
    expiresAt: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000,
    loginEpoch,
  })));
  const signature = await signSessionPayload(payload);
  if (!signature) throw new Error("Admin session configuration is unavailable.");
  return `${payload}.${bytesToBase64Url(signature)}`;
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSession | null> {
  const [payload, signatureValue] = token.split(".");
  if (!payload || !signatureValue) return null;
  const expectedSignature = await signSessionPayload(payload);
  if (!expectedSignature) return null;

  let actualSignature: Uint8Array;
  try {
    actualSignature = base64UrlToBytes(signatureValue);
  } catch {
    return null;
  }
  if (!equalBytes(actualSignature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as AdminSession;
    if (
      parsed.email !== configuredAdminEmail() ||
      parsed.loginEpoch !== configuredLoginEpoch() ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= Date.now()
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function adminSessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`;
}

export function clearAdminSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSessionToken(token);
}

export async function getAdminSessionFromRequest(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return verifyAdminSessionToken(token);
}

export async function getAuthorizedAdmin() {
  const session = await getAdminSession();
  if (!session) return null;
  return { displayName: "Dallas Bakery Owner", email: session.email };
}

export async function getAuthorizedMobileAdmin(request: Request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) return null;
  return { displayName: "Dallas Bakery Owner", email: session.email };
}

export async function getAdminAccount(email: string) {
  const [account] = await getDb()
    .select()
    .from(adminAccounts)
    .where(eq(adminAccounts.email, email.toLowerCase()))
    .limit(1);
  return account || null;
}

export async function getOrBootstrapAdminAccount(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  let account = await getAdminAccount(normalizedEmail);
  const bootstrapHash = String(process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH || "");
  if (account) {
    if (
      normalizedEmail === configuredAdminEmail() &&
      bootstrapHash &&
      (
        account.credentialEpoch !== configuredLoginEpoch() ||
        (account.mustChangePassword && account.passwordHash !== bootstrapHash)
      )
    ) {
      [account] = await getDb()
        .update(adminAccounts)
        .set({
          passwordHash: bootstrapHash,
          credentialEpoch: configuredLoginEpoch(),
          mustChangePassword: true,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(adminAccounts.email, normalizedEmail))
        .returning();
    }
    return account;
  }
  if (normalizedEmail !== configuredAdminEmail()) return null;

  if (!bootstrapHash) return null;
  await getDb().insert(adminAccounts).values({
    email: normalizedEmail,
    passwordHash: bootstrapHash,
    credentialEpoch: configuredLoginEpoch(),
    mustChangePassword: true,
  }).onConflictDoNothing();
  account = await getAdminAccount(normalizedEmail);
  return account;
}
