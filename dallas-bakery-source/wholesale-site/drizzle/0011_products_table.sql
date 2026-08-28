-- The product catalog moves from source code into the database, so the owner
-- can add, edit, and retire breads in /admin without a deploy. Each product
-- carries its own parcel (weight and dimensions) — UPS labels are bought from
-- the item's own numbers, not one global box.
CREATE TABLE `products` (
	`sku` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`loaf_price_cents` integer NOT NULL,
	`loaves_per_case` integer DEFAULT 25 NOT NULL,
	`image_url` text DEFAULT '/images/case.jpg' NOT NULL,
	`box_weight_oz` integer DEFAULT 432 NOT NULL,
	`box_length_in` integer DEFAULT 24 NOT NULL,
	`box_width_in` integer DEFAULT 16 NOT NULL,
	`box_height_in` integer DEFAULT 6 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
-- Seed the catalog exactly as it shipped in code, so a deployed store keeps
-- selling the same four breads at the same prices without anyone noticing
-- the storage moved. Parcel: 27 lb (432 oz), 24 x 16 x 6 in per case.
INSERT INTO `products` (`sku`, `handle`, `title`, `description`, `loaf_price_cents`, `loaves_per_case`, `sort_order`) VALUES
('WS-BARBARI-25', 'barbari', 'Barbari — Case of 25', 'The classic Persian flatbread: long, golden, hand-raked, finished with sesame. Baked to order the morning it ships.', 250, 25, 1),
('WS-NATURAL-25', 'natural', 'Natural, No Sesame — Case of 25', 'Same dough and same bake, finished plain. The flexible option for kitchens building their own toppings.', 250, 25, 2),
('WS-WHEAT-25', 'whole-wheat', 'Whole Wheat — Case of 25', 'Nuttier and denser, holds up under soups, stews, and heavier sandwich builds.', 250, 25, 3),
('WS-SESAME-25', 'sesame', 'Sesame — Case of 25', 'Generously seeded across the whole loaf. Priced below the rest of the range.', 180, 25, 4);
