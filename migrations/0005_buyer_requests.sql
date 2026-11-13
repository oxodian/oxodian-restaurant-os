ALTER TABLE customers ADD COLUMN request_key TEXT;
ALTER TABLE customers ADD COLUMN request_hash TEXT;
CREATE UNIQUE INDEX customers_request_key ON customers(business_id,request_key) WHERE request_key IS NOT NULL;
