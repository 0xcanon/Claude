import { apiUrl } from "./api";

/**
 * Turns whatever the catalog says a product's photo is into something React
 * Native can actually load.
 *
 * The bakery stores product photos as site-relative paths — "/images/case.jpg"
 * — because that is what the website needs and what keeps the image on our own
 * server. A browser resolves that against the page's origin without being
 * asked. The app has no origin, so `{ uri: "/images/case.jpg" }` silently
 * loads nothing and the buyer sees an empty grey box.
 *
 * The old code guarded with `product.imageUrl ? {uri} : fallback`, which never
 * reached the fallback: a relative path is a non-empty string, so it is
 * truthy, and every product card was blank rather than showing the bundled
 * photo. Emptiness was never the failure mode — unresolvability was.
 */

const FALLBACK = require("../../assets/barbari-product.jpg");

export type ProductImageSource = { uri: string } | number;

export function productImageSource(imageUrl?: string | null): ProductImageSource {
  const raw = String(imageUrl || "").trim();
  if (!raw) return FALLBACK;

  // The normal case: our own path, given the API's origin so it can load.
  if (raw.startsWith("/")) return { uri: apiUrl(raw) };

  // Already absolute and https. Kept working rather than blanked, so a photo
  // that predates the site-relative rule still shows, but http:// is refused
  // because iOS blocks cleartext image loads anyway and would show nothing.
  if (/^https:\/\//i.test(raw)) return { uri: raw };

  // A bare filename, an http:// URL, or anything else we cannot resolve. The
  // bundled photo is a better answer than a blank rectangle.
  return FALLBACK;
}
