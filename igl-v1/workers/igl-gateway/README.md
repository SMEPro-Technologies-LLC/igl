# igl-gateway: the governed-decode service

An OpenAI-compatible surface. Any client that speaks the chat-completions shape
points its base URL here and gets governed output plus a signed governance
receipt, with nothing else in its code changing.

## Endpoint

`POST /v1/chat/completions` with the standard body plus an `igl` block:

    {
      "model": "reference",
      "messages": [{ "role": "user", "content": "Prepare the production report summary." }],
      "igl": { "jurisdiction": "US-TX", "agency": "RRC" }
    }

The response is the standard chat.completion shape with an added `igl` object:
outcome, refused flag, the live constraint digest, the signed receipt, and the
public key. A HARD violation returns a refusal with `finish_reason:
"content_filter"` and the sealed receipt of the refusal; the violating draft is
never returned. `POST /v1/verify` checks a receipt. `GET /health` names the
surface.

## Seams, stated plainly

The model connector is a labelled seam. The shipped reference connector needs no
upstream, which keeps the gateway testable and honest; a real deployment registers
a connector per model name (closed chat APIs, logprob APIs, or in-decoder open
models via the SDK). The text-to-path projection is the reference keyword
classifier; the Semantic Crosswalk service replaces it per model. Neither seam is
hidden and both are recorded in the receipt.

## Deploy

From this directory, same three commands as igl-api:

    npx wrangler deploy --dry-run --outdir ./_bundle
    npx wrangler secret put IGL_SIGNING_SEED     # fresh 64-hex seed, distinct from igl-api
    npx wrangler deploy

Proven locally by `node test/gateway.mjs` from the `igl-v1` directory: the OpenAI
shape, the live-digest binding, the refusal path, fail-closed zero partition, and
independent verification, 15 checks.
