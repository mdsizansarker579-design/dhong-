# DHONG Worker — staged backend

## Current verified status

- The staged Worker is deployed at `https://dhong-api-staging.mdsizansarker579.workers.dev`.
- It is bound to the isolated D1 database `dhong-admin-staging` and Firebase project `dhong-c897d`.
- Staging migrations 0001, 0002 and 0003 are applied.
- Admin routes verify Firebase ID-token signatures and require an active UID in the D1 allowlist.
- Guest checkout pricing is calculated from the D1 catalog. Product and selected-variant stock are reserved in one conditional D1 update; a reservation ledger is written with the order.
- Cancelling an order restores its reserved product/variant stock once and marks the ledger rows released.
- Automated tests cover trusted catalog pricing, stock/variant checks, required idempotency keys, missing-token 401 and valid-but-not-allowlisted 403.
- Staging SQL was exercised using the synthetic test product; its fixture stock was restored to 3 and its variants JSON restored to `[]`.

## Production safety boundary

The production Worker, production D1, Firebase Rules and live checkout have not been changed. The storefront's existing Firebase order flow remains the production source of truth. The staging Worker must not be treated as production-ready or enabled for live checkout until end-to-end guest checkout, duplicate idempotency, stock concurrency, Admin authorization, order reconciliation and rollback are verified.

## Important remaining work

- A scheduled expiry policy for old pending reservations is not enabled. Cancellation restores stock; no automatic expiry is claimed.
- The live Admin Panel still manages its existing Firebase orders; its D1 order view/status synchronization needs a separate controlled rollout.
- D1 and Firebase orders are not yet reconciled into one production source of truth.
- Production Worker source/config must be compared with the staged implementation before any production deployment.
- Pathao, Steadfast and Meta Pixel/CAPI remain disabled until credentials and end-to-end tests exist.
- Only Delivered orders should count as completed sales in future profit reports.

## Local checks

```sh
npm test
npm run check
```

## Staging bindings

- D1 binding: `DHONG`
- Firebase project ID: `FIREBASE_PROJECT_ID`
- CORS allowlist: `ALLOWED_ORIGINS`
- Optional delivery fee: `DELIVERY_FEE_DEFAULT` (defaults to BDT 130 in the current Worker)

Never place provider secrets or Firebase service-account credentials in public HTML, Git, or browser-readable database paths.
