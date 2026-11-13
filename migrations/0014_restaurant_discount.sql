ALTER TABLE restaurant_bills ADD COLUMN discount INTEGER NOT NULL DEFAULT 0 CHECK(discount>=0);
