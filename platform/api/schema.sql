-- IGL Governed Identity Platform API, D1 schema (SQLite).
-- Applied by: wrangler d1 execute <db> --remote --file=platform/api/schema.sql
-- Every table is tenant-scoped. JSON columns hold canonical JSON text.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  environment TEXT NOT NULL,                -- production | sandbox
  jurisdiction TEXT NOT NULL DEFAULT 'US',
  settings    TEXT NOT NULL DEFAULT '{}',   -- JSON: defaultConsentPurposes, transferPolicy, nodeBudget
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,             -- also the OAuth client_id
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  key_hash    TEXT NOT NULL UNIQUE,         -- sha256 of the secret
  prefix      TEXT NOT NULL,                -- first 12 characters, for display
  scopes      TEXT NOT NULL,                -- JSON array
  label       TEXT,
  identity_id TEXT,                         -- the identity this key acts as (whoami)
  jurisdiction TEXT,                        -- where the caller is, if declared
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS api_keys_tenant ON api_keys (tenant_id);

CREATE TABLE IF NOT EXISTS idempotency (
  tenant_id    TEXT NOT NULL,
  key          TEXT NOT NULL,
  method       TEXT NOT NULL,
  path         TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status       INTEGER NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS identities (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  type         TEXT NOT NULL,
  display_name TEXT NOT NULL,
  aliases      TEXT NOT NULL DEFAULT '[]',
  external_ids TEXT NOT NULL DEFAULT '{}',
  attributes   TEXT NOT NULL DEFAULT '{}',
  context      TEXT NOT NULL DEFAULT '[]',   -- appended IdentityContextAppend records
  status       TEXT NOT NULL DEFAULT 'active',
  confidence   REAL,
  sensitivity  TEXT NOT NULL DEFAULT 'internal',
  schema_type  TEXT,                          -- knowledge entities
  summary      TEXT,
  provenance   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS identities_tenant ON identities (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS identities_name ON identities (tenant_id, display_name);

CREATE TABLE IF NOT EXISTS relationships (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  from_id        TEXT NOT NULL,
  type           TEXT NOT NULL,
  to_id          TEXT NOT NULL,
  direction      TEXT NOT NULL DEFAULT 'directed',
  attributes     TEXT NOT NULL DEFAULT '{}',
  effective_from TEXT,
  effective_to   TEXT,
  confidence     REAL,
  status         TEXT NOT NULL DEFAULT 'proposed',
  provenance     TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS relationships_from ON relationships (tenant_id, from_id);
CREATE INDEX IF NOT EXISTS relationships_to ON relationships (tenant_id, to_id);

CREATE TABLE IF NOT EXISTS purposes (
  tenant_id           TEXT NOT NULL,
  id                  TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  permits             TEXT NOT NULL,       -- JSON array of node types
  sensitivity_ceiling TEXT NOT NULL DEFAULT 'internal',
  is_default          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS consents (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  identity_id   TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  granted_by    TEXT,                      -- ActorRef JSON
  scope         TEXT,
  jurisdictions TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'active',
  granted_at    TEXT NOT NULL,
  expires_at    TEXT
);
CREATE INDEX IF NOT EXISTS consents_identity ON consents (tenant_id, identity_id, purpose);

CREATE TABLE IF NOT EXISTS obligations (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  subject_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  obligee     TEXT,
  facility_id TEXT,
  regulation  TEXT,
  due_date    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'proposed',
  attested_by TEXT,
  attested_at TEXT,
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS obligations_subject ON obligations (tenant_id, subject_id, due_date);

CREATE TABLE IF NOT EXISTS facts (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  predicate  TEXT NOT NULL,
  object     TEXT NOT NULL,                -- JSON
  qualifiers TEXT NOT NULL DEFAULT '{}',
  status     TEXT NOT NULL DEFAULT 'seed',
  confidence REAL NOT NULL DEFAULT 0.5,
  valid_from TEXT,
  valid_to   TEXT,
  provenance TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS facts_subject ON facts (tenant_id, subject_id, predicate);

-- Subject controls (contract 0.3). Learning state per identity, and the
-- tombstones left by forget and reset: the act, the target and a hash of the
-- record as it was. The content itself is emptied in place in its own table.
CREATE TABLE IF NOT EXISTS learning_state (
  identity_id TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  paused      INTEGER NOT NULL DEFAULT 0,
  since       TEXT,
  reason      TEXT,
  changed_by  TEXT,                        -- ActorRef JSON
  decision_id TEXT
);
CREATE TABLE IF NOT EXISTS tombstones (
  id           TEXT PRIMARY KEY,           -- the forgotten record's id
  tenant_id    TEXT NOT NULL,
  identity_id  TEXT NOT NULL,
  kind         TEXT NOT NULL,              -- fact | relationship | context
  content_hash TEXT NOT NULL,              -- SHA-256 of the record as it was
  reason       TEXT,
  forgotten_at TEXT NOT NULL,
  decision_id  TEXT,
  receipt_id   TEXT
);
CREATE INDEX IF NOT EXISTS tombstones_identity ON tombstones (tenant_id, identity_id, forgotten_at);
CREATE TRIGGER IF NOT EXISTS tombstones_no_update BEFORE UPDATE ON tombstones
  BEGIN SELECT RAISE(ABORT, 'tombstones are append-only'); END;
CREATE TRIGGER IF NOT EXISTS tombstones_no_delete BEFORE DELETE ON tombstones
  BEGIN SELECT RAISE(ABORT, 'tombstones are append-only'); END;

CREATE TABLE IF NOT EXISTS policies (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  name           TEXT NOT NULL,
  version        TEXT NOT NULL,
  description    TEXT,
  effect         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft',
  scope          TEXT NOT NULL DEFAULT '{}',
  rule           TEXT NOT NULL DEFAULT '{}',
  effective_from TEXT,
  effective_to   TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS policies_tenant ON policies (tenant_id, status);

CREATE TABLE IF NOT EXISTS evidence (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  kind                TEXT NOT NULL,
  claim               TEXT NOT NULL,
  sources             TEXT NOT NULL DEFAULT '[]',
  confidence          REAL,
  status              TEXT NOT NULL DEFAULT 'seed',
  corroboration_count INTEGER NOT NULL DEFAULT 0,
  contradiction_count INTEGER NOT NULL DEFAULT 0,
  attributes          TEXT NOT NULL DEFAULT '{}',
  provenance          TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_tenant ON evidence (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outcomes (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  subject_id  TEXT NOT NULL,
  decision_id TEXT,
  type        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'observed',
  value       TEXT,                        -- JSON
  metrics     TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  provenance  TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  capabilities  TEXT NOT NULL DEFAULT '[]',
  allowed_tools TEXT NOT NULL DEFAULT '[]',
  policy_ids    TEXT NOT NULL DEFAULT '[]',
  model_routing TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  version    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft',
  steps      TEXT NOT NULL,
  policy_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL,
  input        TEXT,
  output       TEXT,
  error        TEXT,
  governance   TEXT,
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS runs_tenant ON runs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS decisions (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  body       TEXT NOT NULL,                -- AuthorityDecision JSON
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  body       TEXT NOT NULL,                -- GovernanceReceipt JSON, signature inside
  created_at TEXT NOT NULL
);

-- Per-tenant hash chain. eventHash = sha256(previousHash + canonical({type, body})).
CREATE TABLE IF NOT EXISTS audit_events (
  tenant_id     TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  id            TEXT NOT NULL UNIQUE,
  event_type    TEXT NOT NULL,
  actor         TEXT NOT NULL,
  resource      TEXT NOT NULL,
  action        TEXT,
  occurred_at   TEXT NOT NULL,
  request_id    TEXT,
  decision_id   TEXT,
  details       TEXT NOT NULL DEFAULT '{}',
  previous_hash TEXT NOT NULL,
  event_hash    TEXT NOT NULL UNIQUE,
  PRIMARY KEY (tenant_id, seq)
);
-- A policy is immutable once written: a decision cites it by id and by a hash
-- of its rule, and both must still describe the policy that fired. A change
-- is a new policy row with a new version; retirement is a new row too.
CREATE TRIGGER IF NOT EXISTS policies_no_update BEFORE UPDATE ON policies
  BEGIN SELECT RAISE(ABORT, 'policies are immutable; create a new version'); END;
CREATE TRIGGER IF NOT EXISTS policies_no_delete BEFORE DELETE ON policies
  BEGIN SELECT RAISE(ABORT, 'policies are immutable; create a new version'); END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events
  BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events
  BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;

CREATE TABLE IF NOT EXISTS interactions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  actor       TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  event_hash  TEXT
);

CREATE TABLE IF NOT EXISTS webhooks (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  url        TEXT NOT NULL,
  events     TEXT NOT NULL,                -- JSON array of event names
  secret     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  webhook_id  TEXT NOT NULL,
  event       TEXT NOT NULL,
  payload     TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_status INTEGER,
  delivered_at TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     TEXT PRIMARY KEY,
  tokens     REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
