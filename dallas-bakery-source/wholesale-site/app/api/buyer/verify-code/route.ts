import { BuyerAuthError, verifyLoginCode } from "../../../buyer-auth.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const { buyer, session } = await verifyLoginCode(String(body.email || ""), String(body.code || ""));
    const nameParts = buyer.contactName.trim().split(/\s+/);
    return Response.json({
      token: session.token,
      expiresAt: session.expiresAt,
      account: {
        id: buyer.applicationId,
        displayName: buyer.businessName,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" "),
        email: buyer.email,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Buyer code verification failed:", caught);
    return Response.json({ error: "Sign-in is unavailable right now." }, { status: 500 });
  }
}
