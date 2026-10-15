#!/usr/bin/env python3
"""Generate the REST reference sections of id-me.ai from spec/openapi.yaml.

Usage: gen_reference.py <openapi.yaml> <implemented.json> <site.html>

Replaces the <section id="d-rest"> ... <section id="d-schemas"> block in the
site with sections generated from the contract. Every operation carries a
status taken from implemented.json ({"live": ["GET /health", ...]}), so the
page can never claim more than the deployed service does.
"""
import html, json, re, sys
import yaml

spec_path, impl_path, site_path = sys.argv[1:4]
spec = yaml.safe_load(open(spec_path, encoding="utf-8"))
impl = json.load(open(impl_path, encoding="utf-8"))
LIVE = set(impl.get("live", []))
SANDBOX = set(impl.get("sandbox", []))
DEPLOYED = bool(impl.get("deployed"))

E = html.escape
MONO = 'style="font-family:var(--mono); font-size:0.8rem"'

def status_tag(key):
    if key in LIVE: return '<span class="tag ok">Live</span>'
    if key in SANDBOX: return '<span class="tag acc">Sandbox</span>'
    return '<span class="tag">Specified</span>'

def ref_name(schema):
    if not schema: return "none"
    if "$ref" in schema: return schema["$ref"].split("/")[-1]
    if schema.get("type") == "array": return ref_name(schema.get("items", {})) + "[]"
    return schema.get("type", "object")

def scope_of(op):
    sec = op.get("security", spec.get("security", []))
    parts = []
    for s in sec:
        for name, scopes in s.items():
            if name == "apiKey": parts.append("API key")
            elif scopes: parts.append(", ".join(scopes))
    if not sec: return "public"
    return " or ".join(dict.fromkeys(parts)) or "token"

