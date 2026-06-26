-- Add billing_month to recurring_expenses for annual charges
-- NULL = monthly (existing behavior), 1-12 = fires once per year on that month
ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS billing_month integer DEFAULT NULL;
