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
  assert.deepEqual(quote.inventory, [{ product_id: "p1", qty: 2, variants: [] }]);
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
  assert.deepEqual(quote.inventory, [{ product_id: "p3", qty: 2, variants: [{ index: 0, qty: 2 }] }]);
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

test("D1 Admin API rejects requests without a Firebase bearer token", async () => {
  const response = await handle(new Request("https://worker.test/api/admin/orders", {
    method: "GET"
  }), { DHONG: {}, FIREBASE_PROJECT_ID: "dhong-c897d" });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "ADMIN_AUTH_REQUIRED");
});

test("D1 Admin API fails closed when Firebase project configuration is missing", async () => {
  const response = await handle(new Request("https://worker.test/api/admin/orders", {
    method: "GET"
  }), { DHONG: {} });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "FIREBASE_PROJECT_ID_NOT_CONFIGURED");
});

test("D1 Admin API never returns orders when the database binding is absent", async () => {
  const response = await handle(new Request("https://worker.test/api/admin/orders", {
    method: "GET"
  }), { FIREBASE_PROJECT_ID: "dhong-c897d" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "DATABASE_NOT_CONFIGURED");
});
test("D1 Admin API rejects a valid Firebase user who is not allowlisted", async () => {
  const cryptoApi = globalThis.crypto;
  const { publicKey, privateKey } = await cryptoApi.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const jwk = await cryptoApi.subtle.exportKey("jwk", publicKey);
  jwk.kid = "dhong-test-kid";
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "RS256", typ: "JWT", kid: jwk.kid });
  const claims = encode({
    iss: "https://securetoken.google.com/dhong-c897d",
    aud: "dhong-c897d",
    sub: "not-allowlisted-test-user",
    iat: now,
    auth_time: now,
    exp: now + 3600
  });
  const signingInput = header + "." + claims;
  const signature = await cryptoApi.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const token = signingInput + "." + Buffer.from(signature).toString("base64url");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "max-age=3600" }
  });
  try {
    const db = {
      prepare() {
        return { bind() { return { first: async () => null }; } };
      }
    };
    const response = await handle(new Request("https://worker.test/api/admin/orders", {
      method: "GET",
      headers: { authorization: "Bearer " + token }
    }), { DHONG: db, FIREBASE_PROJECT_ID: "dhong-c897d" });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "ADMIN_FORBIDDEN");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
