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
    p1: { product_id: "p1", title: "Shirt", price: 500, sale_price: 400, stock: 10, active: 1 }
  });
  const quote = await quoteItems(db, [{ id: "p1", qty: 2, price: 1 }]);
  assert.equal(quote.subtotal, 800);
  assert.equal(quote.items[0].unit_price, 400);
  assert.equal(quote.items[0].line_total, 800);
});

test("rejects inactive and unknown products", async () => {
  const db = catalogDb({ off: { product_id: "off", title: "Off", price: 100, sale_price: 0, stock: 5, active: 0 } });
  await assert.rejects(() => quoteItems(db, [{ id: "missing", qty: 1 }]), /PRODUCT_UNAVAILABLE/);
  await assert.rejects(() => quoteItems(db, [{ id: "off", qty: 1 }]), /PRODUCT_UNAVAILABLE/);
});

test("checks combined quantity for repeated product lines", async () => {
  const db = catalogDb({
    p1: { product_id: "p1", title: "Shirt", price: 100, sale_price: 0, stock: 5, active: 1 }
  });
  await assert.rejects(() => quoteItems(db, [{ id: "p1", qty: 3 }, { id: "p1", qty: 3 }]), /INVALID_ITEM/);
});

test("rejects insufficient stock and malformed quantities", async () => {
  const db = catalogDb({
    p1: { product_id: "p1", title: "Shirt", price: 100, sale_price: 0, stock: 2, active: 1 }
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
