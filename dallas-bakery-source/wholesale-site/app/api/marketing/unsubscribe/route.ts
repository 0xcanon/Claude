/**
 * One-click unsubscribe.
 *
 * The link in every marketing email lands here and takes effect immediately —
 * no sign-in, no "are you sure", no preference centre. That is what the law
 * requires and what a busy buyer expects.
 *
 * The page says the same thing whether the token was known or already spent,
 * so a forwarded link can never be used to test whether an address is on the
 * list. Transactional mail — order confirmations, tracking, invoices — is
 * unaffected, and the page says so plainly.
 */

import { unsubscribeByToken } from "../../../marketing-list.ts";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../../../marketing-copy.ts";

export const dynamic = "force-dynamic";

function page(headline: string, detail: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unsubscribed — Dallas Bakery</title>
<style>
:root{color-scheme:light}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:28px;
background:#f4f4f2;color:#1a1714;
font:16px/1.6 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
main{max-width:44ch;background:#fff;border:1px solid #e2ded6;border-radius:6px;padding:36px 34px}
h1{margin:0 0 12px;font-size:23px;letter-spacing:0.01em}
p{margin:0 0 14px;color:#4d463d}
p:last-child{margin-bottom:0;font-size:14px;color:#8a7f70}
a{color:#1a1714}
</style></head><body><main>
<h1>${headline}</h1>
<p>${detail}</p>
<p>You'll still get order confirmations, shipping tracking, and invoices —
those aren't marketing, and turning them off would leave you without a record
of your own orders.</p>
<p>Questions: ${SUPPORT_PHONE} · <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
</main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

async function apply(token: string) {
  try {
    await unsubscribeByToken(token);
  } catch (caught) {
    console.error("Unsubscribe failed:", caught);
  }
  // Deliberately identical either way — a stale or forwarded link must not
  // reveal whether an address is on the list.
  return page(
    "You're unsubscribed",
    "We won't send you any more wholesale news or promotions. It takes effect right away.",
  );
}

export async function GET(request: Request) {
  return apply(new URL(request.url).searchParams.get("token") || "");
}

/**
 * Some mail clients prefetch links, and RFC 8058 one-click unsubscribe uses
 * POST. Both are handled so the click always works.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") || "";
  if (!token) {
    try {
      const form = await request.formData();
      token = String(form.get("token") || "");
    } catch {
      token = "";
    }
  }
  return apply(token);
}
