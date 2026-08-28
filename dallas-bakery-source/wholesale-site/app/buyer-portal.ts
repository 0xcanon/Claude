/**
 * Where an approved buyer signs in to order. Ordering lives on this site now,
 * so the portal is a path here rather than an external storefront.
 */
export function siteUrl() {
  return String(process.env.PUBLIC_SITE_URL || "https://dallasbakery.net").replace(/\/+$/, "");
}

export function buyerPortalUrl() {
  return `${siteUrl()}/order`;
}
