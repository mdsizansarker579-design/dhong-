# DHONG security and integration review

Review date: 2026-11-20  
Review branch: `dhong-security-audit`  
Production branch: `main` (not changed)

## Changes prepared on this branch

- Customer storefront fallback delivery fees changed to Dhaka ৳70 and outside Dhaka ৳130.
- Admin validation and settings-form fallback values aligned to ৳70 / ৳130.
- Admin profit widget now calculates its *estimate* from orders whose status is exactly `Delivered`, not from pending/processing orders.
- The widget remains explicitly labelled as an estimate. It is **not actual net profit**, because item costs, ad spend allocation, courier fees and other expenses are not reliably recorded in the current code.

These changes do not overwrite delivery-fee values already saved in Firebase. If Firebase currently stores ৳60 / ৳120, the admin settings must be updated after the code is reviewed and deployed.

## Confirmed from repository source

- The customer page writes order and tracking records directly to Firebase Realtime Database from browser JavaScript.
- First-order discount eligibility is checked in the browser. This is not a trustworthy enforcement point; a customer can alter client-side requests.
- Product stock checks and order totals are also substantially client-side.
- Admin sign-in uses Firebase Authentication and then reads `dhong_admins/{uid}`. That check is only secure when Firebase Realtime Database Rules independently enforce admin-only access.
- Admin integration UI stores supplier integration fields, including a key field, under `dhong_integrations/supplier` in Realtime Database. Whether this is exposed depends on the live database rules. Treat any key previously stored there as potentially exposed until rules are verified; move provider secrets to server-side Worker secrets and rotate them if exposure is confirmed.
- Courier requests go through a configurable proxy URL and Firebase ID token. The proxy implementation is not present in this repository, so its authorization, secret storage, request validation and duplicate-booking protection cannot be audited here.
- Current storefront/admin source does not include a Cloudflare Worker, D1 schema/migrations, Firebase Rules export, or Pathao implementation.

## High-priority work still required

1. **Firebase Rules:** Export the current Realtime Database Rules and review them before changing anything. Do not deploy a generic rules file: the existing customer checkout and admin screens depend on specific read/write paths. Rules must prevent unauthenticated users from reading admin/customer data and prevent customers from writing arbitrary admin, stock, settings, affiliate or courier records.
2. **Server-side order API:** Move order creation, first-order eligibility, price/discount validation and stock reservation to a trusted server endpoint. The server must recalculate totals from trusted product data and use an idempotency key to prevent duplicate orders.
3. **Secrets:** Remove supplier/courier credentials from browser-readable database paths. Store secrets as Cloudflare Worker secrets (or an equivalent server-side secret manager), restrict access, and rotate any credentials that may have been exposed.
4. **Admin authorization:** Enforce admin roles on the server/database rules, not only by hiding the UI after a client-side UID check. Add least-privilege staff roles only after the current data model is understood.
5. **Profit accounting:** Record item cost, courier charge, ad-spend allocation, refunds/returns and other expenses. Actual profit should include only `Delivered` orders and use recorded costs; do not present the margin estimate as actual profit.
6. **Courier:** Audit the deployed proxy separately. Add Pathao only after merchant credentials and a tested server-side integration exist. Prevent duplicate consignments and store provider response IDs.
7. **Meta:** Pixel/CAPI, event deduplication, attribution and campaign publishing remain unverified. Keep campaign launch behind explicit admin approval.
8. **Testing:** Test guest checkout, invalid/forged prices, duplicate submission, stock race conditions, unauthorized database reads/writes, admin login, delivery-fee calculation, order status changes and delivered-only reporting in a non-production environment.

## Owner actions needed before production deployment

- Provide/export the current Firebase Realtime Database Rules (do not paste passwords or API secrets).
- Confirm whether Firebase remains the live database or whether the intended Cloudflare Worker + D1 migration is to proceed. The current repository is Firebase-based; no D1 binding/schema is present here.
- In Firebase admin settings, verify the saved delivery fees are ৳70 / ৳130 if those are still the desired charges.
- Provide the deployed courier Worker source/configuration for a separate security review. Do not send secret values in chat.

## Safety boundary

This branch is a review/preparation branch only. No production database rules, Firebase data, Worker secrets, Meta campaigns, courier bookings or live orders were changed. Do not merge or deploy until the owner reviews the diff and the required backend/security work is completed.
