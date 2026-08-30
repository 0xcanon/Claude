import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { absoluteImageUrl, validateImageUrl } from "../app/catalog-pricing.ts";

/**
 * Nothing this site renders may be fetched from someone else's server.
 *
 * The homepage photographs were hot-linked from the retail store's CDN for a
 * long time. That is a dependency on a system this business does not control:
 * the day that store moves, closes, or renames a file, the wholesale shelf
 * goes blank and the first person to notice is a buyer. The images now live in
 * `public/images/`, and this test is what keeps them there.
 *
 * It fails on any absolute http(s) URL ending in an image extension, wherever
 * in the app source it appears.
 */

const ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname);

// db/ and drizzle/ are in here on purpose: a product's photo path is a column
// default and a seeded row, so a hot-link can enter through a migration
// without ever appearing in a component.
const SOURCE_DIRS = ["app", "worker", "db", "drizzle"];
const CODE = /\.(tsx?|jsx?|mjs|cjs|mts|cts|css|sql|json)$/;
const REMOTE_IMAGE = /https?:\/\/[^"'`\s)]+\.(?:webp|jpe?g|png|gif|avif|svg)(?:\?[^"'`\s)]*)?/gi;

// A URL assembled from a base constant never matches the pattern above,
// because neither half contains both a scheme and an extension. This catches
// the host itself, wherever and however it is written.
const RETAIL_CDN = /dallasbakery\.com\/cdn|\/cdn\/shop\/(?:files|products)/gi;

/** Absolute URLs that are not fetched by a browser rendering this site. */
function isAllowed(url: string) {
  // Open Graph and Twitter card images must be absolute — a crawler resolves
  // them from outside the site — and this one is served from our own domain.
  return url.startsWith("https://dallasbakery.net/");
}

function sourceFiles(dir: string, found: string[] = []) {
  // Deliberately not swallowed. A directory that cannot be read contributes
  // nothing and says nothing, so renaming or moving a source folder would
  // quietly retire this guard while it kept reporting success.
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (CODE.test(entry)) found.push(full);
  }
  return found;
}

test("every directory this guard claims to scan actually exists", () => {
  // Without this, a renamed folder turns the whole test into a no-op.
  for (const dir of SOURCE_DIRS) {
    assert.ok(
      statSync(join(ROOT, dir)).isDirectory(),
      `SOURCE_DIRS lists "${dir}", which is not a directory — this guard is scanning nothing.`,
    );
  }
});

test("no image is loaded from a server this business does not control", () => {
  const offenders: string[] = [];

  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const body = readFileSync(file, "utf8");
      for (const match of body.match(REMOTE_IMAGE) || []) {
        if (isAllowed(match)) continue;
        offenders.push(`${file.slice(ROOT.length)}: ${match}`);
      }
      // Also catch the host on its own — a base constant plus a template
      // literal reassembles the same hot-link without ever matching above.
      for (const match of body.match(RETAIL_CDN) || []) {
        offenders.push(`${file.slice(ROOT.length)}: ${match} (the retail store's CDN)`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "Put the file in wholesale-site/public/images/ and reference it as /images/…:\n" +
      offenders.join("\n"),
  );
});

test("every homepage image the page asks for actually exists on disk", () => {
  const page = readFileSync(join(ROOT, "app/page.tsx"), "utf8");
  const referenced = [...page.matchAll(/["']\/images\/([^"']+)["']/g)].map((m) => m[1]);

  assert.ok(referenced.length >= 4, "the homepage should still be showing its bread");

  const onDisk = new Set(readdirSync(join(ROOT, "public/images")));
  for (const name of referenced) {
    assert.ok(onDisk.has(name), `app/page.tsx points at /images/${name}, which is not in public/images/`);
  }
});

test("the stored images are real, non-empty image files", () => {
  const dir = join(ROOT, "public/images");
  for (const name of readdirSync(dir)) {
    const bytes = readFileSync(join(dir, name));
    assert.ok(bytes.length > 1000, `${name} is suspiciously small — did it download as an error page?`);

    const isWebp = bytes.subarray(0, 4).toString("latin1") === "RIFF"
      && bytes.subarray(8, 12).toString("latin1") === "WEBP";
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const isPng = bytes.subarray(0, 8).toString("latin1") === "\x89PNG\r\n\x1a\n";
    assert.ok(isWebp || isJpeg || isPng, `${name} does not start with a known image signature`);
  }
});

/* --------------------------------------------- what the owner may type in -- */

test("a product photo on another company's server is refused at the door", () => {
  // The homepage hot-links were put there by hand once. The admin product
  // form is the other way one could arrive, so it is closed too.
  for (const url of [
    "https://dallasbakery.com/cdn/shop/files/barbari-bread-box-14-197.webp",
    "http://example.com/bread.jpg",
    "HTTPS://cdn.example.net/x.png",
  ]) {
    const problem = validateImageUrl(url);
    assert.ok(problem, `${url} should have been refused`);
    assert.match(problem || "", /stored on this site/);
  }
});

test("a path on this site is accepted", () => {
  assert.equal(validateImageUrl("/images/case.jpg"), null);
  assert.equal(validateImageUrl("/images/classic-barbari.webp"), null);
  // Optional: no photo falls back to the stock one rather than erroring.
  assert.equal(validateImageUrl(""), null);
  assert.equal(validateImageUrl(undefined), null);
});

test("a photo outside /images/ is refused", () => {
  // Narrow on purpose: /images/ is the one directory that ships with the site,
  // so anything else is either a typo or an attempt to reach somewhere else.
  assert.match(validateImageUrl("images/case.jpg") || "", /live in \/images\//);
  assert.match(validateImageUrl("../../etc/passwd") || "", /live in \/images\//);
  assert.match(validateImageUrl("/uploads/case.jpg") || "", /live in \/images\//);
  assert.ok(validateImageUrl("/images/../../secret.png"), "traversal must be refused");
});

test("what the apps are sent is loadable without a page to resolve against", () => {
  // The stored path is relative; what leaves the API must not be, or React
  // Native gets a URI with no host and renders nothing.
  assert.match(absoluteImageUrl("/images/case.jpg"), /^https?:\/\/[^/]+\/images\/case\.jpg$/);
  assert.equal(absoluteImageUrl("https://cdn.example.com/x.webp"), "https://cdn.example.com/x.webp");
  assert.equal(absoluteImageUrl(""), "");
});
