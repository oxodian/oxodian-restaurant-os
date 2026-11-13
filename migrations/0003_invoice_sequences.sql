CREATE TABLE invoice_counters(business_id TEXT NOT NULL REFERENCES businesses(id),financial_year INTEGER NOT NULL,sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 999999999),PRIMARY KEY(business_id,financial_year));
ALTER TABLE invoices ADD COLUMN request_hash TEXT NOT NULL DEFAULT '';
