import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, quoteItems, handle } from "../worker.js";

test("normalizes Bangladesh phone numbers", () => {
  assert.equal(normalizePhone("+8801712345678"), "01712345678");
  assert.equal(normalizePhone("8801812345678"), "01812345678");
  assert.equal(normalizePhone("01712345678"), "01712345678");
});

function catalogDb(rows) {
  return {
    prepare(sql) {
      return {
        bind(id) {
          return { first: async () => rows[id] || null };
        }
      };
    }
  };
}

test("quotes from trusted catalog prices, not client prices", async () => {
  const db = catalogDb({
    p1: { product_id: "p1", title: "Shirt", price: 500, sale_price: 400, stock: 10, active: 1, variants_json: "[]" }
  });
  const quote = await quoteItems(db, [{ id: "p1", qty: 2, price: 1 }]);
  assert.equal(quote.subtotal, 800);
  assert.equal(quote.items[0].unit_price, 400);
  assert.equal(quote.items[0].line_total, 800);
});

test("rejects inactive and unknown products", async () => {
  const db = catalogDb({ off: { product_id: "off", title: "Off", price: 100, sale_price: 0, stock: 5, active: 0, variants_json: "[]" } });
  await assert.rejects(() => quoteItems(db, [{ id: "missing", qty: 1 }]), /PRODUCT_UNAVAILABLE/);
  await assert.rejects(() => quoteItems(db, [{ id: "off", qty: 1 }]), /PRODUCT_UNAVAILABLE/);
});

test("checks combined quantity for repeated product lines", async () => {
  const db = catalogDb({
    p1: { product_id: "p1", title: "Shirt", price: 100, sale_price: 0, stock: 5, active: 1, variants_json: "[]" }
  });
  await assert.rejects(() => quoteItems(db, [{ id: "p1", qty: 3 }, { id: "p1", qty: 3 }]), /INVALID_ITEM/);
});

test("rejects insufficient stock and malformed quantities", async () => {
  const db = catalogDb({
    p1: { product_id: "p1", title: "Shirt", price: 100, sale_price: 0, stock: 2, active: 1, variants_json: "[]" }
  });
  await assert.rejects(() => quoteItems(db, [{ id: "p1", qty: 3 }]), /INSUFFICIENT_STOCK/);
  await assert.rejects(() => quoteItems(db, [{ id: "p1", qty: 0 }]), /INVALID_ITEM/);
});

test("health endpoint responds without a database", async () => {
  const response = await handle(new Request("https://worker.test/api/health"), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ok");
});

test("order endpoint requires idempotency key", async () => {
  const response = await handle(new Request("https://worker.test/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Test", phone: "01712345678", address: "Dhaka", items: [{ id: "p1", qty: 1 }] })
  }), { DHONG: {} });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "IDEMPOTENCY_KEY_REQUIRED");
});

test("accepts the storefront quantity field and preserves selected variants", async () => {
  const db = catalogDb({
    p3: { product_id: "p3", title: "Bag", price: 900, sale_price: 0, stock: 4, active: 1,
      variants_json: JSON.stringify([{ color: "Brown", size: "Free Size", stock: 3 }]) }
  });
  const quote = await quoteItems(db, [{ product_id: "p3", quantity: 2, color: "Brown", size: "Free Size" }]);
  assert.equal(quote.subtotal, 1800);
  assert.deepEqual(quote.items[0], {
    product_id: "p3", title: "Bag", qty: 2, unit_price: 900,
    color: "Brown", size: "Free Size", line_total: 1800
  });
});

test("validates the exact color and size stock for variant products", async () => {
  const db = catalogDb({
    p2: { product_id: "p2", title: "Panjabi", price: 1200, sale_price: 1000, stock: 8, active: 1,
      variants_json: JSON.stringify([{ color: "Black", size: "L", stock: 2 }, { color: "White", size: "M", stock: 6 }]) }
  });
  const quote = await quoteItems(db, [{ id: "p2", qty: 2, color: "Black", size: "L" }]);
  assert.equal(quote.subtotal, 2000);
  await assert.rejects(() => quoteItems(db, [{ id: "p2", qty: 3, color: "Black", size: "L" }]), /INSUFFICIENT_VARIANT_STOCK/);
  await assert.rejects(() => quoteItems(db, [{ id: "p2", qty: 1, color: "Red", size: "L" }]), /VARIANT_UNAVAILABLE/);
});

import { parseCatalogDocument, buildCatalogSql } from "../scripts/import-catalog.mjs";

test("catalog importer validates and emits an idempotent D1 upsert", () => {
  const products = parseCatalogDocument({
    schema: "dhong_catalog_v1",
    products: [{ product_id: "shirt-1", title: "Men's Shirt", price: 800, sale_price: 650,
      stock: 5, active: 1, variants: [{ color: "Black", size: "L", stock: 2 }] }]
  });
  const sql = buildCatalogSql(products, "2026-11-23T00:00:00.000Z");
  assert.match(sql, /BEGIN TRANSACTION/);
  assert.match(sql, /ON CONFLICT\(product_id\) DO UPDATE/);
  assert.match(sql, /Men''s Shirt/);
  assert.match(sql, /"color":"Black"/);
  assert.match(sql, /COMMIT/);
});

test("catalog importer rejects duplicate IDs and unsafe stock or prices", () => {
  const base = { product_id: "p1", title: "Item", price: 100, sale_price: 0, stock: 2, active: 1, variants: [] };
  assert.throws(() => parseCatalogDocument({ schema: "dhong_catalog_v1", products: [base, base] }), /Duplicate product_id/);
  assert.throws(() => parseCatalogDocument({ schema: "dhong_catalog_v1", products: [{ ...base, stock: -1 }] }), /Invalid stock/);
  assert.throws(() => parseCatalogDocument({ schema: "dhong_catalog_v1", products: [{ ...base, sale_price: 100 }] }), /Invalid sale_price/);
});
