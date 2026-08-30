import type { NextConfig } from "next";

/**
 * No `images.remotePatterns` on purpose.
 *
 * The homepage photographs used to be hot-linked from the retail store's CDN,
 * which meant the wholesale site's shelf went blank the day that store moved
 * or closed. Every image now lives in `public/images/` and is served by this
 * site, so an allowlist for an outside host would only make it possible to
 * reintroduce the problem. `tests/no-hotlinked-assets.test.ts` fails under
 * `npm test` and `npm run verify` if an external image URL reappears in the
 * source. It does not gate `npm run build` on its own — run `npm run verify`
 * before deploying, which the launch checklist and OPERATIONS.md both say.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
