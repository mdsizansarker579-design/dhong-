# DHONG Worker — Phase 1

## Status
This is a preparation implementation on `secure-dhong-backend`. It is **not deployed** and does not change the live Worker, Firebase Rules, or customer website.

## What is included
- `worker.js`: CORS allow-list, request-size and field validation, server-side catalog price lookup, sale-price selection, stock availability check, server-calculated subtotal/delivery/total, and idempotency-key duplicate handling.
- `migrations/0001_phase1.sql`: isolated D1 catalog and order tables, including per-color/size variant stock.\n- Admin Panel product page now has a **D1 Catalog Export (JSON)** button. It exports trusted product prices, total stock, and variant stock; it does not upload data or change production. Existing tables are not altered.
- Browser-supplied totals, discounts, stock, and event IDs are ignored.

## Required staging configuration
- Cloudflare Worker D1 binding named `DHONG`.
- `ALLOWED_ORIGINS` set to the exact GitHub Pages origin.
- `DELIVERY_FEE_DEFAULT` set to the approved delivery fee in BDT.
- Apply the migration to a **staging D1 database only**.
- Export `dhong-d1-catalog.json` from the Admin Panel and review it before importing into the staging D1 `dhong_catalog` table. The export is a file only; no automatic upload is performed.\n- Import each product with `product_id`, `title`, `price`, `sale_price`, `stock`, `active`, `variants_json` (JSON-stringified `variants` array), and `updated_at`.

## Known Phase 1 limitations (must be resolved before production)
- No catalog importer is included yet; an empty catalog intentionally rejects orders.
- Phase 1 checks total and selected color/size variant stock but does not reserve/decrement it atomically. This is deliberately deferred to Phase 2.
- First-order discount, secure tracking tokens, Firebase/Admin integration, affiliate and courier workflows are not included yet.
- The current storefront still saves orders directly to Firebase. Do not switch the storefront to this API until the compatibility work and end-to-end tests are complete.
- Existing live Worker source was not present in this repository, so this file must not be deployed over it without a separate diff/review.
