ALTER TABLE invoices ADD COLUMN deleted_at INTEGER;
ALTER TABLE invoices ADD COLUMN trash_order INTEGER;
CREATE INDEX invoice_trash_order ON invoices(business_id,trash_order) WHERE deleted_at IS NOT NULL;
CREATE INDEX invoice_trash_expiry ON invoices(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE purged_invoice_keys(
 business_id TEXT NOT NULL REFERENCES businesses(id),
 idempotency_key TEXT NOT NULL,
 PRIMARY KEY(business_id,idempotency_key)
);

CREATE TRIGGER purge_invoice_children BEFORE DELETE ON invoices WHEN OLD.deleted_at IS NOT NULL BEGIN
 INSERT OR IGNORE INTO purged_invoice_keys VALUES(OLD.business_id,OLD.idempotency_key);
 DELETE FROM invoice_reversals WHERE business_id=OLD.business_id AND invoice_id=OLD.id;
 DELETE FROM payments WHERE business_id=OLD.business_id AND invoice_id=OLD.id;
 DELETE FROM invoice_items WHERE business_id=OLD.business_id AND invoice_id=OLD.id;
END;

CREATE TRIGGER cap_invoice_trash AFTER UPDATE OF deleted_at ON invoices
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
 DELETE FROM invoices WHERE business_id=NEW.business_id AND deleted_at IS NOT NULL AND
 id IN (SELECT id FROM invoices WHERE business_id=NEW.business_id AND deleted_at IS NOT NULL ORDER BY trash_order DESC LIMIT -1 OFFSET 100);
END;

CREATE TRIGGER trashed_invoice_no_payment BEFORE INSERT ON payments
WHEN EXISTS(SELECT 1 FROM invoices WHERE business_id=NEW.business_id AND id=NEW.invoice_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Invoice locked'); END;

CREATE TRIGGER trashed_invoice_no_void BEFORE INSERT ON invoice_reversals
WHEN EXISTS(SELECT 1 FROM invoices WHERE business_id=NEW.business_id AND id=NEW.invoice_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Invoice locked'); END;

CREATE TRIGGER purged_invoice_no_replay BEFORE INSERT ON invoices
WHEN EXISTS(SELECT 1 FROM purged_invoice_keys WHERE business_id=NEW.business_id AND idempotency_key=NEW.idempotency_key)
BEGIN SELECT RAISE(ABORT,'Invoice locked'); END;
