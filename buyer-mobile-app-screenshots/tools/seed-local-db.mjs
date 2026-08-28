import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite';
const db = new DatabaseSync(DB);

for (const f of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
  for (const stmt of fs.readFileSync(path.join('drizzle', f), 'utf8').split('--> statement-breakpoint')) {
    const t = stmt.trim();
    if (t) { try { db.exec(t); } catch (e) { /* already applied */ } }
  }
}
console.log('tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name).join(', '));

const EMAIL = 'mina@saffronkitchen.com';
db.exec(`DELETE FROM wholesale_applications WHERE email='${EMAIL}'`);
db.exec(`INSERT INTO wholesale_applications
  (id, business_name, business_type, contact_name, email, phone, website, street, street_2, city, state, zip,
   multiple_locations, location_count, additional_markets, screening_status, address_screening, category_screening,
   standardized_address, matched_business, terms_version, terms_accepted_at, status, owner_notes, decided_by, decided_at)
  VALUES ('app_7Yh2','Saffron Kitchen Group','restaurant','Mina Farahani','${EMAIL}','(214) 555-0173','saffronkitchen.com',
   '1914 Greenville Ave','Suite 120','Dallas','TX','75206',1,3,'Plano, Richardson','passed','commercial','food-business',
   '1914 Greenville Ave, Dallas TX 75206','Saffron Kitchen','2026-01','2026-08-26','approved','','sales@dallasbakery.com','2026-08-27')`);

db.exec(`DELETE FROM wholesale_shipping_settings WHERE id='wholesale'`);
db.exec(`INSERT INTO wholesale_shipping_settings (id, rate_cents, units_per_box, box_weight_oz, box_length_in, box_width_in, box_height_in)
         VALUES ('wholesale', 1250, 25, 400, 24, 16, 6)`);

// Three orders across the three stages, priced at the real case prices.
db.exec(`DELETE FROM orders`);
const orders = [
  { n: 1042, id: 'ord-1042', status: 'shipped', track: '1Z999AA10123456784', cases: [['WS-BARBARI-25','Barbari — Case of 25',2,6250],['WS-NATURAL-25','Natural, No Sesame — Case of 25',1,6250]], boxes: 3, loaves: 75, sub: 18750, ship: 3750, created: '2026-08-21 16:12:00', shipped: '2026-08-21 23:40:00', city: 'Dallas', street: '1914 Greenville Ave', s2: 'Suite 120', zip: '75206' },
  { n: 1036, id: 'ord-1036', status: 'labeled', track: '1Z999AA10123456785', cases: [['WS-SESAME-25','Sesame — Case of 25',2,4500]], boxes: 2, loaves: 50, sub: 9000, ship: 2500, created: '2026-08-27 14:03:00', shipped: null, city: 'Plano', street: '4400 Legacy Dr', s2: '', zip: '75024' },
  { n: 1021, id: 'ord-1021', status: 'paid', track: '', cases: [['WS-BARBARI-25','Barbari — Case of 25',3,6250],['WS-WHEAT-25','Whole Wheat — Case of 25',1,6250]], boxes: 4, loaves: 100, sub: 25000, ship: 5000, created: '2026-08-28 09:41:00', shipped: null, city: 'Dallas', street: '1914 Greenville Ave', s2: 'Suite 120', zip: '75206' },
];
const insert = db.prepare(`INSERT INTO orders
  (id, channel, stripe_session_id, stripe_payment_intent_id, order_number, customer_name, email, phone,
   street, street2, city, state, zip, items_json, loaf_count, box_count, subtotal_cents, shipping_cents,
   total_cents, status, tracking_number, label_data, label_format, label_error, created_at, updated_at, shipped_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const o of orders) {
  const items = o.cases.map(([sku, name, quantity, unitAmountCents]) => ({ sku, name, quantity, unitAmountCents }));
  insert.run(o.id, 'wholesale', `pi_seed_${o.n}`, `pi_seed_${o.n}`, o.n, 'Saffron Kitchen Group', EMAIL, '(214) 555-0173',
    o.street, o.s2, o.city, 'TX', o.zip, JSON.stringify(items), o.loaves, o.boxes, o.sub, o.ship,
    o.sub + o.ship, o.status, o.track, '', '', '', o.created, o.created, o.shipped);
}
console.log('orders seeded:', db.prepare('SELECT COUNT(*) c FROM orders').get().c);
console.log('application:', db.prepare('SELECT status FROM wholesale_applications WHERE email=?').get(EMAIL));
db.close();
