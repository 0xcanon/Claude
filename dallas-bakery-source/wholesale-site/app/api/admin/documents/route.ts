/**
 * The owner's copy of any invoice or statement.
 *
 * Linked straight from the shipping queue and the customer panel, so the
 * admin cookie authorizes it and the document opens in a tab ready to print
 * or attach to an email. Unlike the buyer route this is not scoped to one
 * business — the owner may look at every account.
 */

import { getAdminAccount, getAuthorizedAdmin } from "../../../admin-auth";
import { renderInvoiceHtml, renderStatementHtml } from "../../../invoice-render.ts";
import { invoiceForOrder, statementFor } from "../../../invoices.ts";

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
<title>Dallas Bakery admin</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f4f4f2;
color:#1a1714;font:16px/1.6 system-ui,sans-serif;padding:24px;text-align:center}
p{max-width:34ch}</style></head><body><p>${message}</p></body></html>`,
    { status, headers: DOCUMENT_HEADERS },
  );
}

export async function GET(request: Request) {
  const admin = await getAuthorizedAdmin();
  if (!admin) return problem("Sign in to the admin portal first.", 401);
  const account = await getAdminAccount(admin.email);
  if (!account || account.mustChangePassword) {
    return problem("Change your password in the admin portal first.", 403);
  }

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") === "statement" ? "statement" : "invoice";

  try {
    if (kind === "statement") {
      const statement = await statementFor(params.get("applicationId") || "");
      if (!statement) return problem("That account could not be found.", 404);
      return new Response(
        renderStatementHtml(statement.orders, statement.party, {
          creditLimitCents: statement.creditLimitCents,
          termsLabel: statement.termsLabel,
        }),
        { headers: DOCUMENT_HEADERS },
      );
    }

    const found = await invoiceForOrder(params.get("id") || "");
    if (!found) return problem("That order could not be found.", 404);
    return new Response(renderInvoiceHtml(found.order, found.party), { headers: DOCUMENT_HEADERS });
  } catch (caught) {
    console.error("Admin document render failed:", caught);
    return problem("That document could not be produced.", 500);
  }
}
