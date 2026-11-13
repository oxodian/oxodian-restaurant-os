CREATE TABLE restaurant_assignments (
 business_id TEXT NOT NULL, table_id TEXT NOT NULL, email TEXT NOT NULL,
 PRIMARY KEY(business_id,table_id),
 FOREIGN KEY(business_id,table_id) REFERENCES restaurant_tables(business_id,id),
 FOREIGN KEY(business_id,email) REFERENCES restaurant_staff(business_id,email) ON DELETE CASCADE
);
CREATE TABLE restaurant_push (
 endpoint TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
 user_id TEXT NOT NULL REFERENCES users(id), subscription TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX restaurant_push_business ON restaurant_push(business_id);
CREATE TABLE restaurant_wastage (
 id TEXT PRIMARY KEY, business_id TEXT NOT NULL, product_id TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0), cost INTEGER NOT NULL,
 currency TEXT NOT NULL, reason TEXT NOT NULL, occurred_on TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id)
);
ALTER TABLE restaurant_bills ADD COLUMN adjustments TEXT NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN ingredient_category TEXT NOT NULL DEFAULT '';
CREATE TRIGGER restaurant_wastage_stock AFTER INSERT ON restaurant_wastage BEGIN
 UPDATE products SET stock=stock-NEW.quantity,version=version+1
 WHERE business_id=NEW.business_id AND id=NEW.product_id AND kind='product' AND currency=NEW.currency;
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'Invalid stock product') END;
 INSERT INTO inventory_movements(business_id,product_id,quantity,reason,reference)
 VALUES(NEW.business_id,NEW.product_id,-NEW.quantity,'restaurant wastage',NEW.id);
END;
