-- Tables of the tortgraph store the portfolio adapter reads, as they exist in production (DDL copied from sqlite_master), with two rows of fixture data.
CREATE TABLE IF NOT EXISTS tenants ( id TEXT PRIMARY KEY, name TEXT NOT NULL, api_key TEXT NOT NULL UNIQUE, template_id TEXT NOT NULL DEFAULT 'smith-format', created_at TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','customer')), tenant_id TEXT,
  password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  must_change_password INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, created_by TEXT, last_login_at TEXT );
CREATE TABLE IF NOT EXISTS sessions ( id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), tenant_id TEXT, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL, ended_at TEXT, end_reason TEXT, ip TEXT, user_agent TEXT );
CREATE TABLE IF NOT EXISTS activity_log ( id TEXT PRIMARY KEY, account_id TEXT NOT NULL, tenant_id TEXT, session_id TEXT, at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}' );
CREATE TABLE IF NOT EXISTS customer_profiles ( tenant_id TEXT PRIMARY KEY, firm_name TEXT NOT NULL, contact_name TEXT, contact_email TEXT, phone TEXT, address TEXT, billing_email TEXT, plan TEXT NOT NULL DEFAULT 'pilot', cdip_price_cents INTEGER NOT NULL DEFAULT 25000, archive_subscription INTEGER NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS invoices ( id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, number TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')), issued_at TEXT NOT NULL, due_at TEXT, currency TEXT NOT NULL DEFAULT 'USD', subtotal_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL DEFAULT 0, notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT );
CREATE TABLE IF NOT EXISTS model_usage ( id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, at TEXT NOT NULL, purpose TEXT NOT NULL, model TEXT NOT NULL, tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, est_cost_usd REAL NOT NULL DEFAULT 0, actor TEXT, ref TEXT );
INSERT OR IGNORE INTO tenants VALUES ('t1','Fixture Law Group','k1','smith-format','2026-09-01T00:00:00Z');
INSERT OR IGNORE INTO accounts VALUES ('a1','reviewer@fixture.law','Fixture Reviewer','customer','t1','s','h','active',0,'2026-09-01T00:00:00Z',NULL,'2026-10-15T12:00:00Z');
INSERT OR IGNORE INTO sessions VALUES ('s1','a1','t1','2026-10-15T12:00:00Z','2026-10-15T12:40:00Z','2099-01-01T00:00:00Z',NULL,NULL,'203.0.113.5','fixture-agent');
INSERT OR IGNORE INTO sessions VALUES ('s0','a1','t1','2026-10-14T09:00:00Z','2026-10-14T09:30:00Z','2026-10-14T21:00:00Z','2026-10-14T09:31:00Z','signed_out','203.0.113.5','fixture-agent');
INSERT OR IGNORE INTO activity_log VALUES ('l1','a1','t1','s1','2026-10-15T12:05:00Z','matter.open','{"matter":"m1"}');
INSERT OR IGNORE INTO customer_profiles VALUES ('t1','Fixture Law Group','Fixture Reviewer','reviewer@fixture.law',NULL,NULL,NULL,'pilot',25000,0,NULL,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
INSERT OR IGNORE INTO model_usage VALUES ('u1','t1','2026-10-15T12:10:00Z','extract','claude','1200','300',0.0123,'a1',NULL);
