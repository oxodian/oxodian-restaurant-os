ALTER TABLE businesses ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE purchases ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE expenses ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
UPDATE products SET currency=(SELECT currency FROM businesses WHERE id=products.business_id);
UPDATE invoices SET currency=COALESCE(json_extract(business_snapshot,'$.currency'),(SELECT currency FROM businesses WHERE id=invoices.business_id));
UPDATE purchases SET currency=(SELECT currency FROM businesses WHERE id=purchases.business_id);
UPDATE expenses SET currency=(SELECT currency FROM businesses WHERE id=expenses.business_id);
CREATE INDEX invoices_business_currency_date ON invoices(business_id,currency,status,created_at);
CREATE INDEX expenses_business_currency_date ON expenses(business_id,currency,date);
CREATE TRIGGER invoice_currency_locked BEFORE UPDATE OF currency ON invoices
WHEN OLD.status<>'draft' BEGIN SELECT RAISE(ABORT,'Invoice locked'); END;
CREATE TRIGGER invoice_item_currency BEFORE INSERT ON invoice_items BEGIN
 SELECT CASE WHEN (SELECT currency FROM invoices WHERE id=NEW.invoice_id AND business_id=NEW.business_id)<>(SELECT currency FROM products WHERE id=NEW.product_id AND business_id=NEW.business_id) THEN RAISE(ABORT,'Product changed') END;
END;
CREATE TRIGGER purchase_item_currency BEFORE INSERT ON purchase_items BEGIN
 SELECT CASE WHEN (SELECT currency FROM purchases WHERE id=NEW.purchase_id AND business_id=NEW.business_id)<>(SELECT currency FROM products WHERE id=NEW.product_id AND business_id=NEW.business_id) THEN RAISE(ABORT,'Product changed') END;
END;
