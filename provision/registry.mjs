/* Owner-scoped storage for provisioned graphs (F-02).

   Every graph belongs to an owner { tenant, principal }. Storage is keyed
   by a graph id derived from the owner and the resolved slug, never by the
   display name alone, so two callers whose descriptions resolve to the same
   label get two journals. Reads are filtered by owner unless the caller is
   the service principal. Nothing here touches the model, so it is testable
   in isolation. */

import fs from "node:fs";
import path from "node:path";
import { sha256 } from "../src/sign.js";

const SAFE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function assertOwner(owner) {
  if (!owner || typeof owner !== "object") throw Object.assign(new Error("an owner { tenant, principal } is required"), { status: 403 });
  if (!SAFE.test(String(owner.tenant)) || !SAFE.test(String(owner.principal)))
    throw Object.assign(new Error("owner ids must be safe identifiers"), { status: 400 });
  return owner;
}

export function graphIdFor(owner, slug) {
  assertOwner(owner);
  return "g_" + sha256(`igl-graph:${owner.tenant}:${owner.principal}:${slug}`).slice(0, 24);
}

export class Registry {
  constructor(root) { this.root = root; fs.mkdirSync(root, { recursive: true }); }
  dirFor(owner) { assertOwner(owner); const d = path.join(this.root, String(owner.tenant)); fs.mkdirSync(d, { recursive: true }); return d; }
  pathsFor(owner, slug) {
    const id = graphIdFor(owner, slug); const dir = this.dirFor(owner);
    return { id, journal: path.join(dir, `${id}.jsonl`), run: path.join(dir, `${id}.run.json`), program: path.join(dir, `${id}.igl`) };
  }
  canRead(auth, record) {
    if (auth?.admin) return true;
    return !!auth && record?.owner?.tenant === auth.tenant && record?.owner?.principal === auth.principal;
  }
  list(auth) {
    if (!auth) return [];
    const tenants = auth.admin ? fs.readdirSync(this.root).filter((t) => fs.statSync(path.join(this.root, t)).isDirectory()) : [String(auth.tenant)];
    const out = [];
    for (const t of tenants) {
      const dir = path.join(this.root, t); if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".run.json")) continue;
        try { const rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); if (this.canRead(auth, rec)) out.push(rec); } catch {}
      }
    }
    return out.sort((a, b) => String(b.provisionedAt).localeCompare(String(a.provisionedAt)));
  }
  get(auth, id) {
    if (!SAFE.test(String(id))) return null;
    return this.list(auth).find((g) => g.id === id) || null;
  }
  search(auth, q) {
    const needle = String(q ?? "").toLowerCase();
    return this.list(auth).filter((g) => `${g.slug} ${g.actor} ${g.kind}`.toLowerCase().includes(needle));
  }
}
