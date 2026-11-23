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
  h.set("access-control-allow-methods", "GET, POST, PATCH, OPTIONS");
  h.set("access-control-allow-headers", "content-type, idempotency-key, authorization");
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
  const productQty = new Map();
  const variantQty = new Map();
  for (const line of rawItems) {
    const id = cleanText(String(line?.product_id ?? line?.id ?? ""), 100);
    const qty = Number(line?.qty ?? line?.quantity);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 5) throw new Error("INVALID_ITEM");
    const color = cleanText(line?.color, 40);
    const size = cleanText(line?.size, 40);
    const variantKey = id + "\u0000" + color + "\u0000" + size;
    productQty.set(id, (productQty.get(id) || 0) + qty);
    variantQty.set(variantKey, (variantQty.get(variantKey) || 0) + qty);
    if (productQty.get(id) > 5 || variantQty.get(variantKey) > 5) throw new Error("INVALID_ITEM");
  }
  const products = new Map();
  for (const id of productQty.keys()) {
    const row = await db.prepare(
      "SELECT product_id, title, price, sale_price, stock, active, variants_json FROM dhong_catalog WHERE product_id = ?"
    ).bind(id).first();
    if (!row || Number(row.active) !== 1) throw new Error("PRODUCT_UNAVAILABLE");
    if (!Number.isInteger(Number(row.stock)) || Number(row.stock) < productQty.get(id)) throw new Error("INSUFFICIENT_STOCK");
    let variants = [];
    try { variants = JSON.parse(row.variants_json || "[]"); } catch { throw new Error("INVALID_CATALOG_VARIANTS"); }
    if (!Array.isArray(variants)) throw new Error("INVALID_CATALOG_VARIANTS");
    products.set(id, { ...row, variants });
  }
  let subtotal = 0;
  const canonical = [];
  for (const line of rawItems) {
    const productId = cleanText(String(line?.product_id ?? line?.id ?? ""), 100);
    const qty = Number(line?.qty ?? line?.quantity);
    const color = cleanText(line?.color, 40);
    const size = cleanText(line?.size, 40);
    const product = products.get(productId);
    if (!product) throw new Error("PRODUCT_UNAVAILABLE");
    if (product.variants.length) {
      const variant = product.variants.find(v => cleanText(v?.color, 40) === color && cleanText(v?.size, 40) === size);
      const key = productId + "\u0000" + color + "\u0000" + size;
      if (!variant) throw new Error("VARIANT_UNAVAILABLE");
      if (!Number.isInteger(Number(variant.stock)) || Number(variant.stock) < variantQty.get(key)) throw new Error("INSUFFICIENT_VARIANT_STOCK");
    }
    const unitPrice = Number(product.sale_price) > 0 && Number(product.sale_price) < Number(product.price)
      ? Number(product.sale_price) : Number(product.price);
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new Error("INVALID_CATALOG_PRICE");
    subtotal += unitPrice * qty;
    if (!Number.isSafeInteger(subtotal)) throw new Error("TOTAL_OVERFLOW");
    canonical.push({ product_id: productId, title: cleanText(product.title, 180), qty, unit_price: unitPrice,
      color, size, line_total: unitPrice * qty });
  }
  const inventory = [];
  for (const [productId, qty] of productQty.entries()) {
    const product = products.get(productId);
    const variantsToReserve = [];
    for (const [key, variantQtyForKey] of variantQty.entries()) {
      const [id, color, size] = key.split("\u0000");
      if (id !== productId || !product.variants.length) continue;
      const index = product.variants.findIndex(v => cleanText(v?.color, 40) === color && cleanText(v?.size, 40) === size);
      if (index < 0) throw new Error("VARIANT_UNAVAILABLE");
      variantsToReserve.push({ index, qty: variantQtyForKey });
    }
    inventory.push({ product_id: productId, qty, variants: variantsToReserve });
  }
  return { subtotal, items: canonical, inventory };
}

// One conditional UPDATE reserves every product and selected variant in a single
// SQLite statement. The sufficiency CTE prevents partial reservations under races.
function buildInventoryLedgerStatements(db, orderId, inventory, now) {
  const statements = [];
  for (const product of inventory) {
    const entries = product.variants.length
      ? product.variants.map(v => ({ variant_index: v.index, qty: v.qty }))
      : [{ variant_index: null, qty: product.qty }];
    for (const entry of entries) {
      statements.push(db.prepare(
        "INSERT INTO dhong_inventory_reservations (order_id, product_id, variant_index, qty, state, created_at) " +
        "SELECT ?, ?, ?, ?, 'reserved', ? WHERE EXISTS (SELECT 1 FROM dhong_orders_v2 WHERE order_id = ?)"
      ).bind(orderId, product.product_id, entry.variant_index, entry.qty, now, orderId));
    }
  }
  return statements;
}

