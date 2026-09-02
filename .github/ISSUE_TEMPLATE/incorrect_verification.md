---
name: Incorrect or malicious verification
about: Report a registry record you believe is wrong, misleading, or fraudulent
title: "[Incorrect Verification] "
labels: verification-report
assignees: ""
---

> **Not a security vulnerability?** This template is for registry *data* issues —
> incorrect or malicious source/commit pairings submitted for a WASM hash.
> If you've found a code vulnerability in the contract or CLI, please use
> [private vulnerability reporting](../../security/advisories/new) instead.
> See [SECURITY.md](../../SECURITY.md) for details.

## WASM hash in question

<!-- Required. The 64-character hex SHA-256 hash the incorrect record is filed under. -->

```
<paste wasm hash here>
```

## What is currently recorded

<!-- What does the registry currently show for this hash? Paste the source repo URL
     and commit SHA as displayed in the explorer or returned by `stellar-verify lookup`. -->

- **Source repo:**
- **Commit:**
- **Submitted by:**
- **Submitted at (ledger):**

## Why you believe this is incorrect or malicious

<!-- Describe the problem. Examples: the source doesn't compile to this hash, the
     repo doesn't exist, the commit SHA is fake, you are the actual deployer and
     someone else claimed it first, etc. -->

## Correct source repo / commit (if known)

<!-- If you know what the correct record should be, provide it here. -->

- **Correct source repo:**
- **Correct commit:**

## Supporting evidence

<!-- Attach anything that backs up your report:
     - Output of `stellar-verify check --contract <address>` showing a hash mismatch
     - Steps to rebuild locally and the resulting hash
     - Links to the real source repository or CI artifacts
     - Any other relevant links or context -->

## Confirmation

- [ ] I have checked that this is a **registry data issue** (incorrect/malicious
      verification record), not a security vulnerability in the contract or CLI code.
      If it's a vulnerability, I will use private reporting instead.
