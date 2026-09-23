# EMMY_CHANGELOG.md

This file is the single source of truth for all changes made to this repository
as part of the Stellar Wave Program resubmission audit. Entries are append-only
and ordered from oldest to newest.

---

## 2026-09-19 — Branch: feat/tests

**What changed:**
- Added `cli/src/lib/hash.test.ts`: 13 unit tests covering `sha256Hex` and `computeLocalWasmHash`
- Removed `passWithNoTests: true` from `cli/vitest.config.ts`

**Why:**
`hash.ts` is the module responsible for computing the WASM SHA-256 that gets
submitted to the on-chain registry. It had zero unit tests. The `passWithNoTests`
flag meant the CI test suite could pass vacuously with no test files at all.
The tests prove hash computation is correct, deterministic, and handles edge
cases (empty buffer, missing file, Uint8Array input).

**Branch:** feat/tests → main (awaiting PR merge)

---

## 2026-09-19 — Branch: feat/docs

**What changed:**
- Rewrote README.md to lead with a complete end-to-end example (build → hash → check → submit → verify independently)
- Added "How soroban-verify Differs from Stellar Expert" comparison table
- Updated repo structure tree to reflect current files
- Removed reference to missing `cli/src/lib/rpc.ts`

**Why:**
The previous README described what the system does but gave no concrete worked
example. Evaluators could not tell without running the code what the actual
verification flow looks like. The Stellar Expert comparison makes the project's
unique value proposition (on-chain records, independent re-verification,
programmatic access) explicit.

**Branch:** feat/docs → main (awaiting PR merge)

---

## 2026-09-19 — Branch: feat/deploy

**What changed:**
- Added `DEPLOY.md` at repo root: complete testnet deployment walkthrough (8 steps, no fabricated contract IDs)
- Added `rust-toolchain.toml` pinning Rust `1.85.0` + `wasm32v1-none` target

**Why:**
A root-level DEPLOY.md was missing. The existing `docs/deploying.md` was
buried and incomplete. `rust-toolchain.toml` is critical for this project
specifically: without a pinned toolchain, two developers building the same
commit can produce different WASM hashes, undermining the entire premise of
source verification.

**Branch:** feat/deploy → main (awaiting PR merge)

---

## Unreleased

### Fixed

- **B1 / U1 / B18** (`sdk/src/client.ts`, `cli/src/commands/verify.ts`, `cli/src/commands/check.ts`):
  Both `verify` and `check` CLI commands were broken at runtime when `--wasm` was
  not provided. `resolveWasmHash` expects `rpc.Server` but both commands passed a
  plain string (`config.rpcUrl`), causing a method-not-found crash. `verify.ts`
  additionally used `(client as any)._server` which is never set on the returned
  object, and called `createRegistryClient` twice (wasting an RPC connection).
  Fix: `resolveWasmHash` signature widened to accept `rpc.Server | string`,
  constructing an `rpc.Server` internally when a URL string is given. Both CLI
  commands updated to pass `config.rpcUrl` directly. Duplicate client construction
  in `verify.ts` eliminated. All 18 CLI tests pass.
  Addresses audit findings **B1**, **U1**, and **B18**.
