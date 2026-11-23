# DHONG architecture and future maintenance

## Product boundaries

DHONG is a guest-checkout Bangladesh storefront with a separate Admin Panel. Customers should not need an account to place an order. The customer site and Admin Panel are separate user experiences, but they share a documented backend contract.

## Current state (verified from this branch)

- `index.html` is the customer storefront and currently contains substantial inline HTML, CSS and JavaScript.
- `admin.html` is the separate Admin Panel and currently contains substantial inline HTML, CSS and JavaScript.
- Firebase Authentication, Realtime Database and the existing Firebase order flow are still the live application integration.
- `worker.js`, D1 migrations and catalog import tooling are a staged backend foundation only. They are not deployed by this branch.
- The Worker writes to `dhong_orders_v2`; it is not yet the source of truth for the existing Admin order-management screens.
- No production Firebase Rules, Cloudflare bindings/secrets, database migrations or external courier/Meta credentials are included in source control.

## Target architecture

```text
Customer (guest checkout)          Admin (Firebase Auth)
          |                                  |
          +---------------+------------------+
                          |
                  Cloudflare Worker API
                    /             \
          Public checkout       Admin API
                  |                 |
             Cloudflare D1     Verify Firebase ID token
                  |             + server-side admin role
        Orders / catalog /          |
        inventory / audit       Admin operations
                  |
       Integrations (later)
       Pathao / Steadfast / Meta CAPI
```

The migration must be incremental. Keep Firebase checkout as the production primary until the Worker has been tested against a staging catalog and database, secure admin authorization exists, and order reconciliation is proven. Never run two independent order systems without a documented source-of-truth and retry/reconciliation policy.

## Non-negotiable design rules

1. **Server is authoritative:** calculate prices, discounts, delivery fees and stock on the server. Ignore browser-submitted totals and role claims.
2. **Guest checkout stays simple:** no forced customer account creation.
3. **Admin is separate and protected:** verify Firebase ID tokens server-side and check admin membership/roles server-side for every protected API operation. Never expose an admin API secret in browser code.
4. **Idempotency:** order creation and courier booking must tolerate retries without creating duplicates.
5. **Inventory safety:** use atomic reservations/decrements and a clear expiry/release process before enabling D1 stock as the source of truth.
6. **Auditability:** record who changed order status, product price/stock, discounts and settings, with timestamps.
7. **Secrets:** keep API keys in Worker secrets or a dedicated secret manager. Never store provider secrets in public HTML, Git, or browser-readable Firebase paths.
8. **Profit reporting:** only Delivered orders count as completed sales; subtract recorded product cost, delivery/courier cost, ad spend, refunds and other expenses before calling a figure actual profit.
9. **External integrations are optional modules:** Pathao, Steadfast and Meta remain disabled until credentials, authorization and end-to-end tests exist.
10. **No silent production changes:** migration, Firebase Rules changes, branch merge and deployment require backup, staging verification and explicit release approval.

## Target repository organization

Keep the current static storefront/admin pages stable while gradually extracting reusable code:

- `index.html` — storefront entry point
- `admin.html` — Admin entry point
- `assets/css/` — shared styles after safe extraction
- `assets/js/` — storefront/admin modules after safe extraction
- `worker.js` (later `src/worker/`) — server API
- `migrations/` — ordered, reviewed D1 migrations
- `scripts/` — repeatable maintenance/import/backup helpers
- `tests/` — unit, API contract and integration tests
- `docs/` — operational runbooks and decisions

Do not move or split the large HTML files in one rewrite. Extract one module at a time with behavior-preserving tests.

## Release checklist

- CI tests and syntax checks pass.
- Review the exact diff and verify no secrets or customer data entered Git.
- Export and securely back up Firebase data and current Firebase Rules.
- Apply migrations to staging only; seed a staging catalog.
- Test guest checkout, invalid price/discount, duplicate submission, variants, low stock, stock concurrency and delivery fees.
- Test admin login, server-side authorization, unauthorized access and audit logging.
- Reconcile Firebase and D1 orders and prove retry/recovery behavior.
- Verify delivered-only profit calculations against known sample orders.
- Test rollback and restore before production.
- Obtain explicit approval, then deploy a tagged release and verify health/checkout/admin flows.

## Current blockers before production

- Secure Worker admin authentication and D1 order listing/status API.
- Atomic inventory reservation.
- Firebase-to-D1 order reconciliation and source-of-truth decision.
- Staging D1 migration and catalog import.
- Production Worker source/config comparison.
- Firebase Rules export/review and backup.
- Real credential setup and verification for courier/Meta integrations.
