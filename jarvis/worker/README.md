# JARVIS Cloudflare Worker API

This Worker replaces the local Express API with two serverless endpoints:

- GET /api/health
- POST /api/command with JSON body { "command": "..." }

## Deploy from the Cloudflare dashboard (phone-friendly)
1. Sign in to Cloudflare and open Workers & Pages.
2. Create a Worker named jarvis-assistant-api.
3. Choose Edit code and replace the starter code with the contents of src/index.js.
4. Deploy.
5. Open Settings > Variables and add ALLOWED_ORIGIN with the exact Cloudflare Pages frontend URL.
6. Test /api/health in the browser.

The wrangler.toml file is included for a future CLI/GitHub Actions deployment.

## Current limitation
This is the safe demo API, not the full AI Brain. It does not execute shell commands or control a phone/computer. Add an AI provider key only as a Worker secret (never in frontend code or Git).
