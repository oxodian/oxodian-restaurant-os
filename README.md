# Restaurant OS

Restaurant management PWA from Oxodian Technology. Every workspace is a restaurant. Tables, kitchen orders, QR guest menus, staff roles, inventory and invoices use the inherited restaurant engine.

## Development

Use Node 24. Run `npm ci`, `npm run check` and `npm test`. Run `node scripts/restaurant-demo.mjs YYYY-MM-DD` for a disposable local demo. It prints temporary credentials and binds to localhost only.

## Preview

`wrangler.jsonc` targets only the independent ROS preview Worker and database. The preview hostname is preview.ros.oxodian.com. OAuth callback is /api/auth/google/callback. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and RESTAURANT_VAPID_PUBLIC, RESTAURANT_VAPID_PRIVATE_JWK, RESTAURANT_VAPID_CONTACT as preview secrets. Public workspace creation is closed in preview. The configured demo Gmail links after Google verifies its address. No BOS users, tokens or data are imported.

Use `npm run db:preview` and `npm run deploy:preview` for an approved preview rollout. Production requires separate credentials, D1, an approved hostname and its own validation. Record the preceding Worker version and D1 bookmark before a release. Roll back code first and assess subsequent writes before restoring a database.

The preview scripts verify that the configured database UUID resolves to the dedicated ROS preview D1 name in the selected Cloudflare account. They also check the Worker name and hostname before running migrations or deploying.

## Tenant isolation

Production uses one dedicated D1 for all restaurants. Staging uses a separate D1. The workspace key is the existing business_id. The server resolves it from the authenticated session and membership. QR requests resolve it from the table token and validate the dining session. Restaurant operations use tenant-prefixed indexes and apply staff table scope inside the state queries. Future per-tenant migration should export business_id-scoped rows in foreign-key order, provision destination storage and verify counts and financial totals before switching a tenant. No per-restaurant databases are provisioned by default.
