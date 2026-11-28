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

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "সঠিক JSON পাঠান।" }, { status: 400 });
  }

  const command = String(body?.command || "").trim();
  if (!command) return Response.json({ error: "কমান্ড লিখুন।" }, { status: 400 });
  if (command.length > 1000) return Response.json({ error: "কমান্ড সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।" }, { status: 400 });

  const plan = planTask(command);
  let message;
  if (plan.tool === "get_server_time") {
    message = "সার্ভারের সময়: " + new Date().toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });
  } else if (plan.tool === "get_status") {
    message = "JARVIS Cloudflare Pages Function চালু আছে।";
  } else {
    message = "এটি এখন নিরাপদ Demo Agent। AI Brain এবং অনুমোদিত বাস্তব কাজের টুল পরবর্তী ধাপে যুক্ত হবে।";
  }

  return Response.json({
    taskId: crypto.randomUUID(),
    plan,
    result: { message }
  });
}
