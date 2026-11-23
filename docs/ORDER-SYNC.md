# DHONG order mirror contract

## Current behavior

- Firebase Realtime Database remains the primary checkout/order store.
- After a successful Firebase write, the storefront mirrors eligible guest orders to the Cloudflare Worker.
- WhatsApp enquiries (WhatsApp Pending) are intentionally excluded because they do not contain a verified customer phone number or delivery address.
- The storefront sends only the customer name, phone, address, and item identifiers/quantities/selected variants. The Worker calculates item prices from dhong_catalog; browser-supplied prices and totals are not trusted.
- Storefront item records use quantity; the mirror maps this to the Worker contract's qty field and preserves product_id, color, and size.

## Important limitations

- This is a best-effort mirror, not a transactional dual-write. A Firebase order can succeed while the Worker mirror fails; checkout must not be blocked by that failure.
- The Worker currently applies its configured delivery fee (default BDT 130) and does not reproduce Firebase first-order discounts, Dhaka-specific delivery fees, or free-delivery thresholds. Therefore D1 totals are not an accounting copy of Firebase order totals.
- The Worker writes to dhong_orders_v2; the existing Admin order screen still reads Firebase. This change does not make D1 orders visible in Admin.
- D1 catalog data must be exported and imported separately. If a product ID or variant is missing/inactive in dhong_catalog, the Worker rejects the mirror.
- Do not use this D1 mirror for profit reporting, courier dispatch, or customer-facing order status until reconciliation, secure Admin access, and staging verification are implemented.

## Verification checklist

1. Export a catalog from Admin and import it into a separate staging D1 database.
2. Place a synthetic guest order for a product without variants; confirm the Worker accepts it.
3. Place a synthetic order with a selected color and size; confirm the matching variant stock is checked.
4. Confirm a WhatsApp enquiry stays in Firebase but is not sent to /api/orders.
5. Force a Worker failure and confirm the Firebase checkout still succeeds.
6. Confirm Worker price/quantity/stock decisions are based on the staging catalog, not browser totals.
7. Compare the returned D1 total against the Firebase total and account for the documented delivery-fee/discount differences.

No production migration, deployment, or live customer order test is performed by this document.