async function buildInventoryReleaseStatements(db, orderId, now) {
  const result = await db.prepare(
    "SELECT product_id, variant_index, qty FROM dhong_inventory_reservations WHERE order_id = ? AND state = 'reserved'"
  ).bind(orderId).all();
  const grouped = new Map();
  for (const row of result.results || []) {
    if (!grouped.has(row.product_id)) grouped.set(row.product_id, []);
    grouped.get(row.product_id).push(row);
  }
  const statements = [];
  for (const [productId, rows] of grouped) {
    const totalQty = rows.reduce((sum, row) => sum + Number(row.qty), 0);
    let expression = "variants_json";
    for (const row of rows) {
      if (row.variant_index === null || row.variant_index === undefined) continue;
      const path = "$[" + Number(row.variant_index) + "].stock";
      expression = "json_set(" + expression + ", '" + path + "', CAST(json_extract(" + expression + ", '" + path + "') AS INTEGER) + " + Number(row.qty) + ")";
    }
    statements.push(db.prepare(
      "UPDATE dhong_catalog SET stock = stock + ?, variants_json = " + expression +
      " WHERE product_id = ? AND EXISTS (SELECT 1 FROM dhong_inventory_reservations " +
      "WHERE order_id = ? AND product_id = ? AND state = 'reserved') " +
      "AND (SELECT status FROM dhong_orders_v2 WHERE order_id = ?) = 'Cancelled'"
    ).bind(totalQty, productId, orderId, productId, orderId));
  }
  statements.push(db.prepare(
    "UPDATE dhong_inventory_reservations SET state = 'released', released_at = ? " +
    "WHERE order_id = ? AND state = 'reserved' " +
    "AND (SELECT status FROM dhong_orders_v2 WHERE order_id = ?) = 'Cancelled'"
  ).bind(now, orderId, orderId));
  return statements;
}

function buildInventoryReservation(db, inventory) {
  const products = inventory;
  const requestedRows = products.map(() => "(?, ?)").join(", ");
  const variantRows = products.flatMap(p => p.variants.map(() => "(?, ?, ?)")).join(", ");
  const params = [];
  for (const p of products) params.push(p.product_id, p.qty);
  const variantParams = [];
  for (const p of products) for (const v of p.variants) {
    variantParams.push(p.product_id, "$[" + v.index + "].stock", v.qty);
  }
  const variantCte = variantRows
    ? "requested_variants(product_id, path, qty) AS (VALUES " + variantRows + "),"
    : "requested_variants(product_id, path, qty) AS (SELECT NULL, NULL, NULL WHERE 0),";
  const jsonCases = [];
  const jsonParams = [];
  for (const p of products) {
    let expression = "variants_json";
    for (const v of p.variants) {
      const path = "$[" + v.index + "].stock";
      expression = "json_set(" + expression + ", '" + path + "', CAST(json_extract(" + expression + ", '" + path + "') AS INTEGER) - " + v.qty + ")";
    }
    jsonCases.push("WHEN ? THEN " + expression);
    jsonParams.push(p.product_id);
  }
  const ids = products.map(() => "?").join(", ");
  const sql = "WITH requested(product_id, qty) AS (VALUES " + requestedRows + "), " +
    variantCte +
    "sufficient(n) AS (SELECT COUNT(*) FROM dhong_catalog c JOIN requested r ON r.product_id = c.product_id " +
    "WHERE c.active = 1 AND c.stock >= r.qty AND NOT EXISTS (" +
    "SELECT 1 FROM requested_variants rv WHERE rv.product_id = c.product_id AND " +
    "(json_type(c.variants_json, rv.path) IS NULL OR CAST(json_extract(c.variants_json, rv.path) AS INTEGER) < rv.qty))) " +
    "UPDATE dhong_catalog SET stock = stock - (SELECT qty FROM requested WHERE product_id = dhong_catalog.product_id), " +
    "variants_json = CASE product_id " + jsonCases.join(" ") + " ELSE variants_json END " +
    "WHERE product_id IN (" + ids + ") AND (SELECT n FROM sufficient) = ?";
  const allParams = [...params, ...variantParams, ...jsonParams, ...products.map(p => p.product_id), products.length];
  return db.prepare(sql).bind(...allParams);
}

