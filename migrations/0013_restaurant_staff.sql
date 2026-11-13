ALTER TABLE oauth_states ADD COLUMN restaurant_invite TEXT;
CREATE TABLE restaurant_staff (
 business_id TEXT NOT NULL REFERENCES businesses(id),
 email TEXT NOT NULL,
 token TEXT NOT NULL UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('manager','staff')),
 cashier INTEGER NOT NULL CHECK(cashier IN(0,1)),
 reports INTEGER NOT NULL CHECK(reports IN(0,1)),
 user_id TEXT REFERENCES users(id),
 PRIMARY KEY(business_id,email), UNIQUE(business_id,user_id)
);
