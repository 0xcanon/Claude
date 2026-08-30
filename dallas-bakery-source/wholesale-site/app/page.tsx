import Image from "next/image";
import Link from "next/link";
import { orderRules } from "./order-rules";
import { getWholesaleShippingSettings } from "./shipping-settings";

export const dynamic = "force-dynamic";

const products = [
  {
    name: "Classic Barbari",
    note: "Traditional sesame finish",
    description:
      "A substantial, ridged Persian flatbread with a tender center and crisp, golden edges.",
    image: "/images/classic-barbari.webp",
    accent: "Best seller",
    allergens: "Contains wheat and sesame",
    netWeight: "14 oz (397 g) per loaf",
  },
  {
    name: "Natural Barbari",
    note: "No sesame seeds",
    description:
      "The same signature bake with a clean top—ideal for kitchens managing sesame preferences.",
    image: "/images/natural-barbari.webp",
    accent: "Versatile",
    allergens: "Contains wheat. Made in a bakery that also handles sesame",
    netWeight: "14 oz (397 g) per loaf",
  },
  {
    name: "Whole Wheat Barbari",
    note: "Hearty whole wheat",
    description:
      "A fuller-flavored option for breakfast programs, sandwiches, dips, and table service.",
    image: "/images/whole-wheat-barbari.webp",
    accent: "Whole grain",
    allergens: "Contains wheat. Made in a bakery that also handles sesame",
    netWeight: "13.5 oz (383 g) per loaf",
  },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GrainMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none">
      <path d="M24 42V12m0 7c-6-1-9-5-9-10 6 1 9 5 9 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0-16c6-1 9-5 9-10-6 1-9 5-9 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Home() {
  const shipping = await getWholesaleShippingSettings();
  const rules = orderRules();
  return (
    <main>
      <div className="topbar">
        <span>Kosher certified</span>
        <span className="topbar-dot" aria-hidden="true" />
        <span>Halal certified</span>
        <span className="topbar-dot" aria-hidden="true" />
        <span>Nationwide wholesale</span>
      </div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Dallas Bakery Wholesale home">
          <span className="brand-mark"><GrainMark /></span>
          <span>
            <strong>DALLAS BAKERY</strong>
            <small>WHOLESALE</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#products">Our bread</a>
          <a href="#partners">Who we serve</a>
          <a href="#process">How it works</a>
          <Link href="/order">Buyer login</Link>
          <a href="#contact">Contact</a>
        </nav>
        <Link className="header-cta" href="/apply">
          Open an account <ArrowIcon />
        </Link>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Baked in Dallas, Texas</p>
          <h1>Bread built for<br /><em>busy kitchens.</em></h1>
          <p className="hero-lede">
            Kosher and Halal Persian Barbari bread in dependable wholesale quantities for restaurants, grocers, hotels, schools, and distributors.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/apply">
              Open a wholesale account <ArrowIcon />
            </Link>
            <a className="text-link" href="#products">Explore the lineup <span>↓</span></a>
          </div>
          <div className="hero-proof" aria-label="Wholesale benefits">
            <div><strong>Business</strong><span>Account pricing</span></div>
            <div><strong>14 days</strong><span>Shelf life</span></div>
            <div><strong>Unlimited</strong><span>Weekly capacity</span></div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-image-wrap">
            <Image
              src="/images/classic-barbari.webp"
              alt="Golden Persian Barbari bread from Dallas Bakery"
              fill
              priority
              unoptimized
              sizes="(max-width: 900px) 100vw, 50vw"
            />
          </div>
          <div className="hero-stamp" aria-hidden="true">
            <span>AUTHENTIC</span>
            <GrainMark />
            <span>PERSIAN</span>
          </div>
          <div className="fresh-card">
            <span className="fresh-icon">✦</span>
            <div><strong>Kosher + Halal certified</strong><small>Made for more customers and menus</small></div>
          </div>
        </div>
      </section>

      <section className="value-strip" aria-label="Why Dallas Bakery">
        <p>Buyer-ready at every scale</p>
        <div><span>01</span> Business account pricing</div>
        <div><span>02</span> 14-day shelf life</div>
        <div><span>03</span> Unlimited production</div>
      </section>

      <section className="products-section" id="products">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> Wholesale catalog</p>
            <h2>Three breads.<br /><em>Endless possibilities.</em></h2>
          </div>
          <p>Wholesale account holders receive business pricing, with a 14-day shelf life and capacity to support buyers of any size.</p>
        </div>

        <div className="product-grid">
          {products.map((product, index) => (
            <article className="product-card" key={product.name}>
              <div className="product-image">
                <Image src={product.image} alt={`${product.name} wholesale bread`} fill unoptimized sizes="(max-width: 700px) 100vw, 33vw" />
                <span className="product-number">0{index + 1}</span>
                <span className="product-price-badge price-locked"><strong>Wholesale</strong><small>account pricing</small></span>
                <span className="product-accent">{product.accent}</span>
              </div>
              <div className="product-info">
                <div className="product-title-row">
                  <div><h3>{product.name}</h3><p className="product-note">{product.note}</p></div>
                  <p className="cert-note">Kosher · Halal</p>
                </div>
                <p>{product.description}</p>
                <p className="product-spec">
                  <strong>{product.allergens}.</strong> {product.netWeight} · 14-day shelf life ·
                  Kosher (K Pareve), Halal, Vegan. Full ingredient statements are in your account.
                </p>
                <Link href="/order" aria-label={`View wholesale pricing for ${product.name}`}>
                  View wholesale pricing <ArrowIcon />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="partners-section" id="partners">
        <div className="partners-intro">
          <p className="eyebrow eyebrow-light"><span /> Built for business</p>
          <h2>Where good bread<br /><em>earns its place.</em></h2>
          <p>From a single neighborhood location to a multi-site program, we shape the conversation around your menu, shelf, and weekly demand.</p>
          <Link className="button button-outline-light" href="/apply">Apply for an account <ArrowIcon /></Link>
        </div>
        <div className="partner-list">
          {[
            ["01", "Restaurants & caterers", "Table bread, sandwiches, shared plates, and catering trays."],
            ["02", "Grocers & specialty markets", "A distinctive bakery item with real cultural character."],
            ["03", "Hotels & hospitality", "Breakfast service, banquets, room service, and events."],
            ["04", "Schools & institutions", "Bread supply conversations built around program requirements."],
            ["05", "Distributors", "Add Persian flatbread to a broader foodservice portfolio."],
          ].map(([number, title, description]) => (
            <article key={title}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{description}</p></div>
              <ArrowIcon />
            </article>
          ))}
        </div>
      </section>

      <section className="use-section">
        <div className="use-image">
          <Image
            src="/images/sesame-barbari.webp"
            alt="Sesame Barbari bread ready for foodservice"
            fill
            unoptimized
            sizes="(max-width: 900px) 100vw, 50vw"
          />
          <span>From Dallas<br />to your table</span>
        </div>
        <div className="use-copy">
          <p className="eyebrow"><span /> Menu flexibility</p>
          <h2>One flatbread.<br /><em>More ways to serve.</em></h2>
          <div className="use-grid">
            <div><span>01</span><h3>Warm &amp; share</h3><p>Serve whole or sliced with dips, spreads, and mezze.</p></div>
            <div><span>02</span><h3>Fill &amp; fold</h3><p>Build substantial sandwiches for lunch or grab-and-go.</p></div>
            <div><span>03</span><h3>Toast &amp; top</h3><p>Create breakfast, appetizer, and flatbread-style plates.</p></div>
            <div><span>04</span><h3>Stock &amp; sell</h3><p>Offer customers an authentic Persian bakery staple.</p></div>
          </div>
        </div>
      </section>

      <section className="process-section" id="process">
        <div className="process-heading">
          <p className="eyebrow"><span /> A straightforward start</p>
          <h2>From first hello<br /><em>to repeat orders.</em></h2>
        </div>
        <div className="process-steps">
          <article>
            <span>1</span>
            <div><p>Tell us about your business</p><small>Share your location, bread needs, volume, and timing.</small></div>
          </article>
          <article>
            <span>2</span>
            <div><p>Build the right order</p><small>We’ll discuss product mix, quantities, pricing, and delivery.</small></div>
          </article>
          <article>
            <span>3</span>
            <div><p>Order securely online</p><small>Use your private catalog, saved locations, cart, and order history.</small></div>
          </article>
        </div>
      </section>

      <section className="quote-section" id="quote">
        <div className="quote-sidebar">
          <p className="eyebrow eyebrow-light"><span /> Wholesale account setup</p>
          <h2>One account.<br /><em>Every location.</em></h2>
          <p>Create one account for business pricing, ordering, and delivery support across all your locations.</p>
          <div className="direct-contact">
            <small>Prefer to reach us directly?</small>
            <a href="mailto:sales@dallasbakery.com">sales@dallasbakery.com</a>
            <a href="tel:+14697294706">(469) 729-4706</a>
          </div>
        </div>
        <div className="access-gate">
          <div className="gate-kicker">Built around your business</div>
          <h3>Everything you need to get started.</h3>
          <p>Share a few details and our wholesale team will help organize pricing, ordering, and delivery.</p>
          <ol>
            <li><span>01</span><div><strong>Business profile</strong><small>Tell us about your business and bread needs.</small></div></li>
            <li><span>02</span><div><strong>Primary location</strong><small>Save your first wholesale delivery address.</small></div></li>
            <li><span>03</span><div><strong>Additional stores</strong><small>Add as many business locations as you need.</small></div></li>
            <li><span>04</span><div><strong>Account support</strong><small>Our team helps finish your pricing and ordering setup.</small></div></li>
          </ol>
          <a className="button button-light" href="/apply">Start account setup <ArrowIcon /></a>
        </div>
      </section>

      <section className="faq-section">
        <div>
          <p className="eyebrow"><span /> Buyer questions</p>
          <h2>Good to know.</h2>
        </div>
        <div className="faq-list">
          <details open>
            <summary>How do I see wholesale pricing?<span>+</span></summary>
            <p>After approval, sign in to the Dallas Bakery buyer portal to see your private wholesale catalog and account pricing.</p>
          </details>
          <details>
            <summary>When does my order ship?<span>+</span></summary>
            <p>Order by {rules.cutoffLabel} on a business day and your bread is baked and shipped the same day. After the cutoff, it goes out the next business day. Most orders arrive in {rules.leadTimeLabel} and tracking is emailed the moment the order ships.</p>
          </details>
          <details>
            <summary>Is there a minimum order?<span>+</span></summary>
            <p>Yes—{rules.minimumLabel}. There is no maximum, and no contract or standing commitment is required.</p>
          </details>
          <details>
            <summary>How is shipping calculated?<span>+</span></summary>
            <p>Shipping is billed per case — each case ships as its own box of {shipping.unitsPerBox} loaves, so three cases arrive as three boxes. Your account shows the exact rate and the full total before you pay. Shipping is billed separately from case pricing.</p>
          </details>
          <details>
            <summary>What are the shelf life and production capacity?<span>+</span></summary>
            <p>Each bread has a {rules.shelfLifeDays}-day shelf life at room temperature with no refrigeration needed, and Dallas Bakery has unlimited weekly production capacity for wholesale accounts.</p>
          </details>
          <details>
            <summary>What if an order is late, lost, or damaged?<span>+</span></summary>
            <p>Contact us within {rules.claimWindowDays} days of delivery—or of the expected delivery date—and we will send a replacement or issue a refund.</p>
          </details>
          <details>
            <summary>Is the bread certified?<span>+</span></summary>
            <p>Yes. Dallas Bakery bread is both Kosher and Halal certified.</p>
          </details>
          <details>
            <summary>Can I order for multiple locations?<span>+</span></summary>
            <p>Yes. Wholesale orders can ship to business locations saved on your account, and you can add every store your company operates.</p>
          </details>
          <details>
            <summary>Do you work with businesses outside Texas?<span>+</span></summary>
            <p>Yes. Dallas Bakery ships {rules.carrier} throughout the {rules.deliveryAreaLabel.toLowerCase()}. We do not currently ship wholesale to Alaska, Hawaii, or U.S. territories—email {"sales@dallasbakery.com"} and we will look at options together.</p>
          </details>
          <details>
            <summary>Can we evaluate the bread before a larger order?<span>+</span></summary>
            <p>Include that request with your account details and the team can discuss the best way to evaluate product fit.</p>
          </details>
          <details>
            <summary>Can Dallas Bakery review an institutional bid?<span>+</span></summary>
            <p>Yes—include the solicitation number, requested specifications, quantities, and deadline in the inquiry for review.</p>
          </details>
        </div>
      </section>

      <footer id="contact">
        <div className="footer-main">
          <a className="brand footer-brand" href="#top">
            <span className="brand-mark"><GrainMark /></span>
            <span><strong>DALLAS BAKERY</strong><small>WHOLESALE</small></span>
          </a>
          <p>Authentic Persian Barbari bread,<br />baked in Dallas for businesses everywhere.</p>
          <Link className="button button-primary" href="/apply">Open wholesale account <ArrowIcon /></Link>
        </div>
        <div className="footer-details">
          <div><small>Visit / mail</small><p>2643 Manana Dr<br />Dallas, TX 75220</p></div>
          <div><small>Wholesale desk</small><p><a href="mailto:sales@dallasbakery.com">sales@dallasbakery.com</a><br /><a href="tel:+14697294706">(469) 729-4706</a></p></div>
          <div><small>Online</small><p><a href="https://dallasbakery.net">DallasBakery.net</a><br /><a href="https://dallasbakery.com">Retail shop ↗</a></p></div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Dallas Bakery</span>
          <span className="footer-legal"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></span>
          <span>DallasBakery.net · Wholesale bread, made with purpose.</span>
        </div>
      </footer>
    </main>
  );
}
