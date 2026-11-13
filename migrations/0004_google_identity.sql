CREATE TABLE identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(provider,subject),UNIQUE(provider,user_id));
CREATE TABLE oauth_states(state_hash TEXT PRIMARY KEY,verifier TEXT NOT NULL,nonce TEXT NOT NULL,link_user_id TEXT REFERENCES users(id),language TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX oauth_expiry ON oauth_states(expires_at);
