const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin"
});

function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}

function planTask(command) {
  const text = command.toLowerCase();
  if (text.includes("সময়") || text.includes("time")) {
    return { goal: "সময় সম্পর্কে তথ্য দেখানো", steps: ["সার্ভারের বর্তমান সময় নেওয়া", "ফলাফল দেখানো"], tool: "get_server_time" };
  }
  if (text.includes("হেলথ") || text.includes("status") || text.includes("স্ট্যাটাস")) {
    return { goal: "JARVIS সার্ভারের অবস্থা পরীক্ষা", steps: ["সার্ভারের স্বাস্থ্য পরীক্ষা", "ফলাফল দেখানো"], tool: "get_status" };
  }
  return { goal: "কমান্ড বিশ্লেষণ করে পরবর্তী পদক্ষেপ সাজানো", steps: ["কমান্ড বোঝা", "সম্ভাব্য কাজের পরিকল্পনা তৈরি", "অনুমতি প্রয়োজন কি না যাচাই"], tool: "explain_limitations" };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(env.ALLOWED_ORIGIN || origin || "*");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, name: "JARVIS", version: "0.2.0", runtime: "cloudflare-workers" }, 200, env.ALLOWED_ORIGIN || origin);
    }
    if (url.pathname === "/api/command" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "সঠিক JSON পাঠান।" }, 400, env.ALLOWED_ORIGIN || origin); }
      const command = String(body?.command || "").trim();
      if (!command) return json({ error: "কমান্ড লিখুন।" }, 400, env.ALLOWED_ORIGIN || origin);
      if (command.length > 1000) return json({ error: "কমান্ড সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।" }, 400, env.ALLOWED_ORIGIN || origin);

      const plan = planTask(command);
      let message;
      if (plan.tool === "get_server_time") message = "সার্ভারের সময়: " + new Date().toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });
      else if (plan.tool === "get_status") message = "JARVIS Cloudflare Worker চালু আছে।";
      else message = "এটি এখন নিরাপদ Demo Agent। AI Brain এবং অনুমোদিত বাস্তব কাজের টুল পরবর্তী ধাপে যুক্ত হবে।";

      return json({ taskId: crypto.randomUUID(), plan, result: { message } }, 200, env.ALLOWED_ORIGIN || origin);
    }
    return json({ error: "Not found" }, 404, env.ALLOWED_ORIGIN || origin);
  }
};
