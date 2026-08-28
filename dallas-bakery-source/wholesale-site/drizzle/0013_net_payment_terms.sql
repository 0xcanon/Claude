-- Net payment terms for credit customers.
--
-- The owner chooses, per business, whether its credit line runs on Net 15
-- or Net 30 — only the customers the owner picks get terms at all. Zero
-- means no net terms (card-only unless a credit limit says otherwise).
ALTER TABLE `wholesale_applications` ADD `credit_terms_days` integer DEFAULT 0 NOT NULL;

-- Each account order stamps its own due date at order time (order date plus
-- the customer's net days), so later changes to a customer's terms never
-- rewrite what an existing invoice already promised.
ALTER TABLE `orders` ADD `invoice_due_at` text;

-- Businesses that already had a credit limit keep working: they start on
-- Net 15 and the owner can switch them to Net 30 on their card.
UPDATE `wholesale_applications` SET `credit_terms_days` = 15 WHERE `credit_limit_cents` > 0;
