-- Shopify is gone: ordering runs entirely on Stripe.
--
-- These four columns existed only to track a B2B company sync that no longer
-- happens. "Ordering ready" is now simply an approved application, so there is
-- no state left for them to hold.
ALTER TABLE `wholesale_applications` DROP COLUMN `shopify_company_id`;
--> statement-breakpoint
ALTER TABLE `wholesale_applications` DROP COLUMN `shopify_location_id`;
--> statement-breakpoint
ALTER TABLE `wholesale_applications` DROP COLUMN `shopify_sync_status`;
--> statement-breakpoint
ALTER TABLE `wholesale_applications` DROP COLUMN `shopify_sync_error`;
