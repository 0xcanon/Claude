-- v22: closing a wholesale account from inside the app.
--
-- Apple requires an app that supports account creation to offer account
-- deletion in the app itself. A wholesale account cannot simply vanish — the
-- bakery has to keep its order and tax records — so closing an account
-- scrubs the personal details and keeps the row as the anchor those order
-- records already point at.

-- When the buyer closed the account. NULL for a live account; every read of
-- an approved buyer excludes closed rows, so a signed-in session stops
-- working the moment this is set.
ALTER TABLE `wholesale_applications` ADD `closed_at` text;

-- Why it closed, in the buyer's own words when they gave a reason. Kept so
-- the owner can see what drove people away; never shown to anyone else.
ALTER TABLE `wholesale_applications` ADD `closed_reason` text DEFAULT '' NOT NULL;

CREATE INDEX `wholesale_applications_closed_idx` ON `wholesale_applications` (`closed_at`);

-- ------------------------------------------------- notification choices --
-- Which alerts a device wants. A preference that lived only on the phone
-- could not stop a push the server had already decided to send, so the
-- choice is stored next to the token that receives it.
ALTER TABLE `push_devices` ADD `order_updates` integer DEFAULT 1 NOT NULL;
ALTER TABLE `push_devices` ADD `invoice_reminders` integer DEFAULT 1 NOT NULL;
