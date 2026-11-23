-- DHONG D1 migration 0003: durable inventory reservation ledger.
-- Apply to staging first. Each row tracks one product/variant quantity reserved by an order.
CREATE TABLE IF NOT EXISTS dhong_inventory_reservations (
  reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_index INTEGER,
  qty INTEGER NOT NULL CHECK (qty > 0),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'released')),
  created_at TEXT NOT NULL,
  released_at TEXT,
  UNIQUE(order_id, product_id, variant_index)
);

CREATE INDEX IF NOT EXISTS idx_dhong_inventory_reservations_order_state
  ON dhong_inventory_reservations(order_id, state);
