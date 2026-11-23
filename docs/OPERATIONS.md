# DHONG operations runbook

This runbook is intentionally conservative. It describes the safe sequence; it does not imply that a production backup, deployment or migration has been performed.

## Before a release

- Confirm the release commit and reviewed pull request.
- Export the current Firebase Realtime Database Rules and take a provider-supported backup/export of required data. Store exports in a restricted location, never in Git.
- Record current GitHub Pages and Cloudflare Worker deployment versions/configuration.
- Verify that staging uses separate Firebase/Cloudflare resources and synthetic customer data.
- Confirm secrets exist in the provider secret manager; never copy secret values into logs or source control.

## Staging verification

- Apply reviewed D1 migrations to staging only.
- Import the staging catalog and compare product IDs, prices, sale prices, variants and stock counts against the source export.
- Test guest checkout with valid and invalid products, prices, quantities, variants and customer fields.
- Test retries with the same idempotency key and verify exactly one order is created.
- Test concurrent orders for the final unit; inventory must not oversell before production enablement.
- Test Admin authentication and every protected operation as both an authorized and unauthorized user.
- Verify order status history and delivered-only profit reporting with synthetic records.
- Test failed Worker calls and retry/reconciliation without losing Firebase orders.

## Production release

Production release is blocked until the architecture and security blockers in `ARCHITECTURE.md` are closed. After approval:

1. Confirm a recent restorable backup and a written rollback plan.
2. Apply backward-compatible schema changes first.
3. Deploy the API and verify health/authorization.
4. Deploy the storefront/admin change only after API compatibility is confirmed.
5. Run a controlled test order and verify customer confirmation, Admin visibility and audit trail.
6. Monitor errors, duplicate orders, stock mismatches and checkout completion.
7. Stop rollout and roll back if order creation or Admin access regresses.

## Incident response

- Disable the affected integration/route first if it is causing unsafe writes.
- Preserve request IDs, timestamps and sanitized error details; never log tokens, full payment details or unnecessary customer data.
- Reconcile Firebase and D1 order records before replaying failed events.
- Rotate any exposed credential and review access logs.
- Document cause, impact, recovery and a regression test.
