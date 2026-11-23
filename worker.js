const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mdsizansarker579-design.github.io",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

async function sha256(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return undefined;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function ensureOrderSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_order_id TEXT,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      items_json TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Upgrade databases created by the first DHONG API version.
  try {
    await db.prepare("ALTER TABLE orders ADD COLUMN source_order_id TEXT").run();
  } catch (error) {
    if (!String(error && error.message || error).toLowerCase().includes("duplicate column")) throw error;
  }
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_source_order_id ON orders(source_order_id)").run();
}

async function sendMetaPurchase(request, body, orderId, env, total, items) {
  if (!env.META_ACCESS_TOKEN || !env.META_PIXEL_ID) return "not_configured";
  const eventId = String(body.event_id || ("DH-" + orderId)).slice(0, 100);
  const userData = {};
  const phone = String(body.phone || "").replace(/\\D/g, "");
  const name = String(body.name || "").trim().toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  if (phone) userData.ph = [await sha256(phone)];
  if (name) userData.fn = [await sha256(name)];
  if (email) userData.em = [await sha256(email)];
  const fbp = String(body.fbp || "").trim();
  const fbc = String(body.fbc || "").trim();
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  const ip = request.headers.get("CF-Connecting-IP");
  const ua = request.headers.get("User-Agent");
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;
  const contents = items.map(item => ({
    id: String(item.product_id || item.id || item.sku || "product"),
    quantity: Math.max(1, Number(item.quantity || 1)),
    item_price: Number(item.price || item.unit_price || 0)
  }));
  const event = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    event_source_url: String(body.event_source_url || request.headers.get("Referer") || "https://mdsizansarker579-design.github.io/"),
    user_data: userData,
    custom_data: {
      currency: "BDT",
      value: total,
      content_type: "product",
      contents,
      num_items: contents.reduce((n, x) => n + x.quantity, 0)
    }
  };
  const response = await fetch(
    "https://graph.facebook.com/v23.0/" + encodeURIComponent(env.META_PIXEL_ID) + "/events?access_token=" + encodeURIComponent(env.META_ACCESS_TOKEN),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: [event] }) }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error("Meta CAPI request failed: " + (result.error?.message || response.status));
  return "sent";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (url.pathname === "/api/health" && request.method === "GET") {
      try {
        await env.DHONG.prepare("SELECT 1 AS ok").first();
        return reply({ success: true, service: "DHONG", database: "connected" });
      } catch {
        return reply({ success: false, error: "Database connection failed" }, 500);
      }
    }

    if (url.pathname === "/api/orders" && request.method === "POST") {
      try {
        const body = await request.json();
        const name = String(body.name || "").trim();
        const phone = String(body.phone || "").trim();
        const address = String(body.address || "").trim();
        const items = body.items;
        const total = Number(body.total);
        const sourceOrderId = String(body.event_id || "").trim().slice(0, 100);

        if (!name || !phone || !address || !sourceOrderId ||
            !Array.isArray(items) || items.length === 0 ||
            !Number.isFinite(total) || total <= 0 ||
            items.some(item => !item || !Number.isFinite(Number(item.quantity)) ||
              Number(item.quantity) < 1 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
          return reply({ success: false, error: "Please provide valid order details" }, 400);
        }

        await ensureOrderSchema(env.DHONG);
        const inserted = await env.DHONG.prepare(`
          INSERT OR IGNORE INTO orders
          (source_order_id, customer_name, phone, address, items_json, total)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(sourceOrderId, name, phone, address, JSON.stringify(items), total).run();

        const saved = await env.DHONG.prepare(
          "SELECT id FROM orders WHERE source_order_id = ?"
        ).bind(sourceOrderId).first();
        if (!saved) throw new Error("Order was not persisted");

        let purchaseEvent = "duplicate_suppressed";
        if (Number(inserted.meta && inserted.meta.changes || 0) > 0) {
          try {
            purchaseEvent = await sendMetaPurchase(request, body, saved.id, env, total, items);
          } catch (error) {
            console.error("Meta Purchase CAPI failed:", error.message);
            purchaseEvent = "failed";
          }
        }

        return reply({
          success: true,
          message: "Order received",
          orderId: saved.id,
          duplicate: Number(inserted.meta && inserted.meta.changes || 0) === 0,
          purchaseEvent
        }, 201);
      } catch (error) {
        console.error("Could not save order:", error && error.message || error);
        return reply({ success: false, error: "Could not save order" }, 500);
      }
    }

    return reply({ service: "DHONG API", endpoints: ["/api/health", "/api/orders"] });
  }
};
