-- DHONG order sync migration
-- Safe to run once against the existing dhong-admin-db database.
ALTER TABLE orders ADD COLUMN source_order_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_source_order_id ON orders(source_order_id);
