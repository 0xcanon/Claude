import { eq } from "drizzle-orm";

import { isOrderingReady } from "../../../../wholesale-application-service.ts";

import { getDb } from "../../../../../db";
import { wholesaleApplications } from "../../../../../db/schema";
import {
  applicationTrackingSecret,
  hashApplicationTrackingToken,
  readBearerToken,
} from "../../../../application-tracking";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json(
    { error: "Your application link is no longer available. Please sign in or contact Dallas Bakery." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const token = readBearerToken(request.headers.get("authorization"));
  const secret = applicationTrackingSecret();
  if (!token || secret.length < 32) return unauthorized();

  const tokenHash = await hashApplicationTrackingToken(token, secret);
  if (!tokenHash) return unauthorized();

  const [application] = await getDb()
    .select({
      id: wholesaleApplications.id,
      businessName: wholesaleApplications.businessName,
      contactName: wholesaleApplications.contactName,
      email: wholesaleApplications.email,
      street: wholesaleApplications.street,
      street2: wholesaleApplications.street2,
      city: wholesaleApplications.city,
      state: wholesaleApplications.state,
      zip: wholesaleApplications.zip,
      multipleLocations: wholesaleApplications.multipleLocations,
      locationCount: wholesaleApplications.locationCount,
      additionalMarkets: wholesaleApplications.additionalMarkets,
      status: wholesaleApplications.status,
      createdAt: wholesaleApplications.createdAt,
      decidedAt: wholesaleApplications.decidedAt,
    })
    .from(wholesaleApplications)
    .where(eq(wholesaleApplications.trackingTokenHash, tokenHash))
    .limit(1);

  if (!application) return unauthorized();

  // Ordering runs on Stripe against this database, so approval is the only
  // gate: there is no external store left to finish provisioning.
  const orderingReady = isOrderingReady(application.status);
  return Response.json(
    {
      application: {
        id: application.id,
        businessName: application.businessName,
        contactName: application.contactName,
        email: application.email,
        primaryLocation: {
          street: application.street,
          street2: application.street2,
          city: application.city,
          state: application.state,
          zip: application.zip,
        },
        multipleLocations: application.multipleLocations,
        locationCount: application.locationCount,
        additionalMarkets: application.additionalMarkets,
        status: application.status,
        orderingReady,
        createdAt: application.createdAt,
        decidedAt: application.decidedAt,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
