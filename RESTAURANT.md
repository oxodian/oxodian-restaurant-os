# Restaurant operating notes

Owners manage the menu, QR tables and invitations. Managers may reassign tables. Staff see assigned and available tables. Cashier and reporting privileges are independent. Guests use a table QR without an account. Contact details are optional.

The guest orders into an open dining session. Serve all orders before generating one unpaid invoice for the table. After manually receiving payment, record its method and amount. Close the table after cleaning. No customer online checkout is enabled.

Use a fresh preview database for reseeding. Apply the independent migrations and import the generated synthetic SQL only after verifying the target is empty. Preserve the prior preview database for rollback.

Before production verify invitation acceptance and revocation with separate real accounts, background and locked-screen alerts on Android and iPhone, QR print/scan, and receipt printing.
