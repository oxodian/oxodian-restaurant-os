# Restaurant OS

Restaurant management PWA from Oxodian Technology. Every workspace is a restaurant. Tables, kitchen orders, QR guest menus, staff roles, inventory and invoices use the inherited restaurant engine.

## Development

Use Node 24. Run `npm ci`, `npm run check` and `npm test`. Run `node scripts/restaurant-demo.mjs YYYY-MM-DD` for a disposable local demo. It prints temporary credentials and binds to localhost only.

## Preview

`wrangler.jsonc` targets only the independent ROS preview Worker and database. The preview hostname is preview.ros.oxodian.com. OAuth callback is /api/auth/google/callback. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and RESTAURANT_VAPID_PUBLIC, RESTAURANT_VAPID_PRIVATE_JWK, RESTAURANT_VAPID_CONTACT as preview secrets. Public workspace creation is closed in preview. The configured demo Gmail links after Google verifies its address. No BOS users, tokens or data are imported.

Use `npm run db:preview` and `npm run deploy:preview` for an approved preview rollout. Production requires separate credentials, D1, an approved hostname and its own validation. Record the preceding Worker version and D1 bookmark before a release. Roll back code first and assess subsequent writes before restoring a database.
