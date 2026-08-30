/**
 * Closing a wholesale account from inside the app.
 *
 * GET says exactly what closing would erase and what the bakery has to keep,
 * so the app can show it before anything is destroyed. DELETE does it.
 *
 * The confirmation phrase is required on the destructive call: this is the
 * one action in the app that cannot be undone, and a mis-tap must not be
 * enough to trigger it.
 */

import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import {
  MAX_CLOSE_REASON_LENGTH,
  closeAccount,
  previewClosure,
} from "../../../account-closure.ts";
import {
  buyerAccountClosedEmail,
  ownerAccountClosedEmail,
  sendMail,
} from "../../../email-notifications.ts";

export const dynamic = "force-dynamic";

/** Typed by the buyer to confirm. Checked case-insensitively. */
export const CONFIRM_PHRASE = "DELETE";

export async function GET(request: Request) {
  try {
    const buyer = await requireBuyer(request);
    const preview = await previewClosure(buyer.applicationId);
    if (!preview) return Response.json({ error: "That account is already closed." }, { status: 404 });
    return Response.json(
      { preview, confirmPhrase: CONFIRM_PHRASE },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Closure preview failed:", caught);
    return Response.json({ error: "That could not be loaded." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const buyer = await requireBuyer(request);

    let body: { confirm?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    if (String(body.confirm || "").trim().toUpperCase() !== CONFIRM_PHRASE) {
      return Response.json(
        { error: `Type ${CONFIRM_PHRASE} to confirm.` },
        { status: 400 },
      );
    }

    // Captured before the account is scrubbed — afterwards there is nobody
    // left to write to.
    const email = buyer.email;
    const businessName = buyer.businessName;
    const contactName = buyer.contactName;
    const reason = String(body.reason || "").slice(0, MAX_CLOSE_REASON_LENGTH);

    const result = await closeAccount(buyer.applicationId, reason);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

    // The buyer's own confirmation goes out first: it is the receipt for a
    // thing they can never undo, and it is the last mail this address gets.
    await sendMail(buyerAccountClosedEmail({
      email,
      businessName,
      contactName,
      ordersRetained: result.ordersRetained,
      outstandingCents: result.outstandingCents,
    }));
    await sendMail(ownerAccountClosedEmail({
      businessName,
      email,
      reason,
      ordersRetained: result.ordersRetained,
      outstandingCents: result.outstandingCents,
    }));

    return Response.json(
      {
        closed: true,
        businessName: result.businessName,
        ordersRetained: result.ordersRetained,
        outstandingCents: result.outstandingCents,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Account closure failed:", caught);
    return Response.json(
      { error: "The account could not be closed. Call (469) 729-4706 and we'll do it for you." },
      { status: 500 },
    );
  }
}
