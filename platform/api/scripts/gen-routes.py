#!/usr/bin/env python3
"""Generate src/routes.generated.js from spec/openapi.yaml.

Every route the service exposes comes from the contract: method, path
pattern, operationId, required scopes, whether X-IGL-API-Key is accepted,
whether the operation takes an Idempotency-Key. The handler table in
src/handlers.js is keyed by operationId; a contract operation with no
handler fails the test suite, and a handler with no contract operation is
unreachable. That is how the service and the contract stay the same thing.
"""
import re, sys, json
import yaml

spec = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
routes = []
for path, item in spec["paths"].items():
    for method in ("get", "post", "put", "patch", "delete"):
        op = item.get(method)
        if not op: continue
        sec = op.get("security", spec.get("security", []))
        scopes, api_key = [], False
        for s in sec:
            for name, sc in s.items():
                if name == "apiKey": api_key = True
                else: scopes += sc
        params = item.get("parameters", []) + op.get("parameters", [])
        idem = any(p.get("$ref", "").endswith("IdempotencyKey") for p in params)
        public = len(sec) == 0
        pattern = "^" + re.sub(r"\{(\w+)\}", r"(?<\1>[^/]+)", path) + "$"
        routes.append({"method": method.upper(), "path": path, "pattern": pattern, "operationId": op["operationId"], "scopes": sorted(set(scopes)), "apiKey": api_key, "idempotent": idem, "public": public, "tag": (op.get("tags") or ["Other"])[0]})
with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write("/* GENERATED from spec/openapi.yaml by platform/api/scripts/gen-routes.py. Do not edit. */\n")
    f.write(f"export const CONTRACT_VERSION = {json.dumps(spec['info']['version'])};\n")
    f.write("export const ROUTES = [\n")
    for r in routes:
        f.write(f"  {{ method: {json.dumps(r['method'])}, path: {json.dumps(r['path'])}, pattern: new RegExp({json.dumps(r['pattern'])}), operationId: {json.dumps(r['operationId'])}, scopes: {json.dumps(r['scopes'])}, apiKey: {json.dumps(r['apiKey'])}, idempotent: {json.dumps(r['idempotent'])}, public: {json.dumps(r['public'])}, tag: {json.dumps(r['tag'])} }},\n")
    f.write("];\n")
print(f"{len(routes)} routes")
