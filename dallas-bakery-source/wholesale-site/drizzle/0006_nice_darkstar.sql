ALTER TABLE `wholesale_applications` ADD `tracking_token_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_applications` ADD `tracking_token_issued_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `wholesale_applications_tracking_token_idx` ON `wholesale_applications` (`tracking_token_hash`);