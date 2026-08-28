import { cutoffState, orderRules } from "../../order-rules";
import { getWholesaleShippingSettings } from "../../shipping-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const shipping = await getWholesaleShippingSettings();
  // This endpoint is public, and prices are account-only: the payload carries
  // pack facts and ordering rules, never a rate. Signed-in surfaces get the
  // real shipping price from /api/buyer/catalog, which requires a session.
  return Response.json(
    {
      shipping: { unitsPerBox: shipping.unitsPerBox },
      orderRules: orderRules(),
      cutoff: cutoffState(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
