CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`stripe_session_id` text NOT NULL,
	`stripe_payment_intent_id` text DEFAULT '' NOT NULL,
	`order_number` integer NOT NULL,
	`customer_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`street` text DEFAULT '' NOT NULL,
	`street2` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`zip` text DEFAULT '' NOT NULL,
	`items_json` text DEFAULT '[]' NOT NULL,
	`loaf_count` integer DEFAULT 0 NOT NULL,
	`box_count` integer DEFAULT 1 NOT NULL,
	`subtotal_cents` integer DEFAULT 0 NOT NULL,
	`shipping_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'paid' NOT NULL,
	`tracking_number` text DEFAULT '' NOT NULL,
	`label_format` text DEFAULT '' NOT NULL,
	`label_data` text DEFAULT '' NOT NULL,
	`label_error` text DEFAULT '' NOT NULL,
	`labeled_at` text,
	`shipped_at` text,
	`tracking_email_sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_stripe_session_id_unique` ON `orders` (`stripe_session_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
ALTER TABLE `wholesale_shipping_settings` ADD `box_weight_oz` integer DEFAULT 432 NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_shipping_settings` ADD `box_length_in` integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_shipping_settings` ADD `box_width_in` integer DEFAULT 16 NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_shipping_settings` ADD `box_height_in` integer DEFAULT 6 NOT NULL;
