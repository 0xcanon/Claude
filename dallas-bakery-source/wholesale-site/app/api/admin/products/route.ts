/**
 * Product management for the owner: list, add, edit, hide, and delete breads.
 *
 * Everything a buyer sees and everything UPS bills on — name, description,
 * loaf price, case size, image, box weight and dimensions — is edited here.
 * Orders snapshot their line items, so no edit or delete rewrites history.
 */

import { getAdminAccount, getAuthorizedAdmin } from "../../../admin-auth";
import {
  catalogWithStock,
  createProduct,
  deleteProduct,
  getProduct,
  setProductActive,
  setProductInStock,
  updateProduct,
  type ProductInput,
} from "../../../wholesale-catalog.ts";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  return !origin || origin === new URL(request.url).origin;
}

async function requireAdmin() {
  const admin = await getAuthorizedAdmin();
  if (!admin) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const account = await getAdminAccount(admin.email);
  if (!account || account.mustChangePassword) {
    return { error: Response.json({ error: "Password change required" }, { status: 403 }) };
  }
  return { admin };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  return Response.json(
    { products: await catalogWithStock() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function readInput(body: Record<string, unknown>): ProductInput {
  return {
    sku: String(body.sku || "").trim().toUpperCase(),
    handle: String(body.handle || "").trim().toLowerCase(),
    title: text(body.title, 120),
    description: text(body.description, 500),
    loafPriceCents: Math.round(Number(body.loafPriceCents)),
    loavesPerCase: Math.round(Number(body.loavesPerCase)),
    imageUrl: text(body.imageUrl, 300),
    boxWeightOz: Math.round(Number(body.boxWeightOz)),
    boxLengthIn: Math.round(Number(body.boxLengthIn)),
    boxWidthIn: Math.round(Number(body.boxWidthIn)),
    boxHeightIn: Math.round(Number(body.boxHeightIn)),
    // The label copy. Ingredients get real room — a full statement with
    // sub-ingredients in parentheses runs long, and truncating one would
    // publish an incomplete allergen declaration.
    ingredients: text(body.ingredients, 2000),
    allergens: text(body.allergens, 300),
    netWeight: text(body.netWeight, 60),
    shelfLife: text(body.shelfLife, 120),
    storage: text(body.storage, 300),
    certifications: text(body.certifications, 200),
    inStock: body.inStock !== false,
    dailyCapacityCases: Math.round(Number(body.dailyCapacityCases)) || 0,
    maxCasesPerOrder: Math.round(Number(body.maxCasesPerOrder)) || 0,
    sortOrder: Math.round(Number(body.sortOrder)) || 0,
  };
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = String(body.action || "create");
  const sku = String(body.sku || "").trim().toUpperCase();

  if (action === "set-active") {
    if (!(await getProduct(sku))) return Response.json({ error: "That product no longer exists." }, { status: 404 });
    await setProductActive(sku, body.active !== false);
    return Response.json({ products: await catalogWithStock() });
  }

  // The morning "we ran out" switch, kept separate from retiring a product so
  // one click sells out a bread and one click brings it back.
  if (action === "set-stock") {
    if (!(await getProduct(sku))) return Response.json({ error: "That product no longer exists." }, { status: 404 });
    await setProductInStock(sku, body.inStock !== false);
    return Response.json({ products: await catalogWithStock() });
  }

  if (action === "delete") {
    if (!(await getProduct(sku))) return Response.json({ error: "That product no longer exists." }, { status: 404 });
    await deleteProduct(sku);
    return Response.json({ products: await catalogWithStock() });
  }

  const input = readInput(body);
  const problem = action === "update"
    ? await updateProduct(sku, input)
    : await createProduct(input);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  return Response.json({ products: await catalogWithStock() });
}
