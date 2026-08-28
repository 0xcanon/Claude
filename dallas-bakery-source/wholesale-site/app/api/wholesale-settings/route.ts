import { cutoffState, orderRules } from "../../order-rules";
import { getWholesaleShippingSettings } from "../../shipping-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const shipping = await getWholesaleShippingSettings();
  // The site, the buyer app, and the emails all read these from one place,
  // so a buyer can never be quoted two different sets of rules.
  return Response.json(
    { shipping, orderRules: orderRules(), cutoff: cutoffState() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
