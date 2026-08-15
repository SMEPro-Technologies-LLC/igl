# Security policy

IGL is a governance language: its receipts and signatures are only as credible
as its security posture, so reports are taken seriously and handled quickly.

Report vulnerabilities privately through GitHub Security Advisories on this
repository ("Report a vulnerability"), or by email to security@smepro.tech.
Please do not open public issues for suspected vulnerabilities. Include enough
detail to reproduce: the file or endpoint, the input, and the observed versus
expected behavior. You will get an acknowledgment within three business days.

Scope: the `igl-v1` runtime, the Worker surfaces under `igl-v1/workers/`, and
the receipt and signature formats. The deployed demonstration services are in
scope for responsible disclosure but must not be load-tested or disrupted.

Known and intentional: the constant development seeds in the run scripts
(`Buffer.alloc(32, ...)`) are publicly derivable by design, are labelled
insecure in the source, and must never sign production receipts. Reports about
those keys being derivable are expected behavior, not vulnerabilities.

Supported versions: the tip of `main` and the latest tagged release.
