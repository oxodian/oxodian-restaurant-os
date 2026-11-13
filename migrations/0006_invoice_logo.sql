ALTER TABLE businesses ADD COLUMN logo_data TEXT NOT NULL DEFAULT '' CHECK(length(logo_data)<=48000);