# ---- group operations by tag
tags = [t["name"] for t in spec.get("tags", [])]
tagdesc = {t["name"]: t.get("description", "") for t in spec.get("tags", [])}
groups = {t: [] for t in tags}
n_ops = 0
for path, item in spec["paths"].items():
    for method in ("get", "post", "put", "patch", "delete"):
        op = item.get(method)
        if not op: continue
        n_ops += 1
        key = f"{method.upper()} {path}"
        req = ref_name(op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema"))
        resps = []
        for code, r in op.get("responses", {}).items():
            if str(code).startswith("2"):
                sch = r.get("content", {}).get("application/json", {}).get("schema") if isinstance(r, dict) else None
                resps.append(f"{code} {ref_name(sch)}" if sch else str(code))
        row = (f'<tr><td><span class="m {method}">{method.upper()}</span> {E(path)}</td>'
               f'<td>{E(op.get("summary",""))}</td><td {MONO}>{E(scope_of(op))}</td>'
               f'<td {MONO}>{E(req)}</td><td {MONO}>{E("; ".join(resps))}</td><td>{status_tag(key)}</td></tr>')
        t = (op.get("tags") or ["Other"])[0]
        groups.setdefault(t, []).append(row)

n_paths = len(spec["paths"]); n_schemas = len(spec["components"]["schemas"]); n_hooks = len(spec.get("webhooks", {}))
n_live = len(LIVE); n_sandbox = len(SANDBOX)

# ---- d-rest
servers = spec.get("servers", [])
srv_rows = []
for s in servers:
    state = "Deployed" if DEPLOYED else "Reserved, not deployed"
    srv_rows.append(f'<tr><td>{E(s.get("description","").split(".")[0] or "Server")}</td><td {MONO.replace("0.8rem","0.84rem")}>{E(s["url"])}</td><td>{E(state)}</td></tr>')
status_para = (
    f'<div class="panel" style="margin:14px 0 18px"><h3 style="margin-bottom:6px">Implementation status</h3>'
    f'<p>{"The hosted service is deployed." if DEPLOYED else "The hosts below are reserved and nothing is deployed behind them yet."} '
    f'Of {n_ops} operations, <b>{n_live}</b> are live in production and <b>{n_sandbox}</b> are available in the sandbox. '
    f'The rest are specified in the contract and are being implemented in the public repository under <code class="i">platform/api</code>. '
    f'The status in each table row is generated from the same file the service deploys from, so this page cannot say more than the service does. '
    f'What runs today without any hosted service is the open-source runtime and its provisioning service, described under <a href="#docs" data-sec="d-oss" style="text-decoration:underline">Open-source runtime</a>.</p></div>')
d_rest = f'''<section id="d-rest">
  <h3>API reference <span class="tag acc" style="vertical-align:middle; margin-left:6px">OpenAPI 3.1, v{E(spec["info"]["version"])}</span></h3>
  {status_para}
  <p><b>What changed in v0.2.</b> The MCP governance model is now in the REST contract. A new <b>Projection</b> service adds purpose profiles (<code class="i">GET /purposes</code>), caller resolution (<code class="i">GET /identities/me</code>), purpose-bounded projections with node budgets and a per-node gate explanation, obligations carrying <code class="i">attested</code> or <code class="i">proposed</code> status, read-only consent records, and interaction records (<code class="i">POST /audit/interactions</code>). Every intelligence request accepts a purpose. The 34 v0.1 paths are unchanged.</p>
  <p>{E(spec["info"].get("description","").strip())}</p>
  <p>The contract covers <b>{n_paths} paths</b>, <b>{n_ops} operations</b>, <b>{n_schemas} reusable schemas</b> and <b>{n_hooks} webhooks</b>. The source of truth is the specification file in the repository, <a href="https://github.com/SMEPro-Technologies-LLC/igl/blob/main/spec/openapi.yaml" target="_blank" rel="noopener" style="text-decoration:underline">spec/openapi.yaml</a>, also served here as <a href="igl-openapi-v0.2.yaml.txt" target="_blank" rel="noopener" style="text-decoration:underline">igl-openapi-v0.2.yaml</a> (<a href="igl-openapi-v0.1.yaml.txt" target="_blank" rel="noopener" style="text-decoration:underline">v0.1</a> kept for comparison).</p>
  <div class="tbl"><table><thead><tr><th>Server</th><th>URL</th><th>Status</th></tr></thead><tbody>
{chr(10).join(srv_rows)}
</tbody></table></div></section>
'''

# ---- d-ops
ops_sections = []
for t in list(groups.keys()):
    rows = groups[t]
    if not rows: continue
    ops_sections.append(
        f'<h4 class="svch">{E(t)} <span>{E(tagdesc.get(t,""))}</span></h4><div class="tbl"><table class="ops"><thead><tr><th>Operation</th><th>Summary</th><th>Scope</th><th>Request</th><th>Response</th><th>Status</th></tr></thead><tbody>'
        + "".join(rows) + '</tbody></table></div>')
d_ops = ('<section id="d-ops"><h3>Operations by service</h3><p>Each row is one operation. The scope column is what the token must carry; <b>public</b> needs no credential. '
         'The status column says whether the operation is served today: <span class="tag ok">Live</span> in production, <span class="tag acc">Sandbox</span> only, or <span class="tag">Specified</span> and not yet served.</p>\n'
         + "\n".join(ops_sections) + "\n</section>\n")

# ---- d-hooks
hook_rows = []
for name, h in spec.get("webhooks", {}).items():
    op = h.get("post", {})
    sch = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {})
    payload = ref_name(sch) if "$ref" in sch or sch.get("type") == "array" else "{ " + ", ".join(sch.get("properties", {}).keys()) + " }"
    hook_rows.append(f'<tr><td>{E(name)}</td><td>{E(op.get("summary",""))}</td><td {MONO}>{E(payload)}</td></tr>')
d_hooks = ('<section id="d-hooks"><h3>Webhooks</h3><p>IGL calls your endpoint; reply 200 or 202. Payloads reuse the public schemas. Webhooks are delivered once the hosted service is deployed.</p><div class="tbl"><table><thead><tr><th>Event</th><th>When</th><th>Payload</th></tr></thead><tbody>\n'
           + "\n".join(hook_rows) + '\n</tbody></table></div></section>\n')

