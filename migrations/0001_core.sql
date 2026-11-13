PRAGMA foreign_keys=ON;
CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE businesses(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'retail',address TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',currency TEXT NOT NULL DEFAULT 'INR',language TEXT NOT NULL DEFAULT 'en' CHECK(language IN('en','hi','bn')),gstin TEXT NOT NULL DEFAULT '',state_code TEXT NOT NULL DEFAULT '19',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE members(user_id TEXT NOT NULL REFERENCES users(id),business_id TEXT NOT NULL REFERENCES businesses(id),role TEXT NOT NULL CHECK(role IN('owner','manager','cashier')),PRIMARY KEY(user_id,business_id));
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),business_id TEXT NOT NULL REFERENCES businesses(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE products(id TEXT NOT NULL,business_id TEXT NOT NULL REFERENCES businesses(id),name TEXT NOT NULL,sku TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL CHECK(kind IN('product','service')),unit TEXT NOT NULL DEFAULT 'pcs',price INTEGER NOT NULL CHECK(price>=0),cost INTEGER NOT NULL CHECK(cost>=0),stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),low_stock INTEGER NOT NULL DEFAULT 5000 CHECK(low_stock>=0),tax_bps INTEGER NOT NULL DEFAULT 0 CHECK(tax_bps BETWEEN 0 AND 4000),hsn TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(business_id,id));
CREATE INDEX products_name ON products(business_id,name);
CREATE TABLE customers(id TEXT NOT NULL,business_id TEXT NOT NULL REFERENCES businesses(id),name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',gstin TEXT NOT NULL DEFAULT '',state_code TEXT NOT NULL DEFAULT '19',notes TEXT NOT NULL DEFAULT '',PRIMARY KEY(business_id,id));
CREATE INDEX customers_name ON customers(business_id,name);
CREATE TABLE suppliers(id TEXT NOT NULL,business_id TEXT NOT NULL REFERENCES businesses(id),name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',PRIMARY KEY(business_id,id));
CREATE TABLE invoices(id TEXT NOT NULL,business_id TEXT NOT NULL REFERENCES businesses(id),number TEXT NOT NULL,customer_id TEXT,business_snapshot TEXT NOT NULL,customer_snapshot TEXT NOT NULL,subtotal INTEGER NOT NULL CHECK(subtotal>=0),cgst INTEGER NOT NULL CHECK(cgst>=0),sgst INTEGER NOT NULL CHECK(sgst>=0),igst INTEGER NOT NULL CHECK(igst>=0),total INTEGER NOT NULL CHECK(total=subtotal+cgst+sgst+igst),paid INTEGER NOT NULL DEFAULT 0 CHECK(paid>=0 AND paid<=total),cogs INTEGER NOT NULL DEFAULT 0,due_date TEXT,place_of_supply TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','final','void')),idempotency_key TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(business_id,id),UNIQUE(business_id,number),UNIQUE(business_id,idempotency_key),FOREIGN KEY(business_id,customer_id) REFERENCES customers(business_id,id));
CREATE INDEX invoices_date ON invoices(business_id,created_at);
CREATE INDEX invoices_customer ON invoices(business_id,customer_id,created_at);
CREATE TABLE invoice_items(id TEXT PRIMARY KEY,business_id TEXT NOT NULL,invoice_id TEXT NOT NULL,product_id TEXT NOT NULL,name TEXT NOT NULL,unit TEXT NOT NULL,hsn TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),price INTEGER NOT NULL,cost INTEGER NOT NULL,version INTEGER NOT NULL,tax_bps INTEGER NOT NULL,net INTEGER NOT NULL,tax INTEGER NOT NULL,FOREIGN KEY(business_id,invoice_id) REFERENCES invoices(business_id,id),FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id));
CREATE INDEX invoice_items_invoice ON invoice_items(business_id,invoice_id);
CREATE TABLE payments(id TEXT PRIMARY KEY,business_id TEXT NOT NULL,invoice_id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL CHECK(method IN('cash','upi','card','bank')),idempotency_key TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(business_id,idempotency_key),FOREIGN KEY(business_id,invoice_id) REFERENCES invoices(business_id,id));
CREATE INDEX payments_invoice ON payments(business_id,invoice_id);
CREATE TABLE purchases(id TEXT NOT NULL,business_id TEXT NOT NULL REFERENCES businesses(id),supplier_id TEXT,reference TEXT NOT NULL DEFAULT '',total INTEGER NOT NULL CHECK(total>=0),idempotency_key TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(business_id,id),UNIQUE(business_id,idempotency_key),FOREIGN KEY(business_id,supplier_id) REFERENCES suppliers(business_id,id));
CREATE INDEX purchases_date ON purchases(business_id,created_at);
CREATE TABLE purchase_items(id TEXT PRIMARY KEY,business_id TEXT NOT NULL,purchase_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),cost INTEGER NOT NULL CHECK(cost>=0),FOREIGN KEY(business_id,purchase_id) REFERENCES purchases(business_id,id),FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id));
CREATE TABLE inventory_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,business_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity INTEGER NOT NULL,reason TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id));
CREATE INDEX movements_product ON inventory_movements(business_id,product_id,created_at);
CREATE TABLE expenses(id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),category TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',amount INTEGER NOT NULL CHECK(amount>0),date TEXT NOT NULL,idempotency_key TEXT NOT NULL,UNIQUE(business_id,idempotency_key));
CREATE INDEX expenses_date ON expenses(business_id,date);
CREATE TABLE audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,business_id TEXT NOT NULL REFERENCES businesses(id),user_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX audit_business ON audit_logs(business_id,created_at);
CREATE TRIGGER sale_line BEFORE INSERT ON invoice_items BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices WHERE business_id=NEW.business_id AND id=NEW.invoice_id AND status='draft') THEN RAISE(ABORT,'Invoice locked') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM products WHERE business_id=NEW.business_id AND id=NEW.product_id AND version=NEW.version AND price=NEW.price AND cost=NEW.cost) THEN RAISE(ABORT,'Product changed; retry') END;
 UPDATE products SET stock=CASE WHEN kind='product' THEN stock-NEW.quantity ELSE stock END,version=version+1 WHERE business_id=NEW.business_id AND id=NEW.product_id;
 INSERT INTO inventory_movements(business_id,product_id,quantity,reason,reference) SELECT NEW.business_id,NEW.product_id,-NEW.quantity,'sale',NEW.invoice_id FROM products WHERE business_id=NEW.business_id AND id=NEW.product_id AND kind='product';
