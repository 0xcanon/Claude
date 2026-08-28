import { BuyerAuthError, issueLoginCode } from "../../../buyer-auth.ts";
import { buyerCodeEmail, sendMail } from "../../../email-notifications.ts";

export const dynamic = "force-dynamic";

// Identical answer whether or not the address has an account: this endpoint
// is unauthenticated, and a different message would turn it into a way to
// discover which businesses Dallas Bakery has approved.
const NEUTRAL = {
  status: "sent",
  message: "If that email has an approved wholesale account, a six-digit code is on its way.",
};

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const issued = await issueLoginCode(String(body.email || ""));
    if (issued) await sendMail(buyerCodeEmail(issued.buyer, issued.code));
    return Response.json(NEUTRAL);
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Buyer code request failed:", caught);
    return Response.json({ error: "Sign-in is unavailable right now." }, { status: 500 });
  }
}
