ALTER TABLE businesses ADD COLUMN invoice_theme TEXT NOT NULL DEFAULT 'emerald'
 CHECK (invoice_theme IN ('emerald', 'midnight', 'classic'));
