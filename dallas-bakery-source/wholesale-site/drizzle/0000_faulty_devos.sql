CREATE TABLE `wholesale_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`business_type` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`street` text NOT NULL,
	`street_2` text DEFAULT '' NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`zip` text NOT NULL,
	`multiple_locations` integer DEFAULT false NOT NULL,
	`location_count` integer DEFAULT 1 NOT NULL,
	`additional_markets` text DEFAULT '' NOT NULL,
	`screening_status` text NOT NULL,
	`address_screening` text NOT NULL,
	`category_screening` text NOT NULL,
	`standardized_address` text DEFAULT '' NOT NULL,
	`matched_business` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_notes` text DEFAULT '' NOT NULL,
	`decided_by` text DEFAULT '' NOT NULL,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wholesale_applications_status_created_idx` ON `wholesale_applications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `wholesale_applications_email_idx` ON `wholesale_applications` (`email`);