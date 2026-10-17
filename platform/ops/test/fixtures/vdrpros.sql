-- Tables of the vdrpros store the portfolio adapter reads (DDL as in production), with fixture rows.
CREATE TABLE IF NOT EXISTS customers ( id TEXT PRIMARY KEY, acct_id TEXT, company TEXT, contact TEXT, email TEXT, plan TEXT DEFAULT 'Essentials', mrr REAL DEFAULT 0, workspace TEXT, status TEXT DEFAULT 'trial', trial_ends TEXT, since TEXT, notes TEXT, last_seen TEXT );
CREATE TABLE IF NOT EXISTS events ( id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, type TEXT NOT NULL, acct_id TEXT, email TEXT, detail TEXT );
CREATE TABLE IF NOT EXISTS signups ( id TEXT PRIMARY KEY, ts TEXT NOT NULL, name TEXT, email TEXT, company TEXT, matter TEXT, industry TEXT, workspace TEXT, status TEXT DEFAULT 'pending', acct_id TEXT );
CREATE TABLE IF NOT EXISTS invoices ( id TEXT PRIMARY KEY, number TEXT, customer_id TEXT, issued TEXT, due TEXT, po TEXT, status TEXT DEFAULT 'draft', items TEXT, payments TEXT );
INSERT OR IGNORE INTO customers VALUES ('v1','ACCT1','Fixture Capital','Dana Fixture','dana@fixture.example','Essentials',299,'ws1','active',NULL,'2026-09-10T00:00:00Z',NULL,'2026-10-15T08:00:00Z');
DELETE FROM events;
INSERT INTO events (ts,type,acct_id,email,detail) VALUES ('2026-10-15T08:00:00Z','login','ACCT1','dana@fixture.example','{}');
INSERT OR IGNORE INTO signups VALUES ('sg1','2026-09-10T00:00:00Z','Dana Fixture','dana@fixture.example','Fixture Capital',NULL,'finance','ws1','approved','ACCT1');
