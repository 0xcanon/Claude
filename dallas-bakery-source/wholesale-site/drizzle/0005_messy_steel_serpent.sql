CREATE TABLE `wholesale_shipping_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`rate_cents` integer DEFAULT 1250 NOT NULL,
	`units_per_box` integer DEFAULT 25 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
