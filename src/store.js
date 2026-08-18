/* Persistence — the event substrate, hash-chained.

   GraphRuntime folds over events; IOSRuntime accumulates traces. Both were
   in-memory arrays, which means the receipt regime ended at the process
   boundary. A journal makes the substrate durable and TAMPER-EVIDENT:

       digest_i = sha256( digest_{i-1} + canonical({type, body}) )

   Anyone holding the journal can re-verify the chain without trusting the
   process that wrote it — which is what a receipt is.

   Three implementations, one interface:
     MemoryJournal  tests, ephemeral rooms
     FileJournal    JSONL on disk; durable on append; replayable; verifiable
     D1Journal      write-behind for Cloudflare D1 — append() chains
                    synchronously, flush() awaits the INSERTs; the interpreter
                    awaits flush inside two-phase commit, so trace durability
                    still gates output release on async backends. */

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const sha256 = s => createHash("sha256").update(s).digest("hex");
function canonical(x) {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object")
    return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
  return JSON.stringify(x);
}

const GENESIS = "0".repeat(64);

export class MemoryJournal {
  constructor() { this.list = []; }
  head() { return this.list.length ? this.list[this.list.length - 1].digest : GENESIS; }
  append(type, body) {
    const entry = { seq: this.list.length, type, body, prev: this.head() };
    entry.digest = sha256(entry.prev + canonical({ type, body }));
    this.list.push(entry);
    this.persist(entry);
    return entry;
  }
  persist() {}                                    /* memory is already "durable" for its lifetime */
  entries(type = null) { return type ? this.list.filter(e => e.type === type) : [...this.list]; }
  async flush() {}
  /* Walk the chain. Any edit, insertion, deletion or reorder breaks it. */
  verify() {
    let prev = GENESIS;
    for (const e of this.list) {
      if (e.prev !== prev) return { ok: false, at: e.seq, reason: "chain break — prev digest mismatch" };
      const expect = sha256(prev + canonical({ type: e.type, body: e.body }));
      if (e.digest !== expect) return { ok: false, at: e.seq, reason: "body does not reproduce its digest" };
      prev = e.digest;
    }
    return { ok: true, length: this.list.length, head: prev };
  }

  /* ---- Merkle inclusion proofs — privacy-preserving audit ----
     The linear chain proves integrity, but verifying ONE entry requires the
     WHOLE chain. A Merkle root over the entry digests lets an auditor hold
     only a published root and verify a single disclosed entry against it —
     every other entry stays undisclosed. Odd nodes promote unpaired, so the
     root computation and the proof walk agree by construction. */
  static _merkleRoot(leaves) {
    if (!leaves.length) return GENESIS;
    let level = leaves;
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2)
        next.push(i + 1 < level.length ? sha256(level[i] + level[i + 1]) : level[i]);
      level = next;
    }
    return level[0];
  }
  merkleRoot() { return MemoryJournal._merkleRoot(this.list.map(e => e.digest)); }
  inclusionProof(seq) {
    const idx = this.list.findIndex(e => e.seq === seq);
    if (idx === -1) throw new Error(`no journal entry at seq ${seq}`);
    let level = this.list.map(e => e.digest);
    const leaf = level[idx];
    const proof = [];
    let i = idx;
    while (level.length > 1) {
      const sib = i % 2 === 0 ? i + 1 : i - 1;
      if (sib < level.length)
        proof.push({ position: i % 2 === 0 ? "right" : "left", digest: level[sib] });
      const next = [];
      for (let j = 0; j < level.length; j += 2)
        next.push(j + 1 < level.length ? sha256(level[j] + level[j + 1]) : level[j]);
      i = Math.floor(i / 2);
      level = next;
    }
    return { seq, leaf, proof, root: this.merkleRoot() };
  }
  /* The auditor's side: entry digest + proof + published root → ok.
     No journal access, no other entries, no trusted party. */
  static verifyInclusion({ leaf, proof, root, seq = null }) {
    let acc = leaf;
    for (const step of proof)
      acc = step.position === "left" ? sha256(step.digest + acc) : sha256(acc + step.digest);
    return acc === root
      ? { ok: true, seq, root }
      : { ok: false, seq, reason: "inclusion proof does not reproduce the Merkle root" };
  }
}

export class FileJournal extends MemoryJournal {
  constructor(path) {
    super();
    this.path = path;
    if (existsSync(path)) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        if (!line.trim()) continue;
        this.list.push(JSON.parse(line));
      }
      /* Tamper-evidence is load-bearing, not available-on-request: a doctored
         journal must refuse to LOAD, because GraphRuntime folds authority out
         of this list — a tampered grant would otherwise be live until someone
         happened to ask. */
      const v = this.verify();
      if (!v.ok)
        throw new Error(`journal ${path} fails verification at seq ${v.at} — ${v.reason}; refusing to load a tampered chain`);
    }
  }
  persist(entry) { appendFileSync(this.path, JSON.stringify(entry) + "\n"); }
}

