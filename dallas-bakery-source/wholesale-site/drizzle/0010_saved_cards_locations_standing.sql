-- Saved cards, extra delivery locations, and standing weekly orders.
--
-- stripe_customer_id ties an approved buyer to one Stripe Customer so a card
-- saved at checkout can be reused, including off-session for standing orders.
ALTER TABLE `wholesale_applications` ADD COLUMN `stripe_customer_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- Additional approved delivery addresses for a business. The application's
-- own address remains the primary; the owner adds these in /admin, which is
-- the screening step — buyers can never add an address themselves.
CREATE TABLE `buyer_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`street` text NOT NULL,
	`street2` text DEFAULT '' NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`zip` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `buyer_locations_application_idx` ON `buyer_locations` (`application_id`,`active`);
--> statement-breakpoint
-- One standing weekly order per buyer: "every Tuesday, these cases". The
-- lines column uses the same compact encoding as Stripe metadata
-- ("SKU:cases|SKU:cases") and is re-priced by the catalog on every run.
CREATE TABLE `standing_orders` (
	`application_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`weekday` integer NOT NULL,
	`lines` text NOT NULL,
	`location_id` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`last_run_date` text DEFAULT '' NOT NULL,
	`last_run_status` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
