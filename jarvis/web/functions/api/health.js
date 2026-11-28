export async function onRequestGet() {
  return Response.json({
    ok: true,
    name: "JARVIS",
    version: "0.2.0",
    runtime: "cloudflare-pages-functions"
  });
}
