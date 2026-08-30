-- v23: the operational controls a wholesale bakery needs to run every day.
--
-- Three things go in together because they are one story: an order can now be
-- held, corrected, cancelled and partly refunded; every one of those moves is
-- written down with who did it and why; and a buyer can raise a problem
-- without picking up the phone.

-- ------------------------------------------------------------- lifecycle --
-- The order table gained states beyond paid -> labeled -> shipped. Money
-- returned is tracked as an amount rather than a flag, because a short
-- shipment is refunded in part and the order still ships.
ALTER TABLE `orders` ADD `hold_reason` text DEFAULT '' NOT NULL;
ALTER TABLE `orders` ADD `cancel_requested_at` text;
ALTER TABLE `orders` ADD `cancel_reason` text DEFAULT '' NOT NULL;
ALTER TABLE `orders` ADD `cancelled_at` text;
ALTER TABLE `orders` ADD `delivered_at` text;
-- How much of this order has been sent back, in cents. Zero for most orders.
ALTER TABLE `orders` ADD `refunded_cents` integer DEFAULT 0 NOT NULL;

CREATE INDEX `orders_cancel_requested_idx` ON `orders` (`cancel_requested_at`);

-- ---------------------------------------------------------- audit trail --
-- Every status change, correction, refund and note, in order, never edited.
-- This is what answers "what happened to order 1042 and who did it" six
-- months later, and it is the difference between a shop and a business.
CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	-- placed | paid | held | released | corrected | labeled | shipped |
	-- delivered | cancel_requested | cancelled | refunded | note
	`kind` text NOT NULL,
	-- One line, written for whoever reads it next.
	`summary` text NOT NULL,
	-- Anything longer: the old and new address, the refund reason, a note.
	`detail` text DEFAULT '' NOT NULL,
	-- "owner:sales@…", "buyer:ap@…", "system", "stripe". Never blank.
	`actor` text NOT NULL,
	-- Money moved by this event, in cents. Zero for everything else.
	`amount_cents` integer DEFAULT 0 NOT NULL,
	-- Whether the buyer sees this line in their own order history.
	`buyer_visible` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `order_events_order_idx` ON `order_events` (`order_id`,`created_at`);

-- ------------------------------------------------------- support queue --
-- A buyer reporting a damaged box at 6am should not have to wait for someone
-- to answer the phone. Structured reasons so the bakery can see patterns.
CREATE TABLE `support_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`business_name` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	-- Empty when the question is not about one order.
	`order_id` text DEFAULT '' NOT NULL,
	`order_number` integer DEFAULT 0 NOT NULL,
	-- damaged | short | wrong-item | late | billing | change | other
	`reason` text NOT NULL,
	`message` text NOT NULL,
	-- open | answered | resolved
	`status` text DEFAULT 'open' NOT NULL,
	-- What the bakery said back, which the buyer sees.
	`reply` text DEFAULT '' NOT NULL,
	-- Internal, never shown to the buyer.
	`owner_notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text
);
CREATE INDEX `support_cases_status_idx` ON `support_cases` (`status`,`created_at`);
CREATE INDEX `support_cases_application_idx` ON `support_cases` (`application_id`);
