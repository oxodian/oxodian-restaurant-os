CREATE TABLE restaurant_tables (
 id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
 name TEXT NOT NULL, qr_token TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1,
 UNIQUE(business_id,id), UNIQUE(business_id,name)
);
CREATE TABLE restaurant_sessions (
 id TEXT PRIMARY KEY, business_id TEXT NOT NULL, table_id TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','billed','cleaning','closed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(business_id,table_id) REFERENCES restaurant_tables(business_id,id),
 UNIQUE(business_id,id)
);
CREATE UNIQUE INDEX restaurant_one_session ON restaurant_sessions(table_id) WHERE state<>'closed';
CREATE TABLE restaurant_menu (
 business_id TEXT NOT NULL, product_id TEXT NOT NULL, section TEXT NOT NULL, description TEXT NOT NULL,
 available INTEGER NOT NULL CHECK(available IN(0,1)), PRIMARY KEY(business_id,product_id),
 FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id)
);
CREATE TABLE restaurant_orders (
 id TEXT PRIMARY KEY, business_id TEXT NOT NULL, session_id TEXT NOT NULL,
 request_key TEXT NOT NULL, request_hash TEXT NOT NULL, lines TEXT NOT NULL,
 buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_address TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN('new','accepted','preparing','ready','served')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(business_id,session_id) REFERENCES restaurant_sessions(business_id,id),
 UNIQUE(session_id,request_key)
);
CREATE TABLE restaurant_requests (
 id TEXT PRIMARY KEY, business_id TEXT NOT NULL, session_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('waiter','bill')), acknowledged INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(business_id,session_id) REFERENCES restaurant_sessions(business_id,id)
);
CREATE UNIQUE INDEX restaurant_pending_request ON restaurant_requests(session_id,kind) WHERE acknowledged=0;
CREATE TABLE restaurant_bills (
 business_id TEXT NOT NULL,session_id TEXT NOT NULL,invoice_id TEXT NOT NULL,order_count INTEGER NOT NULL,
 PRIMARY KEY(business_id,session_id), UNIQUE(business_id,invoice_id),
 FOREIGN KEY(business_id,session_id) REFERENCES restaurant_sessions(business_id,id)
);
CREATE TRIGGER restaurant_order_open BEFORE INSERT ON restaurant_orders
WHEN NOT EXISTS(SELECT 1 FROM restaurant_sessions WHERE id=NEW.session_id AND state='open')
BEGIN SELECT RAISE(ABORT,'Restaurant session changed'); END;
CREATE TRIGGER restaurant_bill_open BEFORE INSERT ON restaurant_bills
WHEN NOT EXISTS(SELECT 1 FROM restaurant_sessions WHERE id=NEW.session_id AND state='open')
 OR EXISTS(SELECT 1 FROM restaurant_orders WHERE session_id=NEW.session_id AND status<>'served')
 OR NEW.order_count<>(SELECT COUNT(*) FROM restaurant_orders WHERE session_id=NEW.session_id)
BEGIN SELECT RAISE(ABORT,'Restaurant session changed'); END;
CREATE TRIGGER restaurant_order_menu_current BEFORE INSERT ON restaurant_orders
WHEN EXISTS(
 SELECT 1 FROM json_each(NEW.lines) line
 WHERE NOT EXISTS(
  SELECT 1 FROM restaurant_menu m JOIN products p ON p.business_id=m.business_id AND p.id=m.product_id
  JOIN businesses b ON b.id=m.business_id
  WHERE m.business_id=NEW.business_id AND m.product_id=json_extract(line.value,'$.id')
   AND m.available=1 AND p.price=json_extract(line.value,'$.price') AND p.currency=b.currency AND b.category='restaurant'
 )
)
BEGIN SELECT RAISE(ABORT,'Restaurant session changed'); END;

CREATE TRIGGER restaurant_bill_keep_until_closed BEFORE UPDATE OF deleted_at ON invoices
WHEN NEW.deleted_at IS NOT NULL AND EXISTS(
 SELECT 1 FROM restaurant_bills b JOIN restaurant_sessions s ON s.id=b.session_id
 WHERE b.business_id=NEW.business_id AND b.invoice_id=NEW.id AND s.state<>'closed'
)
BEGIN SELECT RAISE(ABORT,'Restaurant session changed'); END;
CREATE TABLE restaurant_profiles (
 business_id TEXT PRIMARY KEY REFERENCES businesses(id),
 whatsapp TEXT NOT NULL, fssai TEXT NOT NULL, opens TEXT NOT NULL, closes TEXT NOT NULL,
 description TEXT NOT NULL
);
