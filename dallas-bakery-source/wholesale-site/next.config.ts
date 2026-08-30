import type { NextConfig } from "next";

/**
 * No `images.remotePatterns` on purpose.
 *
 * The homepage photographs used to be hot-linked from the retail store's CDN,
 * which meant the wholesale site's shelf went blank the day that store moved
 * or closed. Every image now lives in `public/images/` and is served by this
 * site, so an allowlist for an outside host would only make it possible to
 * reintroduce the problem. `tests/no-hotlinked-assets.test.ts` fails if an
 * external image URL reappears, and `npm run deploy` runs the suite first, so
 * a hot-link cannot reach production even if nobody checks by hand.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