# ---- d-examples (every request example in the spec)
ex_blocks = []
for path, item in spec["paths"].items():
    for method in ("get", "post", "put", "patch", "delete"):
        op = item.get(method)
        if not op: continue
        content = op.get("requestBody", {}).get("content", {}).get("application/json", {})
        examples = dict(content.get("examples", {}))
        if "example" in content: examples["request"] = {"summary": op.get("summary", ""), "value": content["example"]}
        for ename, ex in examples.items():
            ex_blocks.append(f'<p><b>{method.upper()} {E(path)}</b>: {E(ex.get("summary") or ename)}</p><pre class="block">{E(json.dumps(ex.get("value"), indent=2))}</pre>')
        for code, r in op.get("responses", {}).items():
            rc = r.get("content", {}).get("application/json", {}) if isinstance(r, dict) else {}
            if "example" in rc and str(code).startswith("2"):
                ex_blocks.append(f'<p><b>{method.upper()} {E(path)}</b>: response {E(str(code))}</p><pre class="block">{E(json.dumps(rc["example"], indent=2))}</pre>')
d_examples = '<section id="d-examples"><h3>Examples from the specification</h3>\n' + "\n".join(ex_blocks) + '\n</section>\n'

# ---- d-schemas
def type_str(p):
    if "$ref" in p: return p["$ref"].split("/")[-1]
    if "oneOf" in p or "anyOf" in p:
        return "|".join(type_str(x) for x in (p.get("oneOf") or p.get("anyOf")))
    t = p.get("type")
    if isinstance(t, list): return "|".join(t)
    if t == "array": return type_str(p.get("items", {})) + "[]"
    if "enum" in p: return "enum(" + ", ".join(map(str, p["enum"])) + ")"
    return t or "object"
sch_blocks = []
for name, s in spec["components"]["schemas"].items():
    props = s.get("properties", {}); req = set(s.get("required", []))
    items = "".join(f'<li><b>{E(k)}{"*" if k in req else ""}</b> <span class="ty">{E(type_str(v))}</span>{(" <span class=muted>" + E(v["description"]) + "</span>") if isinstance(v, dict) and v.get("description") and len(v["description"]) < 120 else ""}</li>' for k, v in props.items())
    meta = f'{len(props)} fields' + (f', {len(req)} required' if req else "")
    if not props and "enum" in s: items = "".join(f'<li><span class="ty">{E(str(e))}</span></li>' for e in s["enum"]); meta = f'{len(s["enum"])} values'
    sch_blocks.append(f'<details class="sch"><summary><span>{E(name)}</span><span class="muted">{meta}</span></summary><ul>{items}</ul></details>')
d_schemas = (f'<section id="d-schemas"><h3>Schemas ({n_schemas})</h3><p>Required fields are marked with an asterisk; enumerations are listed inline. The status values seed, proposed and certified are the governance ladder: nothing is certified without a human or a rule the organization controls.</p><div class="schemas">\n'
             + "\n".join(sch_blocks) + '\n</div></section>\n')

# ---- splice into the site
site = open(site_path, encoding="utf-8").read()
def replace_section(site, sid, new):
    start = site.index(f'<section id="{sid}">')
    end = site.index("</section>", start) + len("</section>")
    # consume the trailing newline so sections stay one per line
    if site[end:end+1] == "\n": end += 1
    return site[:start] + new + site[end:]
for sid, new in (("d-rest", d_rest), ("d-ops", d_ops), ("d-hooks", d_hooks), ("d-examples", d_examples), ("d-schemas", d_schemas)):
    site = replace_section(site, sid, new)
open(site_path, "w", encoding="utf-8", newline="\n").write(site)
print(f"paths={n_paths} ops={n_ops} schemas={n_schemas} hooks={n_hooks} live={n_live} sandbox={n_sandbox} examples={len(ex_blocks)}")