const ADMIN_STATUSES = new Set(["WhatsApp Pending", "Pending", "Processing", "Delivered", "Cancelled"]);
let firebaseJwksCache = null;
let firebaseJwksExpiry = 0;

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}
async function firebaseJwks() {
  if (firebaseJwksCache && Date.now() < firebaseJwksExpiry) return firebaseJwksCache;
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error("FIREBASE_KEYS_UNAVAILABLE");
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error("FIREBASE_KEYS_INVALID");
  firebaseJwksCache = data.keys;
  const maxAge = Number((response.headers.get("cache-control") || "").match(/max-age=(\d+)/)?.[1] || 3600);
  firebaseJwksExpiry = Date.now() + Math.min(Math.max(maxAge, 60), 86400) * 1000;
  return firebaseJwksCache;
}
async function verifyFirebaseIdToken(request, env) {
  const projectId = cleanText(env.FIREBASE_PROJECT_ID, 128);
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID_NOT_CONFIGURED");
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/i);
  if (!match) throw new Error("ADMIN_AUTH_REQUIRED");
  const parts = match[1].split(".");
  if (parts.length !== 3) throw new Error("INVALID_ADMIN_TOKEN");
  let header, claims;
  try { header = decodeJwtPart(parts[0]); claims = decodeJwtPart(parts[1]); }
  catch { throw new Error("INVALID_ADMIN_TOKEN"); }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("INVALID_ADMIN_TOKEN");
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== "https://securetoken.google.com/" + projectId ||
      claims.aud !== projectId || typeof claims.sub !== "string" || !claims.sub ||
      claims.sub.length > 128 || !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      !Number.isFinite(claims.auth_time) || claims.auth_time > now + 60) {
    throw new Error("INVALID_ADMIN_TOKEN");
  }
  const jwk = (await firebaseJwks()).find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) { firebaseJwksExpiry = 0; throw new Error("INVALID_ADMIN_TOKEN"); }
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!valid) throw new Error("INVALID_ADMIN_TOKEN");
  return { uid: claims.sub };
}
async function requireD1Admin(request, env) {
  const identity = await verifyFirebaseIdToken(request, env);
  const row = await env.DHONG.prepare(
    "SELECT uid, role FROM dhong_admin_api_users WHERE uid = ? AND active = 1"
  ).bind(identity.uid).first();
  if (!row) throw new Error("ADMIN_FORBIDDEN");
  return { uid: identity.uid, role: row.role };
}
function adminError(error) {
  const status = {
    FIREBASE_PROJECT_ID_NOT_CONFIGURED: 503,
    FIREBASE_KEYS_UNAVAILABLE: 503,
    FIREBASE_KEYS_INVALID: 503,
    ADMIN_AUTH_REQUIRED: 401,
    INVALID_ADMIN_TOKEN: 401,
    ADMIN_FORBIDDEN: 403
  }[error.message] || 500;
  return json({ error: status === 500 ? "ADMIN_API_FAILED" : error.message }, status);
}
async function handleAdminApi(request, env, url) {
  if (!env.DHONG) return json({ error: "DATABASE_NOT_CONFIGURED" }, 503);
  let admin;
  try { admin = await requireD1Admin(request, env); }
  catch (error) { return adminError(error); }

  if (url.pathname === "/api/admin/orders" && request.method === "GET") {
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "30", 10) || 30));
    const page = Math.min(10000, Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const offset = (page - 1) * limit;
    const status = cleanText(url.searchParams.get("status"), 40);
    const search = cleanText(url.searchParams.get("q"), 80);
    if (status && !ADMIN_STATUSES.has(status)) return json({ error: "INVALID_STATUS_FILTER" }, 400);
    const clauses = [];
    const params = [];
    if (status) { clauses.push("status = ?"); params.push(status); }
    if (search) {
      clauses.push("(customer_name LIKE ? OR phone LIKE ? OR order_id LIKE ?)");
      const term = "%" + search + "%";
      params.push(term, term, term);
    }
    const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
    try {
      const count = await env.DHONG.prepare("SELECT COUNT(*) AS total FROM dhong_orders_v2" + where).bind(...params).first();
      const result = await env.DHONG.prepare(
        "SELECT order_id, customer_name, phone, address, items_json, subtotal, discount, delivery_fee, total, status, created_at FROM dhong_orders_v2" +
        where + " ORDER BY created_at DESC, order_id DESC LIMIT ? OFFSET ?"
      ).bind(...params, limit, offset).all();
      return json({ ok: true, page, limit, total: Number(count?.total || 0), orders: result.results || [] });
    } catch {
      return json({ error: "ADMIN_ORDERS_READ_FAILED" }, 500);
    }
  }

  const match = url.pathname.match(/^\/api\/admin\/orders\/([A-Za-z0-9_-]{1,100})\/status$/);
  if (match && request.method === "PATCH") {
    let body;
    try { body = await readJson(request); }
    catch (error) { return json({ error: error.message }, error.message === "BODY_TOO_LARGE" ? 413 : 400); }
    const nextStatus = cleanText(body?.status, 40);
    if (!ADMIN_STATUSES.has(nextStatus)) return json({ error: "INVALID_ORDER_STATUS" }, 400);
    const orderId = match[1];
    try {
      const existing = await env.DHONG.prepare("SELECT order_id, status FROM dhong_orders_v2 WHERE order_id = ?").bind(orderId).first();
      if (!existing) return json({ error: "ORDER_NOT_FOUND" }, 404);
      const now = new Date().toISOString();
      if (existing.status === nextStatus) return json({ ok: true, changed: false, order: { order_id: orderId, status: nextStatus } });
      const statements = [
        env.DHONG.prepare("UPDATE dhong_orders_v2 SET status = ? WHERE order_id = ? AND status = ?")
          .bind(nextStatus, orderId, existing.status),
        env.DHONG.prepare(
          "INSERT INTO dhong_admin_order_audit (order_id, admin_uid, old_status, new_status, changed_at) SELECT ?, ?, ?, ?, ? WHERE changes() > 0"
        ).bind(orderId, admin.uid, existing.status, nextStatus, now)
      ];
      if (nextStatus === "Cancelled") {
        statements.push(...await buildInventoryReleaseStatements(env.DHONG, orderId, now));
      }
      const results = await env.DHONG.batch(statements);
      if (!results[0]?.meta?.changes) return json({ error: "ORDER_STATUS_CONFLICT" }, 409);
      return json({ ok: true, changed: true, order: { order_id: orderId, status: nextStatus, updated_at: now } });
    } catch {
      return json({ error: "ADMIN_ORDER_UPDATE_FAILED" }, 500);
    }
  }
  return json({ error: "NOT_FOUND" }, 404);
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ service: "DHONG API", phase: 1, status: "ok", order_intake: "catalog-required" });
  }
  if (url.pathname.startsWith("/api/admin/")) return handleAdminApi(request, env, url);
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
      INVALID_CATALOG_PRICE:503, INVALID_CATALOG_VARIANTS:503, VARIANT_UNAVAILABLE:409, INSUFFICIENT_VARIANT_STOCK:409, TOTAL_OVERFLOW:400 };
    return json({ error: e.message }, map[e.message] || 400);
  }
  const deliveryFee = Number(env.DELIVERY_FEE_DEFAULT ?? 130);
  if (!Number.isSafeInteger(deliveryFee) || deliveryFee < 0) return json({ error: "DELIVERY_FEE_NOT_CONFIGURED" }, 503);
  // The server calculates totals and atomically reserves product + selected variant stock.
  // Discounts remain disabled until a separately reviewed server-side ruleset exists.
  const total = quote.subtotal + deliveryFee;
  if (!Number.isSafeInteger(total)) return json({ error: "TOTAL_OVERFLOW" }, 400);
  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    const insertOrder = env.DHONG.prepare(
      "INSERT INTO dhong_orders_v2 (order_id, idempotency_key, customer_name, phone, address, items_json, subtotal, discount, delivery_fee, total, status, created_at) " +
      "SELECT ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'Pending', ? WHERE changes() = ?"
    ).bind(orderId, idempotencyKey, name, phone, address, JSON.stringify(quote.items), quote.subtotal, deliveryFee, total, now, quote.inventory.length);
    const results = await env.DHONG.batch([
      buildInventoryReservation(env.DHONG, quote.inventory),
      insertOrder,
      ...buildInventoryLedgerStatements(env.DHONG, orderId, quote.inventory, now)
    ]);
    if (!results[1]?.meta?.changes) return json({ error: "STOCK_CHANGED_RETRY_ORDER" }, 409);
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
