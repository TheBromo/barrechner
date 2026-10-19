-- Barrechner schema for Cloudflare D1 (SQLite). Timestamps are Unix epoch milliseconds.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  email_verified_at INTEGER,
  verification_required_by INTEGER
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('password', 'email_link')),
  authenticated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX email_tokens_expiry_idx ON email_tokens(expires_at);

CREATE TABLE bars (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (slug GLOB '[a-z0-9]*' AND length(slug) BETWEEN 3 AND 32),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at INTEGER,
  current_revision_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX bars_owner_status_idx ON bars(owner_id, status);

CREATE TABLE bar_drafts (
  bar_id TEXT PRIMARY KEY REFERENCES bars(id) ON DELETE CASCADE,
  config TEXT NOT NULL CHECK (json_valid(config)),
  updated_at INTEGER NOT NULL
);

CREATE TABLE bar_revisions (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  config TEXT NOT NULL CHECK (json_valid(config)),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (bar_id, version)
);

CREATE TABLE slug_redirects (
  old_slug TEXT PRIMARY KEY COLLATE NOCASE,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX slug_redirects_expiry_idx ON slug_redirects(expires_at);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('logo', 'category')),
  created_at INTEGER NOT NULL
);
CREATE INDEX assets_bar_idx ON assets(bar_id);
CREATE INDEX assets_created_idx ON assets(created_at);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);
