/**
 * Approved delivery addresses for a business.
 *
 * The application's own storefront — verified during screening — is always
 * the primary. Additional addresses are added only by the owner in /admin,
 * which is the screening step for them. Checkout accepts a location id and
 * resolves it against this list, so a buyer can choose among approved
 * addresses but can never invent one. That is still what stops an approved
 * account from redirecting cases to a house.
 */

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { buyerLocations } from "../db/schema";
import type { ApprovedBuyer } from "./buyer-auth.ts";

export type DeliveryLocation = {
  id: string;
  name: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  primary: boolean;
};

export async function listApprovedLocations(buyer: ApprovedBuyer): Promise<DeliveryLocation[]> {
  const extras = await getDb()
    .select()
    .from(buyerLocations)
    .where(and(
      eq(buyerLocations.applicationId, buyer.applicationId),
      eq(buyerLocations.active, true),
    ))
    .orderBy(buyerLocations.createdAt);

  return [
    {
      // The primary keeps the application id, which is what older app builds
      // already use as the location id.
      id: buyer.applicationId,
      name: buyer.businessName,
      street: buyer.street,
      street2: buyer.street2,
      city: buyer.city,
      state: buyer.state,
      zip: buyer.zip,
      primary: true,
    },
    ...extras.map((row) => ({
      id: row.id,
      name: row.name || buyer.businessName,
      street: row.street,
      street2: row.street2,
      city: row.city,
      state: row.state,
      zip: row.zip,
      primary: false,
    })),
  ];
}

/**
 * Resolves a requested location id to an approved address. An empty or
 * unknown id falls back to the primary — never to an error, and never to an
 * address the owner has not approved.
 */
export async function resolveDeliveryLocation(buyer: ApprovedBuyer, locationId: string) {
  const locations = await listApprovedLocations(buyer);
  return locations.find((location) => location.id === locationId) || locations[0]!;
}

export async function addBuyerLocation(input: {
  applicationId: string;
  name: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
}) {
  const id = crypto.randomUUID();
  await getDb().insert(buyerLocations).values({ id, ...input });
  return id;
}

export async function setBuyerLocationActive(id: string, active: boolean) {
  await getDb()
    .update(buyerLocations)
    .set({ active, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(buyerLocations.id, id));
}

export async function listLocationsForApplication(applicationId: string) {
  return getDb()
    .select()
    .from(buyerLocations)
    .where(eq(buyerLocations.applicationId, applicationId))
    .orderBy(buyerLocations.createdAt);
}
