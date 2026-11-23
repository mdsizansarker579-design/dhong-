-- DHONG D1 migration 0002: protected Admin API authorization and order-status audit.
-- Apply only to a dedicated staging D1 database until reviewed and approved.

CREATE TABLE IF NOT EXISTS dhong_admin_api_users (
  uid TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'manager')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS dhong_admin_order_audit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  admin_uid TEXT NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dhong_admin_order_audit_order
  ON dhong_admin_order_audit(order_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_dhong_orders_v2_created
  ON dhong_orders_v2(created_at DESC, order_id DESC);
