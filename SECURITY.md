# Security Policy

## Supported Versions

Only the `main` branch is actively maintained. This project is in early
development (pre-audit) — there are no tagged releases yet considered
stable for production use.

## Audit Status

**This contract has not undergone a formal third-party security audit.**
It has been reviewed for standard access-control issues (admin
authorization on privileged calls, initialization front-running) but
should be treated as experimental. Do not rely on it for
security-critical decisions without independent verification.

Additionally, this project has a known and documented design limitation
around verification ownership — see
[Trust Model & Limitations](./README.md#trust-model--limitations) in the
README. Soroban does not expose on-chain deployer information, so the
registry cannot cryptographically prove a submitter owns the contract
behind a given WASM hash. This is not a bug to be "fixed" via a normal
vulnerability report — see the README section for the mitigations in
place and the long-term direction (attestation-based verification).

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **do
not** open a public GitHub issue. Instead:

- Use GitHub's [private vulnerability reporting](../../security/advisories/new)
  feature on this repository, or
- Email [INSERT YOUR CONTACT EMAIL] with details.

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce (or proof-of-concept code)
- Any suggested fix, if you have one

We aim to acknowledge reports within 48 hours and will keep you updated
as the issue is investigated and resolved. Once a fix is deployed, we're
happy to credit reporters in release notes if desired.

## Reporting an Incorrect or Malicious Verification

This is a separate track from security vulnerabilities. If you believe a
specific verification *record* in the registry is incorrect, misleading,
or malicious (e.g., a fake source/commit pairing submitted for a WASM
hash you own or control), please open a public issue using the
"Incorrect verification" template rather than a private security report
— this needs the registry admin's attention, not a code fix, and is not
sensitive information.

## Scope

In scope:
- `contracts/registry/` — the Soroban registry contract
- `cli/` — the TypeScript verification CLI (build reproducibility,
  hash computation)
- `sdk/` — shared TypeScript types and RPC helpers

Out of scope:
- `web/` — the explorer frontend
- Documentation-only issues (please use a regular GitHub issue for these)
