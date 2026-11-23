# DHONG Worker — Staging preparation

## Current safety status
These changes are on the `secure-dhong-backend` branch only. They are not deployed and do not change the live Worker, Firebase Rules, or customer website. Keep the existing Firebase checkout as the primary order save until staging tests pass.

## Included
- `worker.js`: allow-listed CORS, bounded request size, customer/item validation, server-side catalog pricing and stock checks, and idempotency protection for D1 order mirroring.
- `migrations/0001_phase1.sql`: isolated `dhong_catalog` and `dhong_orders_v2` tables, including color/size stock.
- Admin Panel product page: **D1 Catalog Export (JSON)** downloads the current Firebase product catalog. It does not upload anything.
- `scripts/import-catalog.mjs`: validates the export and creates an idempotent SQL upsert file for D1.
- Tests cover trusted price calculation, stock/variant validation, idempotency-key requirement, and catalog-import validation/SQL escaping.

## Catalog import workflow (staging only)
1. From the Admin Panel, open **পণ্য ও স্টক** and click **D1 Catalog Export (JSON)**.
2. Put `dhong-d1-catalog.json` in the repository root (or use its full path).
3. Generate SQL:
   ```sh
   node scripts/import-catalog.mjs ./dhong-d1-catalog.json ./dhong-catalog-import.sql
   ```
4. Review the generated SQL, then apply it only to a staging D1 database:
   ```sh
   npx wrangler d1 execute <STAGING_DATABASE_NAME> --remote --file=./migrations/0001_phase1.sql
   npx wrangler d1 execute <STAGING_DATABASE_NAME> --remote --file=./dhong-catalog-import.sql
   ```
   Replace the placeholder with the actual staging database name. Do not point these commands at production.
5. Run a test order against the staging Worker and confirm it appears in `dhong_orders_v2`.

The importer validates the schema, duplicate product/variant IDs, integer BDT prices, sale-price bounds, and non-negative stock. It escapes SQL strings and uses an upsert, so re-importing refreshes catalog data instead of duplicating products. It does not deploy the Worker.

## Worker configuration required for staging
- D1 binding named `DHONG`.
- `ALLOWED_ORIGINS` set to the exact GitHub Pages origin.
- `DELIVERY_FEE_DEFAULT` set to the approved delivery fee in BDT.
- Apply the migration and catalog import to a staging D1 database before accepting test orders.

## Important limitations before production
- Storefront saves the customer order to Firebase first and mirrors it to the Worker best-effort. A failed API mirror does not block checkout.
- Worker pricing is authoritative from D1; until the catalog is imported, API order mirrors will be rejected because the catalog is empty.
- D1 order rows are separate from Firebase orders. The current Admin Panel order-management actions still operate on Firebase orders; a secure, authenticated D1 orders view and status synchronization are not yet implemented.
- Phase 1 checks stock but does not atomically reserve or decrement stock. Concurrent orders can oversell until Phase 2 stock reservation is implemented.
- First-order discounts, tracking-token migration, Firebase/Admin sync, affiliate/courier workflows, and Meta CAPI are not implemented by this Worker phase.
- Never expose a public `GET /api/orders` endpoint or put an admin API secret in browser code. Admin access must verify Firebase ID tokens and enforce server-side admin authorization.
- Existing live Worker source was not present in this repository. Do not deploy this Worker over the live Worker without a separate source comparison and end-to-end review.
