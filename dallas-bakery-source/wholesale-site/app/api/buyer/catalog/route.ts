import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import { creditStateFor } from "../../../buyer-credit.ts";
import { listApprovedLocations } from "../../../buyer-locations.ts";
import { priceOverridesFor } from "../../../customer-pricing.ts";
import { deliveryWindowFor } from "../../../delivery-dates.ts";
import { cutoffState, MAX_PO_NUMBER_LENGTH, orderRules } from "../../../order-rules.ts";
import { getWholesaleShippingSettings } from "../../../shipping-settings.ts";
import { catalogForClients } from "../../../wholesale-catalog.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const buyer = await requireBuyer(request);
    const shipping = await getWholesaleShippingSettings();
    const approvedLocations = await listApprovedLocations(buyer);
    // This buyer's exclusive prices bake into the catalog they see, and
    // their credit position rides along so checkout can offer "on account".
    const overrides = await priceOverridesFor(buyer.applicationId);
    const credit = await creditStateFor(buyer.applicationId);
    return Response.json({
      products: await catalogForClients("USD", overrides),
      credit,
      shipping: {
        rateCents: shipping.rateCents,
        unitsPerBox: shipping.unitsPerBox,
        formattedRate: shipping.formattedRate,
      },
      orderRules: orderRules(),
      cutoff: cutoffState(),
      // The days this buyer may ask delivery for, computed from today's
      // cutoff — so the picker can never offer a date the bread cannot
      // reach them by.
      deliveryWindow: deliveryWindowFor(),
      poNumberMaxLength: MAX_PO_NUMBER_LENGTH,
      // Every approved delivery address: the screened primary plus any the
      // owner added in /admin. Checkout only ever ships to one of these.
      locations: approvedLocations.map((location) => ({
        id: location.id,
        name: location.name,
        companyName: buyer.businessName,
        currencyCode: "USD",
        address: {
          address1: location.street,
          address2: location.street2,
          city: location.city,
          state: location.state,
          zip: location.zip,
          formattedAddress: [
            location.street,
            location.street2,
            `${location.city}, ${location.state} ${location.zip}`,
          ].filter(Boolean),
        },
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Catalog failed:", caught);
    return Response.json({ error: "The catalog could not be loaded." }, { status: 500 });
  }
}
