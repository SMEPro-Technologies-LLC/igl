-- D1 schema for the id-me.ai intake database (binding INTAKE, database igl-intake).
-- Apply: wrangler d1 execute igl-intake --remote --file=platform/site/schema/intake.sql
CREATE TABLE IF NOT EXISTS inquiries (
  id            TEXT PRIMARY KEY,
  reference     TEXT NOT NULL UNIQUE,
  received_at   TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  company       TEXT NOT NULL,
  website       TEXT,
  title         TEXT,
  company_size  TEXT,
  region        TEXT,
  industry      TEXT,
  interests     TEXT,            -- JSON array
  volume        TEXT,
  timeline      TEXT,
  message       TEXT NOT NULL,
  page          TEXT,
  ip            TEXT,
  country       TEXT,
  user_agent    TEXT,
  status        TEXT NOT NULL DEFAULT 'new',   -- new | contacted | qualified | closed
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS inquiries_received ON inquiries (received_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_status ON inquiries (status);

-- Sign-in attempts for the operator console (ops.id-me.ai). One row per
-- address; five failures inside fifteen minutes lock the address for fifteen
-- minutes. Kept here, in shared storage, so the lockout holds across every
-- Worker instance.
CREATE TABLE IF NOT EXISTS ops_sign_in_attempts (
  address       TEXT PRIMARY KEY,
  failures      INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0,   -- epoch milliseconds
  updated_at    INTEGER NOT NULL
);
