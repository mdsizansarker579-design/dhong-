/**
 * DHONG API — Phase 1 secure order intake foundation.
 * This file is NOT deployed by this commit. Configure and test in a staging Worker first.
 */
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_BODY = 32 * 1024;
const MAX_ITEMS = 30;
const PHONE_RE = /^(?:\+?88)?01[3-9]\d{8}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function normalizePhone(value) {
  return String(value || "").replace(/[\s()-]/g, "").replace(/^\+?88/, "");
}
function parseMoney(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allow = (env.ALLOWED_ORIGINS || "https://mdsizansarker579-design.github.io").split(",").map(x => x.trim());
  return allow.includes(origin) ? origin : "";
}
function withCors(response, origin) {
  if (!origin) return response;
  const h = new Headers(response.headers);
  h.set("access-control-allow-origin", origin);
  h.set("vary", "Origin");
  h.set("access-control-allow-methods", "GET, POST, OPTIONS");
  h.set("access-control-allow-headers", "content-type, idempotency-key");
  return new Response(response.body, { status: response.status, headers: h });
}
async function readJson(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) throw new Error("BODY_TOO_LARGE");
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new Error("BODY_TOO_LARGE");
  try { return JSON.parse(raw); } catch { throw new Error("INVALID_JSON"); }
}
async function quoteItems(db, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_ITEMS) throw new Error("INVALID_ITEMS");
  let subtotal = 0;
  const canonical = [];
  const requested = new Map();
  for (const line of rawItems) {
    const id = cleanText(String(line?.product_id ?? line?.id ?? ""), 100);
    const qty = Number(line?.qty ?? line?.quantity);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 5) throw new Error("INVALID_ITEM");
    requested.set(id, (requested.get(id) || 0) + qty);
    if (requested.get(id) > 5) throw new Error("INVALID_ITEM");
  }
  const stockById = new Map();
  for (const [id, qty] of requested) {
    const row = await db.prepare(
      "SELECT stock, active FROM dhong_catalog WHERE product_id = ?"
    ).bind(id).first();
    if (!row || Number(row.active) !== 1) throw new Error("PRODUCT_UNAVAILABLE");
    if (!Number.isInteger(Number(row.stock)) || Number(row.stock) < qty) throw new Error("INSUFFICIENT_STOCK");
    stockById.set(id, Number(row.stock));
  }
  for (const line of rawItems) {
    const productId = cleanText(String(line?.product_id ?? line?.id ?? ""), 100);
    const qty = Number(line?.qty ?? line?.quantity);
    if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 5) throw new Error("INVALID_ITEM");
    const product = await db.prepare(
      "SELECT product_id, title, price, sale_price, stock, active FROM dhong_catalog WHERE product_id = ?"
    ).bind(productId).first();
    if (!product || Number(product.active) !== 1) throw new Error("PRODUCT_UNAVAILABLE");
    if (!Number.isInteger(Number(product.stock)) || Number(product.stock) < qty) throw new Error("INSUFFICIENT_STOCK");
    const unitPrice = Number(product.sale_price) > 0 && Number(product.sale_price) < Number(product.price)
      ? Number(product.sale_price) : Number(product.price);
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new Error("INVALID_CATALOG_PRICE");
    subtotal += unitPrice * qty;
    if (!Number.isSafeInteger(subtotal)) throw new Error("TOTAL_OVERFLOW");
    canonical.push({ product_id: productId, title: cleanText(product.title || product.name, 180), qty, unit_price: unitPrice,
      color: cleanText(line?.color, 40), size: cleanText(line?.size, 40), line_total: unitPrice * qty });
  }
  return { subtotal, items: canonical };
}
async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ service: "DHONG API", phase: 1, status: "ok", order_intake: "catalog-required" });
  }
  if (url.pathname !== "/api/orders" || request.method !== "POST") return json({ error: "NOT_FOUND" }, 404);
  if (!env.DHONG) return json({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  const idempotencyKey = cleanText(request.headers.get("Idempotency-Key"), 100);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) return json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
  let body;
  try { body = await readJson(request); }
  catch (e) { return json({ error: e.message }, e.message === "BODY_TOO_LARGE" ? 413 : 400); }
  const name = cleanText(body?.name, 100);
  const phone = normalizePhone(body?.phone);
  const address = cleanText(body?.address, 700);
  if (name.length < 2 || !PHONE_RE.test(phone) || address.length < 8) return json({ error: "INVALID_CUSTOMER_DETAILS" }, 400);
  let quote;
  try { quote = await quoteItems(env.DHONG, body.items); }
  catch (e) {
    const map = { INVALID_ITEMS:400, INVALID_ITEM:400, PRODUCT_UNAVAILABLE:409, INSUFFICIENT_STOCK:409,
      INVALID_CATALOG_PRICE:503, TOTAL_OVERFLOW:400 };
    return json({ error: e.message }, map[e.message] || 400);
  }
  const deliveryFee = Number(env.DELIVERY_FEE_DEFAULT ?? 130);
  if (!Number.isSafeInteger(deliveryFee) || deliveryFee < 0) return json({ error: "DELIVERY_FEE_NOT_CONFIGURED" }, 503);
  // Phase 1 does not trust or use client-supplied totals, discounts, stock or event IDs.
  // First-order discounts and atomic stock reservation are implemented in the next phase.
  const total = quote.subtotal + deliveryFee;
  if (!Number.isSafeInteger(total)) return json({ error: "TOTAL_OVERFLOW" }, 400);
  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DHONG.prepare(
      "INSERT INTO dhong_orders_v2 (order_id, idempotency_key, customer_name, phone, address, items_json, subtotal, discount, delivery_fee, total, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'Pending', ?)"
    ).bind(orderId, idempotencyKey, name, phone, address, JSON.stringify(quote.items), quote.subtotal, deliveryFee, total, now).run();
  } catch (e) {
    if (String(e).toLowerCase().includes("unique")) {
      const old = await env.DHONG.prepare("SELECT order_id, total, status, created_at FROM dhong_orders_v2 WHERE idempotency_key = ?")
        .bind(idempotencyKey).first();
      if (old) return json({ ok: true, duplicate: true, order: old });
    }
    return json({ error: "ORDER_SAVE_FAILED" }, 500);
  }
  return json({ ok: true, duplicate: false, order: { id: orderId, total, subtotal: quote.subtotal,
    discount: 0, delivery_fee: deliveryFee, status: "Pending", created_at: now } }, 201);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    const response = await handle(request, env);
    return withCors(response, origin);
  }
};
export { normalizePhone, quoteItems, handle };
