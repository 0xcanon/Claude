"use client";

/**
 * The owner's product manager. Every bread is editable in place — name,
 * description, pricing, case size, image, the box UPS bills on, the label
 * copy buyers read, and today's stock — plus add, hide, and delete. Prices
 * are entered per loaf in dollars and weights in pounds; the API stores cents
 * and ounces.
 */

import { useCallback, useEffect, useState } from "react";

type StockState = {
  available: boolean;
  remainingToday: number | null;
  maxPerOrder: number | null;
  label: string;
};

type Product = {
  sku: string;
  handle: string;
  title: string;
  description: string;
  loafPriceCents: number;
  loavesPerCase: number;
  imageUrl: string;
  boxWeightOz: number;
  boxLengthIn: number;
  boxWidthIn: number;
  boxHeightIn: number;
  ingredients: string;
  allergens: string;
  netWeight: string;
  shelfLife: string;
  storage: string;
  certifications: string;
  inStock: boolean;
  dailyCapacityCases: number;
  maxCasesPerOrder: number;
  active: boolean;
  sortOrder: number;
  /** Added by the API: cases of this bread already ordered today. */
  committedToday?: number;
  stock?: StockState;
};

type Draft = {
  sku: string;
  title: string;
  description: string;
  loafPriceDollars: string;
  loavesPerCase: string;
  imageUrl: string;
  boxWeightLbs: string;
  boxLengthIn: string;
  boxWidthIn: string;
  boxHeightIn: string;
  ingredients: string;
  allergens: string;
  netWeight: string;
  shelfLife: string;
  storage: string;
  certifications: string;
  dailyCapacityCases: string;
  maxCasesPerOrder: string;
  sortOrder: string;
};

const EMPTY_DRAFT: Draft = {
  sku: "", title: "", description: "",
  loafPriceDollars: "2.50", loavesPerCase: "25", imageUrl: "",
  boxWeightLbs: "27", boxLengthIn: "24", boxWidthIn: "16", boxHeightIn: "6",
  ingredients: "", allergens: "", netWeight: "", shelfLife: "14 days at room temperature",
  storage: "Keep at room temperature. Freeze for longer storage, or refrigerate up to 10 days.",
  certifications: "Kosher (K Pareve), Halal, Vegan",
  dailyCapacityCases: "0", maxCasesPerOrder: "0",
  sortOrder: "0",
};

function toDraft(product: Product): Draft {
  return {
    sku: product.sku,
    title: product.title,
    description: product.description,
    loafPriceDollars: (product.loafPriceCents / 100).toFixed(2),
    loavesPerCase: String(product.loavesPerCase),
    imageUrl: product.imageUrl,
    boxWeightLbs: (product.boxWeightOz / 16).toFixed(1),
    boxLengthIn: String(product.boxLengthIn),
    boxWidthIn: String(product.boxWidthIn),
    boxHeightIn: String(product.boxHeightIn),
    ingredients: product.ingredients || "",
    allergens: product.allergens || "",
    netWeight: product.netWeight || "",
    shelfLife: product.shelfLife || "",
    storage: product.storage || "",
    certifications: product.certifications || "",
    dailyCapacityCases: String(product.dailyCapacityCases || 0),
    maxCasesPerOrder: String(product.maxCasesPerOrder || 0),
    sortOrder: String(product.sortOrder),
  };
}

