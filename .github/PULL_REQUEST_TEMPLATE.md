## What changed?
<!-- Describe the behavior change and why it is needed. -->

## Verification
- [ ] `npm test`
- [ ] `npm run check`
- [ ] Relevant guest checkout/Admin flows tested in staging

## Data and security impact
- [ ] No secrets or production customer data added
- [ ] API contract and backwards compatibility reviewed
- [ ] Firebase Rules / D1 migration impact documented
- [ ] Admin authorization enforced server-side where relevant
- [ ] Rollback and backup steps documented for data changes

## Release safety
- [ ] No production deploy or live database mutation is hidden in this change
- [ ] Explicit release approval obtained before production deployment