/* Cloudflare D1 adapter. `exec(sql, params)` is the seam — in a Worker:

     exec: async (sql, params) => {
       const stmt = env.DB.prepare(sql).bind(...params);
       return sql.trimStart().toUpperCase().startsWith("SELECT")
         ? await stmt.all()          // -> { results: [...] }
         : await stmt.run();
     }

   Replay: `SELECT * FROM igl_journal ORDER BY seq` into `rows`.

   SCHEMA APPLICATION: the schema is three statements, and prepare().run()
   takes one. Apply with either

     for (const s of D1_SCHEMA_STATEMENTS) await env.DB.prepare(s).run();
     // or
     await env.DB.exec(D1_SCHEMA);   // exec() accepts multi-statement SQL

   Never split D1_SCHEMA on ";" — the trigger bodies contain semicolons.

   Append-only is ENFORCED, not assumed: the chain makes tampering detectable,
   but the triggers close the gap between "we would notice" and "it cannot
   happen through the API" — UPDATE and DELETE abort at the engine. */
export const D1_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS igl_journal (
  seq INTEGER PRIMARY KEY, type TEXT NOT NULL, body TEXT NOT NULL,
  prev TEXT NOT NULL, digest TEXT NOT NULL UNIQUE
)`,
  `CREATE TRIGGER IF NOT EXISTS igl_journal_no_update
  BEFORE UPDATE ON igl_journal
  BEGIN SELECT RAISE(ABORT, 'igl_journal is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS igl_journal_no_delete
  BEFORE DELETE ON igl_journal
  BEGIN SELECT RAISE(ABORT, 'igl_journal is append-only'); END`,
];
export const D1_SCHEMA = D1_SCHEMA_STATEMENTS.map(s => s + ";").join("\n");

export class D1Journal extends MemoryJournal {
  constructor({ exec, rows = [] }) {
    super();
    this.exec = exec;
    this.pending = [];
    for (const r of rows) this.list.push({ seq: r.seq, type: r.type, body: JSON.parse(r.body), prev: r.prev, digest: r.digest });
    if (this.list.length) {
      /* same rule as FileJournal: a replayed chain must verify before any
         authority is folded out of it */
      const v = this.verify();
      if (!v.ok)
        throw new Error(`replayed journal fails verification at seq ${v.at} — ${v.reason}; refusing to load a tampered chain`);
    }
  }
  persist(entry) { this.pending.push(entry); }

  /* One flush = head-CAS + one multi-row INSERT.

     CONCURRENCY, honestly stated: the SELECT and the INSERT are two calls, so
     the CAS alone is TOCTOU — two writers can both read the same head and
     both pass. The guard that actually holds is the schema: `seq INTEGER
     PRIMARY KEY` and `digest UNIQUE` make the loser's batched INSERT fail
     atomically (one statement: all rows or none). The CAS is the fast path
     that catches most races with a better message; the catch below rewrites
     the constraint failure into the same re-chain guidance, so the caller
     sees one error contract regardless of which guard fired. Both surface
     inside two-phase commit, so either way the loser's staged outputs are
     discarded, never half-committed. */
  async flush() {
    if (!this.pending.length) return;
    const first = this.pending[0];
    const head = await this.exec("SELECT digest FROM igl_journal ORDER BY seq DESC LIMIT 1", []);
    const durable = head?.results?.length ? head.results[0].digest : GENESIS;
    if (durable !== first.prev)
      throw new Error(`journal head moved — durable head ${durable.slice(0, 12)}… does not match pending prev ${first.prev.slice(0, 12)}…; a concurrent writer advanced the chain (losing writer must re-chain, not half-commit)`);
    const batch = this.pending;
    const values = batch.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const params = batch.flatMap(e => [e.seq, e.type, canonical(e.body), e.prev, e.digest]);
    try {
      await this.exec(`INSERT INTO igl_journal (seq, type, body, prev, digest) VALUES ${values}`, params);
    } catch (e) {
      if (/UNIQUE|PRIMARY KEY|constraint/i.test(String(e.message || e)))
        throw new Error(`journal head moved — lost the append race at the constraint (seq/digest collision); re-chain against the new head and retry. Underlying: ${e.message}`);
      throw e;
    }
    this.pending = [];                            /* dequeue only after the batch is durably down */
  }
}
