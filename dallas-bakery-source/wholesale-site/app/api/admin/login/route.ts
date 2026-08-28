import { eq } from "drizzle-orm";
import {
  adminSessionCookie,
  configuredAdminEmail,
  createAdminSession,
  getOrBootstrapAdminAccount,
  verifyAdminPassword,
} from "../../../admin-auth";
import { getDb } from "../../../../db";
import { adminLoginAttempts } from "../../../../db/schema";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  return !origin || origin === new URL(request.url).origin;
}

async function attemptKey(request: Request, email: string) {
  const loginEpoch = String(process.env.ADMIN_LOGIN_EPOCH || "1");
  const ip = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const material = new TextEncoder().encode(`${loginEpoch}|${email.toLowerCase()}|${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recordFailure(key: string, now: number) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(adminLoginAttempts)
    .where(eq(adminLoginAttempts.key, key))
    .limit(1);
  const insideWindow = existing && now - existing.firstFailedAt < ATTEMPT_WINDOW_MS;
  const failures = insideWindow ? existing.failures + 1 : 1;
  const firstFailedAt = insideWindow ? existing.firstFailedAt : now;
  const lockedUntil = failures >= MAX_FAILURES ? now + LOCKOUT_MS : 0;

  await db.insert(adminLoginAttempts).values({
    key,
    failures,
    firstFailedAt,
    lockedUntil,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: adminLoginAttempts.key,
    set: { failures, firstFailedAt, lockedUntil, updatedAt: now },
  });
  return lockedUntil;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Invalid request" }, { status: 403 });
  }

  let payload: { email?: string; password?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = String(payload.email || "").trim().toLowerCase().slice(0, 200);
  const password = String(payload.password || "").slice(0, 256);
  if (!email || !password) {
    return Response.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const key = await attemptKey(request, email);
  const now = Date.now();
  const [attempt] = await getDb()
    .select()
    .from(adminLoginAttempts)
    .where(eq(adminLoginAttempts.key, key))
    .limit(1);
  if (attempt?.lockedUntil && attempt.lockedUntil > now) {
    return Response.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  const account = await getOrBootstrapAdminAccount(email);
  const fallbackHash = String(process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH || "");
  const passwordMatches = await verifyAdminPassword(
    password,
    account?.passwordHash || fallbackHash,
  );
  const authenticated =
    email === configuredAdminEmail() && Boolean(account) && passwordMatches;

  if (!authenticated) {
    const lockedUntil = await recordFailure(key, now);
    return Response.json(
      { error: lockedUntil ? "Too many attempts. Try again in 15 minutes." : "Email or password is incorrect." },
      { status: lockedUntil ? 429 : 401 },
    );
  }

  await getDb().delete(adminLoginAttempts).where(eq(adminLoginAttempts.key, key));
  const token = await createAdminSession(email);
  return Response.json(
    { ok: true, requiresPasswordChange: account!.mustChangePassword },
    { headers: { "Set-Cookie": adminSessionCookie(token) } },
  );
}
