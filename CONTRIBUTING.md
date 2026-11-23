# DHONG contributor and maintenance guide

## Safe workflow

1. Start from the latest `main` and create a focused feature branch.
2. Read `ARCHITECTURE.md` and `SECURITY_REVIEW.md` before changing checkout, authentication, orders, database rules or integrations.
3. Keep each change small and explain its user-visible behavior and migration impact.
4. Add or update automated tests for every business rule.
5. Run `npm test` and `npm run check` before opening a pull request.
6. Open a pull request; do not push unfinished work directly to `main`.
7. Never merge or deploy a database/auth/order change until staging and rollback steps are documented and approved.

## Local setup

- Install the current Node.js LTS release.
- Run `npm install` only if/when dependencies are added. The current test setup uses Node built-ins and has no runtime dependency.
- Run `npm test` for automated tests.
- Run `npm run check` for JavaScript syntax and required project-file checks.

## Secrets and customer data

- Never commit Firebase service credentials, Cloudflare API tokens, Worker secrets, Meta access tokens, courier keys, customer order exports or production database dumps.
- Use local untracked `.env` files only for tools that explicitly support them; production secrets belong in the provider's secret manager.
- If a secret is exposed, revoke/rotate it; deleting it from a later commit is not sufficient.
- Use synthetic customer data in tests and staging.

## Change boundaries

- Keep customer checkout account-free.
- Do not change Firebase Rules, production D1, Cloudflare Worker deployment, GitHub Pages deployment or live integrations as part of an ordinary code-only change.
- Treat a migration as forward-only unless a tested rollback is supplied.
- Document API request/response changes and preserve backwards compatibility during migration.
- Never claim a courier, Meta Pixel/CAPI, payment or database integration is active until a real end-to-end test confirms it.
