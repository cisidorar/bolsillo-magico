-- Add admin_fee column to payment_methods
-- Stores an optional monthly administration/maintenance fee (integer CLP)
-- that auto-registers as an expense on the billing_day (closing day) each month.

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS admin_fee integer DEFAULT NULL;
