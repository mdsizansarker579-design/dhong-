# DHONG Admin API (staging foundation)

This document describes the protected D1 order API added in migration 0002. It is not enabled on the live Worker by this change.

## Routes

- `GET /api/admin/orders?limit=30&page=1` — newest D1 orders first; limit is capped at 100.
- Optional filters: `status` (Pending, Processing, Delivered, Cancelled, WhatsApp Pending) and `q` (customer name, phone, or order ID).
- `PATCH /api/admin/orders/{order_id}/status` with JSON `{"status":"Processing"}` — updates the D1 status and writes an audit row.

Both routes require `Authorization: Bearer <Firebase ID token>`. Only IDs present and active in `dhong_admin_api_users` are authorized. A Firebase login by itself is not sufficient.

## Worker configuration

Set the Worker variable `FIREBASE_PROJECT_ID=dhong-c897d` (the project ID already used by the current Admin page). Keep it as a non-secret variable; never place service-account private keys, API secrets, or admin tokens in HTML.

The Worker verifies Firebase ID tokens against Google's published Secure Token JWKS, including RS256 signature, issuer, audience, subject, and time claims. Google signing keys are cached in Worker memory.

## Staging-only onboarding

A separate empty staging D1 database (`dhong-admin-staging`) and a separate Worker (`dhong-api-staging`) have been created. Migrations `0001_phase1.sql` and `0002_admin_api.sql` were applied successfully to that staging database only. The staging Worker is configured with the D1 binding, `FIREBASE_PROJECT_ID=dhong-c897d`, and the GitHub Pages CORS origin.

1. The staging database starts with zero orders and zero authorized Admin UIDs; it contains schema only.
2. For a repeatable rebuild, apply the existing order/catalog migrations first, then `migrations/0002_admin_api.sql`.
3. Add only the verified Firebase Auth UID(s) of authorized admins to `dhong_admin_api_users`, for example:

   ```sql
   INSERT INTO dhong_admin_api_users (uid, role, active)
   VALUES ('REPLACE_WITH_VERIFIED_FIREBASE_UID', 'admin', 1);
   ```

4. Configure the staging Worker with the staging D1 binding and `FIREBASE_PROJECT_ID`.
5. Add a verified Firebase Auth UID to the staging allowlist, then test unauthenticated 401, authenticated non-admin 403, authorized list access, status update, and audit rows using synthetic orders.

Do not copy a UID from a browser-supplied request body. Confirm it from the authenticated Firebase session or Firebase Authentication console.

## Important boundary

The existing Admin page still reads and writes customer orders in Firebase Realtime Database. This API reads and updates only `dhong_orders_v2` in D1. It does not silently switch the live Admin page, sync Firebase orders into D1, or change Firebase Rules. Connecting the UI requires a separately reviewed migration plan and staging tests.

The current customer checkout and production Worker are unchanged. The staging Worker has been uploaded separately, but runtime requests with a real Firebase token have not yet been verified. Do not apply this migration to production or deploy the staging source over the production Worker until the D1 schema, staging tests, admin UID, and rollback/backup plan are verified.
