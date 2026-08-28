const TRACKING_TOKEN_BYTES = 32;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function applicationTrackingSecret() {
  return String(
    process.env.APPLICATION_TRACKING_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    "",
  );
}

export function createApplicationTrackingToken() {
  const bytes = new Uint8Array(TRACKING_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export function readBearerToken(header: string | null) {
  const match = header?.match(/^Bearer\s+([A-Za-z0-9_-]{40,128})$/i);
  return match?.[1] || "";
}

export async function hashApplicationTrackingToken(token: string, secret: string) {
  if (!readBearerToken(`Bearer ${token}`) || secret.length < 32) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`dallas-bakery-buyer-status|${token}`),
  ));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isBuyerAppRequest(request: Request) {
  return request.headers.get("x-dallas-bakery-client") === "buyer-app";
}
