CREATE TABLE `public_submission_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `wholesale_applications` ADD `terms_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_applications` ADD `terms_accepted_at` text DEFAULT '' NOT NULL;