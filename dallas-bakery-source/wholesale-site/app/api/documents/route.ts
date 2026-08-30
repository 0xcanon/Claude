/**
 * Renders a printable invoice or statement from a short-lived signed link.
 *
 * The token is the whole authorization: it names one business, one document,
 * and an expiry, and it was minted only for a buyer who was signed in at the
 * time. Nothing here reads a session, so the page opens in an ordinary
 * browser tab where the buyer can print it or save it as a PDF.
 *
 * The response is deliberately noindex, no-store, and same-origin framed —
 * a document with a customer's prices on it must never be cached by a proxy
 * or embedded in someone else's page.
 */

import { readDocumentToken } from "../../buyer-auth.ts";
import { renderInvoiceHtml, renderStatementHtml } from "../../invoice-render.ts";
import { invoiceForOrder, statementFor } from "../../invoices.ts";

export const dynamic = "force-dynamic";

const DOCUMENT_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
};

function problem(message: string, status: number) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dallas Bakery</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f4f4f2;
color:#1a1714;font:16px/1.6 system-ui,sans-serif;padding:24px;text-align:center}
p{max-width:34ch}</style></head><body><p>${message}</p></body></html>`,
    { status, headers: DOCUMENT_HEADERS },
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const claims = await readDocumentToken(token);
  if (!claims) {
    return problem(
      "This link has expired. Open it again from your account and it will work.",
      401,
    );
  }

  try {
    if (claims.kind === "statement") {
      const statement = await statementFor(claims.applicationId);
      if (!statement) return problem("That account could not be found.", 404);
      return new Response(
        renderStatementHtml(statement.orders, statement.party, {
          creditLimitCents: statement.creditLimitCents,
          termsLabel: statement.termsLabel,
        }),
        { headers: DOCUMENT_HEADERS },
      );
    }

    // Scoped to the application in the token: guessing another business's
    // order id returns nothing, not someone else's invoice.
    const found = await invoiceForOrder(claims.ref, claims.applicationId);
    if (!found) return problem("That invoice could not be found.", 404);
    return new Response(renderInvoiceHtml(found.order, found.party), { headers: DOCUMENT_HEADERS });
  } catch (caught) {
    console.error("Document render failed:", caught);
    return problem("That document could not be produced. Call us at (469) 729-4706.", 500);
  }
}
