# DHONG architecture decisions

## 2026-11-23 — Preserve Firebase checkout during staged D1 work

**Decision:** Keep the current Firebase order save as the production primary while the Cloudflare Worker/D1 order mirror is tested in staging.

**Reason:** The Worker catalog, secure Admin API, atomic stock reservation and reconciliation path are not yet production-ready. Switching sources of truth prematurely could hide orders or create duplicate/conflicting order states.

**Revisit when:** staging end-to-end tests pass, secure Admin authorization is implemented, order reconciliation and rollback are demonstrated, and production data backup is verified.

## 2026-11-23 — Keep guest checkout and separate Admin experience

**Decision:** Customer checkout remains account-free; Admin remains a separate protected interface.

**Reason:** This matches the product requirements while keeping privileged operations out of the customer experience.

## 2026-11-23 — Integrations stay disabled until verified

**Decision:** Do not mark Pathao, Steadfast or Meta CAPI active until real credentials, server-side secret storage, authorization and end-to-end tests are complete.

**Reason:** A settings screen or saved key is not proof that an integration works.
