ALTER TABLE `wholesale_applications` ADD `shopify_company_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_applications` ADD `shopify_location_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_applications` ADD `shopify_sync_status` text DEFAULT 'not_configured' NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_applications` ADD `shopify_sync_error` text DEFAULT '' NOT NULL;