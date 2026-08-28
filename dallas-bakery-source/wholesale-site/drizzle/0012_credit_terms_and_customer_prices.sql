-- Credit terms and per-customer pricing.
--
-- A credit limit on an approved application lets that buyer place orders
-- without a card: the order records payment_terms 'account' and counts
-- against the limit until its invoice is marked paid in /admin. A limit of
-- zero (the default) means card-only, which is every account until the
-- owner decides otherwise.
ALTER TABLE `wholesale_applications` ADD `credit_limit_cents` integer DEFAULT 0 NOT NULL;

-- Which business placed the order (empty for retail), how it is being paid
-- ('card' or 'account'), and — for account orders — when its invoice was
-- settled. Unpaid account orders are the buyer's outstanding balance.
ALTER TABLE `orders` ADD `application_id` text DEFAULT '' NOT NULL;
ALTER TABLE `orders` ADD `payment_terms` text DEFAULT 'card' NOT NULL;
ALTER TABLE `orders` ADD `invoice_paid_at` text;
CREATE INDEX `orders_application_terms_idx` ON `orders` (`application_id`,`payment_terms`);

-- Exclusive per-customer prices: one row overrides one product's price per
-- loaf for one business. Absent rows mean the catalog price applies.
CREATE TABLE `customer_prices` (
	`application_id` text NOT NULL,
	`sku` text NOT NULL,
	`loaf_price_cents` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`application_id`, `sku`)
);
