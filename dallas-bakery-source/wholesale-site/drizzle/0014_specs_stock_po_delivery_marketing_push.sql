-- v21: product specs, stock control, PO numbers, delivery dates, marketing list,
-- and push notifications. One migration so a single `npm run db:migrate` brings
-- an existing store fully up to date.

-- ---------------------------------------------------------------- products --
-- Food spec fields a wholesale buyer needs on screen (the physical label
-- already carries them; this puts the same words in the catalog, where a
-- buyer building an allergen matrix can actually read and copy them).
ALTER TABLE `products` ADD `ingredients` text DEFAULT '' NOT NULL;
ALTER TABLE `products` ADD `allergens` text DEFAULT '' NOT NULL;
ALTER TABLE `products` ADD `net_weight` text DEFAULT '' NOT NULL;
ALTER TABLE `products` ADD `shelf_life` text DEFAULT '' NOT NULL;
ALTER TABLE `products` ADD `storage` text DEFAULT '' NOT NULL;
ALTER TABLE `products` ADD `certifications` text DEFAULT '' NOT NULL;

-- Stock control. `in_stock` is the quick "sold out today" switch; the two
-- capacity numbers stop the oven being oversold — 0 means "no limit".
ALTER TABLE `products` ADD `in_stock` integer DEFAULT 1 NOT NULL;
ALTER TABLE `products` ADD `daily_capacity_cases` integer DEFAULT 0 NOT NULL;
ALTER TABLE `products` ADD `max_cases_per_order` integer DEFAULT 0 NOT NULL;

-- Seed the real label copy for the four breads already in the catalog, so the
-- catalog is accurate the moment this ships. The owner edits these in /admin.
UPDATE `products` SET
  `ingredients` = 'High Gluten Enriched Bromated Flour (Wheat Flour, Malted Barley, Niacin, Iron, Potassium Bromate, Thiamine Mononitrate, Riboflavin, Folic Acid), Bleached Wheat Flour, Salt, Yeast, Sesame Seeds, Filtered Water, Calcium Propionate',
  `allergens` = 'Wheat, Sesame',
  `net_weight` = '10 oz',
  `shelf_life` = '14 days at room temperature',
  `storage` = 'Keep at room temperature. Freeze for longer storage, or refrigerate up to 10 days.',
  `certifications` = 'Kosher (K Pareve), Halal, Vegan'
WHERE `sku` = 'WS-SESAME-25';

UPDATE `products` SET
  `ingredients` = 'High Gluten Enriched Bromated Flour (Wheat Flour, Malted Barley, Niacin, Iron, Potassium Bromate, Thiamine Mononitrate, Riboflavin, Folic Acid), Bleached Wheat Flour, Salt, Yeast, Sesame Seeds, Filtered Water, Calcium Propionate',
  `allergens` = 'Wheat, Sesame',
  `net_weight` = '14 oz (397 g)',
  `shelf_life` = '14 days at room temperature',
  `storage` = 'Keep at room temperature. Freeze for longer storage, or refrigerate up to 10 days.',
  `certifications` = 'Kosher (K Pareve), Halal, Vegan'
WHERE `sku` = 'WS-BARBARI-25';

-- The no-sesame loaf: wheat only, with an honest shared-equipment note.
UPDATE `products` SET
  `ingredients` = 'High Gluten Enriched Bromated Flour (Wheat Flour, Malted Barley, Niacin, Iron, Potassium Bromate, Thiamine Mononitrate, Riboflavin, Folic Acid), Bleached Wheat Flour, Salt, Yeast, Filtered Water, Calcium Propionate',
  `allergens` = 'Wheat. Made in a bakery that also handles sesame.',
  `net_weight` = '14 oz (397 g)',
  `shelf_life` = '14 days at room temperature',
  `storage` = 'Keep at room temperature. Freeze for longer storage, or refrigerate up to 10 days.',
  `certifications` = 'Kosher (K Pareve), Halal, Vegan'
WHERE `sku` = 'WS-NATURAL-25';

UPDATE `products` SET
  `ingredients` = 'Whole Wheat Flour, High Gluten Enriched Bromated Flour (Wheat Flour, Malted Barley, Niacin, Iron, Potassium Bromate, Thiamine Mononitrate, Riboflavin, Folic Acid), Salt, Yeast, Filtered Water, Calcium Propionate',
  `allergens` = 'Wheat. Made in a bakery that also handles sesame.',
  `net_weight` = '13.5 oz (383 g)',
  `shelf_life` = '14 days at room temperature',
  `storage` = 'Keep at room temperature. Freeze for longer storage, or refrigerate up to 10 days.',
  `certifications` = 'Kosher (K Pareve), Halal, Vegan'
WHERE `sku` = 'WS-WHEAT-25';

-- ------------------------------------------------------------------ orders --
-- A purchase-order reference the buyer's accounts-payable team requires, and
-- the delivery date the buyer asked for.
ALTER TABLE `orders` ADD `po_number` text DEFAULT '' NOT NULL;
ALTER TABLE `orders` ADD `requested_delivery_date` text;

-- -------------------------------------------------------- marketing emails --
-- A real opt-in list, separate from transactional mail. Unsubscribing is a
-- one-click token link, so every marketing send can carry a working footer.
CREATE TABLE `marketing_subscribers` (
	`email` text PRIMARY KEY NOT NULL,
	`business_name` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'application' NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`subscribed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`unsubscribed_at` text
);
CREATE INDEX `marketing_subscribers_active_idx` ON `marketing_subscribers` (`unsubscribed_at`);

-- ------------------------------------------------------------ push devices --
-- Expo push tokens, one row per device. `audience` separates the buyer app
-- from the owner app; a buyer token is scoped to the business it signed in as.
CREATE TABLE `push_devices` (
	`token` text PRIMARY KEY NOT NULL,
	`audience` text DEFAULT 'buyer' NOT NULL,
	`application_id` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`platform` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `push_devices_audience_idx` ON `push_devices` (`audience`,`application_id`);