END;
CREATE TRIGGER finalize_invoice BEFORE UPDATE OF status ON invoices WHEN NEW.status='final' BEGIN
 SELECT CASE WHEN OLD.status<>'draft' OR NOT EXISTS(SELECT 1 FROM invoice_items WHERE business_id=NEW.business_id AND invoice_id=NEW.id) OR NEW.subtotal<>(SELECT SUM(net) FROM invoice_items WHERE business_id=NEW.business_id AND invoice_id=NEW.id) OR NEW.cgst+NEW.sgst+NEW.igst<>(SELECT SUM(tax) FROM invoice_items WHERE business_id=NEW.business_id AND invoice_id=NEW.id) THEN RAISE(ABORT,'Invalid invoice totals') END;
END;
CREATE TRIGGER payment_guard BEFORE INSERT ON payments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices WHERE business_id=NEW.business_id AND id=NEW.invoice_id AND status='final' AND paid+NEW.amount<=total) THEN RAISE(ABORT,'Payment exceeds balance or invoice unavailable') END;
 UPDATE invoices SET paid=paid+NEW.amount WHERE business_id=NEW.business_id AND id=NEW.invoice_id;
END;
CREATE TRIGGER purchase_stock AFTER INSERT ON purchase_items BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM products WHERE business_id=NEW.business_id AND id=NEW.product_id AND kind='product') THEN RAISE(ABORT,'Invalid stock product') END;
 UPDATE products SET cost=CASE WHEN stock+NEW.quantity>0 THEN CAST(ROUND((cost*stock+NEW.cost*NEW.quantity)*1.0/(stock+NEW.quantity)) AS INTEGER) ELSE NEW.cost END,stock=stock+NEW.quantity,version=version+1 WHERE business_id=NEW.business_id AND id=NEW.product_id;
 INSERT INTO inventory_movements(business_id,product_id,quantity,reason,reference) VALUES(NEW.business_id,NEW.product_id,NEW.quantity,'purchase',NEW.purchase_id);
END;
