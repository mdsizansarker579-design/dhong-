# JARVIS Cloudflare Pages deployment

The JARVIS web app includes Cloudflare Pages Functions, so the frontend and API deploy together from one GitHub branch.

## Cloudflare dashboard setup
1. Open Workers & Pages > Create application > Pages > Connect to Git.
2. Select repository `mdsizansarker579-design/dhong-`.
3. Select branch `jarvis-cloudflare-migration`.
4. Set project root directory to `jarvis/web`.
5. Set build command to `npm run build`.
6. Set build output directory to `dist`.
7. Save and deploy.

Pages automatically discovers API functions in `jarvis/web/functions`.
After deployment, test `/api/health` on the Pages domain.

## Current limitation
The API is still a safe demo planner, not the full AI Brain. It does not execute shell commands or control a phone/computer. Provider credentials must later be added as Cloudflare secrets, never committed to GitHub or placed in frontend code.
