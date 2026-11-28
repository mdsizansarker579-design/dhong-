# JARVIS migration: GitHub + Cloudflare

The existing starter is preserved. The Cloudflare migration is isolated on branch `jarvis-cloudflare-migration`.

## Frontend
Deploy the `jarvis/web` directory as a Cloudflare Pages project.
- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `jarvis/web`

## API
Deploy `jarvis/worker/src/index.js` as a Cloudflare Worker. The Worker exposes /api/health and /api/command. After Pages is deployed, set Worker variable `ALLOWED_ORIGIN` to the Pages URL.

## Frontend API URL
If the Pages site and Worker are on different origins, set the Vite build environment variable `VITE_API_BASE_URL` to the Worker URL and rebuild Pages. For same-origin routing, configure a Pages Function/proxy before relying on a relative /api path.

## Safety and secrets
No API key is committed. Put provider credentials in Cloudflare Worker Secrets only. The current Worker remains a demo planner until an AI provider is deliberately connected.