function toPayload(draft: Draft, inStock: boolean) {
  return {
    sku: draft.sku.trim().toUpperCase(),
    handle: "",
    title: draft.title,
    description: draft.description,
    loafPriceCents: Math.round(Number(draft.loafPriceDollars) * 100),
    loavesPerCase: Number(draft.loavesPerCase),
    imageUrl: draft.imageUrl,
    boxWeightOz: Math.round(Number(draft.boxWeightLbs) * 16),
    boxLengthIn: Number(draft.boxLengthIn),
    boxWidthIn: Number(draft.boxWidthIn),
    boxHeightIn: Number(draft.boxHeightIn),
    ingredients: draft.ingredients,
    allergens: draft.allergens,
    netWeight: draft.netWeight,
    shelfLife: draft.shelfLife,
    storage: draft.storage,
    certifications: draft.certifications,
    inStock,
    dailyCapacityCases: Number(draft.dailyCapacityCases) || 0,
    maxCasesPerOrder: Number(draft.maxCasesPerOrder) || 0,
    sortOrder: Number(draft.sortOrder) || 0,
  };
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** How today's capacity reads on the card: "12 of 40 cases ordered". */
function capacityLine(product: Product) {
  if (!product.dailyCapacityCases) return "No daily limit";
  const used = product.committedToday || 0;
  return `${used} of ${product.dailyCapacityCases} cases ordered today`;
}

export function ProductsManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftInStock, setDraftInStock] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/products", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setProducts(data.products || []);
    } catch {
      // The section renders empty until the next successful load.
    }
  }, []);

  // load awaits the request before it sets anything.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function act(payload: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That did not save.");
      setProducts(data.products || []);
      setEditing("");
      setAdding(false);
      setMessage(done);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  function fields(current: Draft, isNew: boolean) {
    const set = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft({ ...current, [key]: event.target.value });
    return (
      <>
        <div className="admin-product-form">
          <label className="span2">
            <span>Name buyers see</span>
            <input required value={current.title} onChange={set("title")} placeholder="Rye — Case of 25" />
          </label>
          <label>
            <span>SKU {isNew ? "(letters, numbers, dashes)" : "(fixed)"}</span>
            <input required disabled={!isNew} value={current.sku} onChange={set("sku")} placeholder="WS-RYE-25" />
          </label>
          <label className="span3">
            <span>Description</span>
            <textarea rows={2} value={current.description} onChange={set("description")} />
          </label>
          <label>
            <span>Price per loaf ($)</span>
            <input required inputMode="decimal" step="0.01" min="0.01" max="100" type="number" value={current.loafPriceDollars} onChange={set("loafPriceDollars")} />
          </label>
          <label>
            <span>Loaves per case</span>
            <input required inputMode="numeric" min="1" max="500" step="1" type="number" value={current.loavesPerCase} onChange={set("loavesPerCase")} />
          </label>
          <label>
            <span>Display order</span>
            <input inputMode="numeric" step="1" type="number" value={current.sortOrder} onChange={set("sortOrder")} />
          </label>
          <label className="span3">
            <span>Image URL (leave blank for the standard photo)</span>
            <input value={current.imageUrl} onChange={set("imageUrl")} placeholder="/images/case.jpg" />
          </label>
          <label>
            <span>Packed box weight (lb)</span>
            <input required inputMode="decimal" min="1" max="150" step="0.1" type="number" value={current.boxWeightLbs} onChange={set("boxWeightLbs")} />
          </label>
          <label>
            <span>Box L × W × H (in)</span>
            <span className="admin-dims">
              <input required inputMode="numeric" min="1" max="108" step="1" type="number" aria-label="Box length in inches" value={current.boxLengthIn} onChange={set("boxLengthIn")} />
              <input required inputMode="numeric" min="1" max="108" step="1" type="number" aria-label="Box width in inches" value={current.boxWidthIn} onChange={set("boxWidthIn")} />
              <input required inputMode="numeric" min="1" max="108" step="1" type="number" aria-label="Box height in inches" value={current.boxHeightIn} onChange={set("boxHeightIn")} />
            </span>
          </label>
          <p className="admin-product-note span3">
            UPS buys each case&apos;s label from this weight and size — put the real packed numbers here.
          </p>
        </div>

        <h4 className="admin-product-group">Label &amp; specification</h4>
        <div className="admin-product-form">
          <label className="span3">
            <span>Ingredients (exactly as they read on the bag)</span>
            <textarea
              rows={3}
              value={current.ingredients}
              onChange={set("ingredients")}
              placeholder="High Gluten Enriched Bromated Flour (Wheat Flour, Malted Barley, Niacin, …), Salt, Yeast, Filtered Water"
            />
          </label>
          <label className="span2">
            <span>Contains / allergen statement</span>
            <input value={current.allergens} onChange={set("allergens")} placeholder="Wheat, Sesame" />
          </label>
          <label>
            <span>Net weight per loaf</span>
            <input value={current.netWeight} onChange={set("netWeight")} placeholder="14 oz (397 g)" />
          </label>
          <label>
            <span>Shelf life</span>
            <input value={current.shelfLife} onChange={set("shelfLife")} placeholder="14 days at room temperature" />
          </label>
          <label className="span2">
            <span>Storage</span>
            <input value={current.storage} onChange={set("storage")} placeholder="Keep at room temperature." />
          </label>
          <label className="span3">
            <span>Certifications</span>
            <input value={current.certifications} onChange={set("certifications")} placeholder="Kosher (K Pareve), Halal, Vegan" />
          </label>
          <p className="admin-product-note span3">
            This is what a buyer&apos;s food-safety file needs. Copy it word for word from the bag —
            a chef building an allergen matrix will rely on it, and so will their health inspector.
          </p>
        </div>

        <h4 className="admin-product-group">Stock</h4>
        <div className="admin-product-form">
          <label className="span3 admin-product-check">
            <input
              type="checkbox"
              checked={draftInStock}
              onChange={(event) => setDraftInStock(event.target.checked)}
            />
            <span>Available to order. Uncheck to show it as sold out without hiding it.</span>
          </label>
          <label>
            <span>Cases you can bake in a day</span>
            <input inputMode="numeric" min="0" max="100000" step="1" type="number" value={current.dailyCapacityCases} onChange={set("dailyCapacityCases")} />
          </label>
          <label>
            <span>Most cases in one order</span>
            <input inputMode="numeric" min="0" max="100000" step="1" type="number" value={current.maxCasesPerOrder} onChange={set("maxCasesPerOrder")} />
          </label>
          <p className="admin-product-note span3">
            Leave either at 0 for no limit. The daily number counts today&apos;s orders and stops
            selling once the ovens are committed, so nobody buys bread you cannot bake.
          </p>
        </div>
      </>
    );
  }

  return (
    <section className="admin-products" aria-labelledby="products-title">
      <div className="admin-products-head">
        <div>
          <p className="admin-kicker">Catalog</p>
          <h2 id="products-title">Products</h2>
          <p className="admin-products-sub">
            What buyers can order, what it costs, what the label says, and the box UPS bills on.
            Changes go live on the website and the app immediately.
          </p>
        </div>
        <button
          type="button"
          className="admin-action-approve"
          onClick={() => {
            setAdding((current) => !current);
            setEditing("");
            setDraft(EMPTY_DRAFT);
            setDraftInStock(true);
            setError("");
            setMessage("");
          }}
        >
          {adding ? "Cancel" : "Add a bread"}
        </button>
      </div>

      {adding && (
        <form
          className="admin-product-card is-editing"
          onSubmit={(event) => { event.preventDefault(); void act(toPayload(draft, draftInStock), "Product added — it is live for buyers now."); }}
        >
          {fields(draft, true)}
          <div className="admin-product-actions">
            <button type="submit" className="admin-action-approve" disabled={busy}>{busy ? "Saving…" : "Add product"}</button>
          </div>
        </form>
      )}

      <div className="admin-product-list">
        {products.map((product) => (
          editing === product.sku ? (
            <form
              key={product.sku}
              className="admin-product-card is-editing"
              onSubmit={(event) => {
                event.preventDefault();
                void act(
                  { action: "update", ...toPayload(draft, draftInStock), sku: product.sku },
                  `${draft.title || product.sku} saved.`,
                );
              }}
            >
              {fields(draft, false)}
              <div className="admin-product-actions">
                <button type="submit" className="admin-action-approve" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
                <button type="button" className="buyer-link" disabled={busy} onClick={() => setEditing("")}>Cancel</button>
              </div>
            </form>
          ) : (
            <article key={product.sku} className={product.active ? "admin-product-card" : "admin-product-card inactive"}>
              <div className="admin-product-row">
                <div className="admin-product-id">
                  <strong>{product.title}</strong>
                  <small>
                    {product.sku}
                    {product.active ? "" : " · HIDDEN FROM BUYERS"}
                    {product.active && !product.inStock ? " · SOLD OUT" : ""}
                  </small>
                  {product.description && <p>{product.description}</p>}
                  {product.allergens && <p className="admin-product-allergens">Contains: {product.allergens}</p>}
                </div>
                <dl className="admin-product-facts">
                  <div><dt>Case</dt><dd>{money(product.loafPriceCents * product.loavesPerCase)}</dd></div>
                  <div><dt>Loaf</dt><dd>{money(product.loafPriceCents)} × {product.loavesPerCase}</dd></div>
                  <div><dt>Box</dt><dd>{(product.boxWeightOz / 16).toFixed(1)} lb · {product.boxLengthIn}×{product.boxWidthIn}×{product.boxHeightIn} in</dd></div>
                  <div><dt>Today</dt><dd>{capacityLine(product)}</dd></div>
                </dl>
                <div className="admin-product-actions">
                  <button
                    type="button"
                    className="buyer-link"
                    disabled={busy}
                    onClick={() => {
                      setEditing(product.sku);
                      setAdding(false);
                      setDraft(toDraft(product));
                      setDraftInStock(product.inStock);
                      setError("");
                      setMessage("");
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="buyer-link"
                    disabled={busy}
                    onClick={() => void act(
                      { action: "set-stock", sku: product.sku, inStock: !product.inStock },
                      product.inStock
                        ? `${product.title} marked sold out — buyers see it, but can't order it.`
                        : `${product.title} is back in stock.`,
                    )}
                  >
                    {product.inStock ? "Mark sold out" : "Back in stock"}
                  </button>
                  <button
                    type="button"
                    className="buyer-link"
                    disabled={busy}
                    onClick={() => void act(
                      { action: "set-active", sku: product.sku, active: !product.active },
                      product.active ? `${product.title} hidden — buyers can no longer order it.` : `${product.title} is back on sale.`,
                    )}
                  >
                    {product.active ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className="admin-product-delete"
                    disabled={busy}
                    onClick={() => {
                      const sure = window.confirm(
                        `Delete ${product.title} permanently?\n\nPast orders keep their records, but any standing weekly order that includes it will stop and email its buyer. Hiding is usually enough.`,
                      );
                      if (sure) void act({ action: "delete", sku: product.sku }, `${product.title} deleted.`);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          )
        ))}
      </div>

      {error && <p className="buyer-error" role="alert">{error}</p>}
      {message && <p className="admin-shipping-feedback success" role="status">{message}</p>}
    </section>
  );
}
