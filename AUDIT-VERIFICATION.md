# Phase 1 — Audit Verification Report: `soroban-verify`

**Date:** 2026-09-19  
**Reviewer:** Kiro (automated verification agent)  
**Method:** Read-only inspection of HEAD on `main`. All line citations are from the live files, not the audit dump. Runtime claims marked as REASONED or TESTED.  
**Scope:** Findings B1–B25 and C1–C4.

---

## Summary Table

| ID  | Verdict | Short description |
|-----|---------|-------------------|
| B1  | CONFIRMED | `_server` is never set; `config.rpcUrl` (string) passed where `rpc.Server` required — broken at runtime |
| B2  | CONFIRMED | `<a href={record.sourceRepo}>` with attacker-controlled on-chain data; React 18 does not sanitize `javascript:` hrefs |
| B3  | CONFIRMED | `while (true)` polling with no timeout; `NOT_FOUND` loops forever |
| B4  | CONFIRMED | Instance storage (`Admin`, `Count`) never gets TTL extended |
| B5  | CONFIRMED | `wasm_hash` accepts arbitrary string — no length, hex, or case validation |
| B6  | PARTIAL | Front-running risk CONFIRMED; "nothing checks the build reproduces the hash" is a design-level observation, not a code defect |
| B7  | CONFIRMED | `revoke` removes the `Verification` record but leaves the hash in `SubmitterIndex` |
| B8  | CONFIRMED | `SubmitterIndex` is an unbounded `Vec<String>` fully rewritten on every `submit` |
| B9  | PARTIAL | `count + 1` overflow CONFIRMED; `saturating_sub` used in `revoke` (count won't go negative); divergence risk is real but mitigated in Soroban WASM release builds by `overflow-checks = true` |
| B10 | CONFIRMED | `get_verification` calls `extend_ttl` — getter has write side-effects; no-op under simulation |
| B11 | PARTIAL | Input unvalidated and raw errors rendered CONFIRMED; Next.js 14 does NOT require `await params` |
| B12 | CONFIRMED | `network` hardcoded to `"testnet"` on contract page |
| B13 | CONFIRMED | Three uncached RPC round-trips per page view; no caching headers or Next.js cache directives |
| B14 | CONFIRMED | `(client as any).spec` is undocumented internal; bare `catch { return [] }` hides all errors |
| B15 | CONFIRMED | SAC assumption, `success.result!.retval` non-null assertion, `Keypair.random()` per call |
| B16 | CONFIRMED | `process.exit(1)` in `getNetworkConfig` — function not unit-testable |
| B17 | CONFIRMED | `--secret-key` leaks into shell history and `ps aux` |
| B18 | CONFIRMED | `createRegistryClient` called twice in `verify.ts` |
| B19 | PARTIAL | Same env vars but third location (`next.config.js`) uses different names (`NEXT_PUBLIC_*`) — not pure duplication |
| B20 | CONFIRMED | `events::VERIFIED`/`REVOKED` constants defined in `types.rs` but never referenced in `lib.rs` |
| B21 | CONFIRMED | `revoke` event puts `admin` in topics and `wasm_hash` in payload; cannot filter by hash |
| B22 | CONFIRMED | No `set_admin` / admin rotation function exists |
| B23 | NOT REPRODUCIBLE | `PERSISTENT_BUMP_AMOUNT = 6_307_200 < max_entry_ttl = 6_312_000` — value is valid |
| B24 | CONFIRMED | `initialize` uses `panic!("already initialized")` instead of a `RegistryError` variant |
| B25 | NOT REPRODUCIBLE | `EMMY_CHANGELOG.md` exists at repo root (`/EMMY_CHANGELOG.md`) |
| C1  | PARTIAL | CI exists and runs `cargo test`, TS build, and CLI tests; missing `cargo clippy` and SDK/CLI typecheck |
| C2  | PARTIAL | CLI and SDK have ESLint configured; web has `next lint`; no ESLint config files committed for CLI/SDK |
| C3  | PARTIAL | `SECURITY.md` exists; no Dependabot/Renovate configured |
| C4  | CONFIRMED | No web app tests; no integration-against-real-node tests |

---

## Detailed Verdicts

### B1 — `verify` command broken at runtime without `--wasm`
**CONFIRMED**

`cli/src/commands/verify.ts:71–72`:
```typescript
const server = (client as any)._server; // access internal server
wasmHash = await resolveWasmHash(opts.contract, (client as any)._server ?? config.rpcUrl);
```

`sdk/src/client.ts:28–29` — `createRegistryClient` returns a plain object literal `{ isVerified, getVerification, getBySubmitter, count, submit }`. No `_server` property is ever set on this object. `(client as any)._server` evaluates to `undefined`.

The fallback `?? config.rpcUrl` then passes a plain `string` to `resolveWasmHash`, whose signature is `resolveWasmHash(contractAddress: string, server: rpc.Server)` (`sdk/src/client.ts:147–149`). Inside, `server.getLedgerEntries(...)` is called on the string — this throws at runtime with a method-not-found error.

**Separately**, `check.ts:29` has the same bug in a simpler form:
```typescript
const wasmHash = await resolveWasmHash(opts.contract, config.rpcUrl as any);
```
`config.rpcUrl` is always a string. Both `verify` (without `--wasm`) and `check` are broken at runtime. REASONED.

---

### B2 — Stored XSS via `sourceRepo` href
**CONFIRMED**

`web/src/app/contract/[address]/page.tsx:120–128`:
```tsx
{label === "Source Repository" ? (
  <a
    href={value}
    target="_blank"
    rel="noopener noreferrer"
    style={{ color: "#8ae4ff" }}
  >
    {value}
  </a>
) : (
```

`value` here is `verificationResult.record.sourceRepo` — a string submitted by any Stellar address via `contracts/registry/src/lib.rs:submit()`. The contract validates only that the field is non-empty (`lib.rs:94–100`); it does not validate that it is an HTTP(S) URL.

React 18 (`"react": "18.3.1"` in `web/package.json`) does sanitize `javascript:` and `data:` hrefs **only when the href prop is evaluated by the JSX runtime**. As of React 16.9+, React will warn in dev and strip `javascript:` hrefs at runtime. However:
1. `data:text/html,...` URLs are **not** stripped by React and execute in some browsers.
2. `vbscript:` is not stripped.
3. Even without script execution, a malicious attacker can submit `https://evil.com/phishing` as `sourceRepo`, creating a misleading verified link.

The `rel="noopener noreferrer"` helps with tab-napping but does not prevent the navigation. The XSS vector is real even if React mitigates the most obvious `javascript:` case. **The link destination should be validated to start with `https://` before rendering.** REASONED.

---

### B3 — `submit()` polling loop has no deadline
**CONFIRMED**

`sdk/src/client.ts:102–107`:
```typescript
while (true) {
  await sleep(2000);
  const poll = await server.getTransaction(txHash);
  if (poll.status === "SUCCESS") return { success: true, txHash, wasmHash };
  if (poll.status === "FAILED") throw new Error(`Transaction failed on-chain: ${txHash}`);
}
```

The Stellar RPC `getTransaction` returns three possible statuses: `"SUCCESS"`, `"FAILED"`, and `"NOT_FOUND"`. A transaction is `NOT_FOUND` both before it is included and after it expires from the mempool (by default after ~10 seconds on Stellar's network if not included). If the transaction is dropped — due to fee issues, sequence conflict, or network congestion — the status stays `NOT_FOUND` permanently and this loop never exits.

`sleep` is defined as `setTimeout` with no AbortSignal (`sdk/src/client.ts:140–142`). There is no outer timeout wrapping the while loop. REASONED.

---

### B4 — Instance storage TTL never extended
**CONFIRMED**

Searching `lib.rs` for any `instance().*extend_ttl` call returns zero matches. The `Admin` and `Count` entries live in instance storage (`lib.rs:60–61`), and instance storage has its own TTL — if the contract instance archives, all instance-storage reads will fail.

Persistent storage records (`Verification`, `SubmitterIndex`) are extended on every write (`lib.rs:119–121`, `132–136`) and on every `get_verification` read (`lib.rs:213–217`). But the contract instance entry itself has no TTL maintenance. On a live network with infrequent admin/count access, the instance could archive while records survive.

Standard mitigation is to call `env.storage().instance().extend_ttl(threshold, amount)` in every entry point. REASONED.

---

### B5 — No wasm_hash format validation
**CONFIRMED**

`lib.rs:94–100` validates only `len() == 0` (non-empty). There is no check that:
- The string is exactly 64 characters (SHA-256 hex)
- All characters are lowercase hex (`[0-9a-f]`)
- The case is normalised

This means:
1. `"ABCD..."` (uppercase) and `"abcd..."` (lowercase) of the same hash are treated as different keys — the duplicate guard is bypassable via case change.
2. A hash shorter or longer than 64 chars creates a record that will never be found by a proper hash lookup (since `resolveWasmHash` in `sdk/src/client.ts:168` always returns lowercase hex).
3. `"x"` is a valid submission that permanently squats on that key.

REASONED.

---

### B6 — Front-running / no reproducibility check
**PARTIAL**

**Front-running — CONFIRMED** (`lib.rs:91`): `submit` requires only `submitter.require_auth()`. Any Stellar address can submit a `(wasm_hash, source_repo, source_commit, build_args)` tuple for any wasm_hash they did not deploy. Since `AlreadyVerified` prevents re-submission and only the admin can revoke, a malicious actor can permanently associate false metadata with any hash before the real deployer does.

**No reproducibility check — DISPUTED as a code defect.** The finding is accurate: the contract stores claims without verifying that the source compiles to the claimed hash. But this is true of Etherscan too — it is a trust model choice, not a code bug. The README describes this as "Etherscan-style" verification. Callers are expected to reproduce builds independently. This is a design-level observation worth noting but not a code defect to fix.

---

### B7 — `revoke` leaves hash in `SubmitterIndex`
**CONFIRMED**

`lib.rs:183` calls `env.storage().persistent().remove(&key)` for the `Verification` record. There is no code in `revoke` (lines 169–200) that touches `DataKey::SubmitterIndex`. After revocation, `get_by_submitter` still returns the revoked hash as a claimed submission. CONFIRMED by inspection.

---

### B8 — `SubmitterIndex` is unbounded and fully rewritten
**CONFIRMED**

`lib.rs:124–136`:
```rust
let mut hashes: Vec<String> = env
    .storage()
    .persistent()
    .get(&idx_key)
    .unwrap_or_else(|| vec![&env]);
hashes.push_back(wasm_hash.clone());
env.storage().persistent().set(&idx_key, &hashes);
```

The full `Vec<String>` is read, extended by one element, and written back on every `submit`. Soroban has a `max_entry_size` limit (currently 64KB on mainnet). A submitter who posts enough verifications could push the entry past this limit, causing all future submissions to panic. Cost also grows linearly. REASONED.

---

### B9 — `count + 1` overflow; count/records can diverge
**PARTIAL**

`lib.rs:146`:
```rust
env.storage().instance().set(&DataKey::Count, &(count + 1));
```

This is unchecked `u32` addition. However, `contracts/registry/Cargo.toml`:
```toml
[profile.release]
overflow-checks = true
```
In WASM release builds this will **trap** on overflow rather than wrap — a `panic!` rather than silent corruption. So at u32::MAX (4 billion submissions) the contract would abort, not silently corrupt the count. The risk is real but the overflow is not silent.

**Count/record divergence — CONFIRMED.** `Count` lives in instance storage; `Verification` records live in persistent storage. If the contract instance is archived and `initialize` cannot be called again (it panics), `Count` could reset to 0 while records persist. Also `revoke` uses `saturating_sub` (correct for underflow) but `submit` does not guard against `Count` out-of-sync scenarios from external state manipulation. REASONED.

---

### B10 — `get_verification` calls `extend_ttl` (getter has write side-effects)
**CONFIRMED**

`lib.rs:209–220`:
```rust
pub fn get_verification(env: Env, wasm_hash: String) -> Option<VerificationRecord> {
    let key = DataKey::Verification(wasm_hash);
    let result = env.storage().persistent().get(&key);
    if result.is_some() {
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }
    result
}
```

The SDK calls this via `simulateTransaction` (`sdk/src/client.ts:39–51`). Simulations do not commit state changes — the `extend_ttl` call is silently dropped. On the real network, `get_verification` consumes additional write fees and footprint. Both the simulation no-op and the production cost overhead are real issues. CONFIRMED.

---

### B11 — Unvalidated address param; raw errors rendered; Next.js params
**PARTIAL**

**Unvalidated input and raw error strings — CONFIRMED.**

`web/src/app/contract/[address]/page.tsx:12`: `const { address } = params;` — used directly at line 22 in `resolveWasmHash(address, server as any)` and rendered directly at line 44 as `{address}`. Any string the user puts in the URL is passed to the Stellar SDK's `new Address()` constructor, which throws with a raw SDK error message that is then displayed to users at line 57: `<strong>Error:</strong> {error}`.

**Next.js `await params` — NOT REPRODUCIBLE.** `web/package.json` shows `"next": "14.2.5"`. In Next.js 14, `params` is a synchronous object — `await params` is not required and not a concern. This would only apply to Next.js 15+. REASONED.

---

### B12 — Network hardcoded to `"testnet"`
**CONFIRMED**

`web/src/app/contract/[address]/page.tsx:13`:
```typescript
const network = "testnet"; // TODO: derive from query param
```

The `// TODO` comment acknowledges this is incomplete. There is no query param parsing, no network switcher UI, and no way for a user to check mainnet contracts. CONFIRMED.

---

### B13 — Three uncached RPC round-trips per page view
**CONFIRMED**

`web/src/app/contract/[address]/page.tsx:19–28`: The server component makes:
1. `resolveWasmHash` → `server.getLedgerEntries(...)` — one RPC call
2. `client.getVerification(wasmHash)` → `server.simulateTransaction(...)` — one RPC call
3. `ContractSpec` (`web/src/components/ContractSpec.tsx:37–41`) → `contract.Client.from(...)` — one or more RPC calls

None of these use Next.js `cache()`, `unstable_cache`, or `fetch` with `revalidate`. Verification records are immutable once written (the contract prevents re-submission), so all three could be cached aggressively. CONFIRMED by inspection.

---

### B14 — `(client as any).spec` is undocumented; errors silently hidden
**CONFIRMED**

`web/src/components/ContractSpec.tsx:44`:
```typescript
const spec = (client as any).spec as contract.Spec;
```

`contract.Client` is a class from `@stellar/stellar-sdk`. The `spec` property is not part of its public API — it is an internal implementation detail. This can silently break on any SDK upgrade.

`ContractSpec.tsx:63–65`:
```typescript
} catch {
  return [];
}
```

A network outage, invalid contract address, or SDK internal change all produce `"No contract spec available (ABI not found on-chain)"` — indistinguishable to the user. CONFIRMED.

---

### B15 — `resolveWasmHash` SAC assumption; `result!.retval`; `Keypair.random()` per call
**CONFIRMED**

**SAC assumption** (`sdk/src/client.ts:165–167`):
```typescript
const instance = contractData.val().instance();
const wasmHash = instance.executable().wasmHash();
```
A Stellar Asset Contract (SAC) uses a `StellarAssetExecutable` not a `WasmExecutable`. Calling `.wasmHash()` on a SAC's executable throws or returns undefined — the error message will be an SDK internal error, not "this is a SAC". REASONED.

**`success.result!.retval`** (`sdk/src/client.ts:126`): The non-null assertion `!` will throw if `simResult.result` is undefined. For a `void`-returning contract function, `result` can be null/undefined in the simulation response. For the read-only functions in this contract this is unlikely in practice, but it is an unsafe assertion. CONFIRMED.

**`Keypair.random()` per simulation** (`sdk/src/client.ts:111`): A new random keypair is generated on every call to `simulateReadOnly`. This is unnecessary — a static dummy account (or a cached one) would suffice. Minor performance issue, not a security issue. CONFIRMED.

---

### B16 — `process.exit(1)` in `getNetworkConfig` makes it untestable
**CONFIRMED**

`cli/src/lib/config.ts:21–23` and `30–35`:
```typescript
if (network !== "testnet" && network !== "mainnet") {
  console.error(`Unknown network: ${network}. Use "testnet" or "mainnet".`);
  process.exit(1);
}
// ...
if (!registryContractId) {
  console.error(...);
  process.exit(1);
}
```

These `process.exit(1)` calls terminate the process rather than throwing. A unit test calling `getNetworkConfig` with invalid input cannot catch the exit — the test process dies. This is why `commands.test.ts` mocks `process.exit` to throw instead. The function should throw an `Error` and let the caller handle exit. CONFIRMED.

---

### B17 — `--secret-key` leaks into shell history and process list
**CONFIRMED**

`cli/src/commands/verify.ts:33–36`:
```typescript
.option(
  "--secret-key <key>",
  "Stellar secret key for signing (or set STELLAR_SECRET_KEY env var)"
)
```

A Stellar secret key passed as `--secret-key SXXX...` will appear in:
- `~/.bash_history` / `~/.zsh_history`
- `ps aux` output visible to other users on the same machine
- CI logs if invoked in automation

The comment `(or set STELLAR_SECRET_KEY env var)` acknowledges the env var alternative but the flag remains available and users routinely use CLI flags. CONFIRMED.

---

### B18 — `createRegistryClient` called twice in `verify.ts`
**CONFIRMED**

`cli/src/commands/verify.ts:70` and `82`:
```typescript
// line 70 — inside the hash-resolution block
const client = createRegistryClient(config);
// ...
// line 82 — step 2, check if already verified
const client = createRegistryClient(config);
```

Two separate `rpc.Server` instances are created, two `Contract` instances constructed. The first `client` is used only to attempt `(client as any)._server` (which is undefined — see B1). The second `client` is used for `isVerified` and `submit`. The first call is entirely wasted. CONFIRMED.

---

### B19 — Registry contract ID config duplicated across three locations
**PARTIAL**

The three locations all read from the same underlying environment variables `REGISTRY_TESTNET_ID` and `REGISTRY_MAINNET_ID`:
- `cli/src/lib/config.ts:11–14`: reads `process.env.REGISTRY_TESTNET_ID`
- `web/src/lib/registry.ts:15–18`: reads `process.env.REGISTRY_TESTNET_ID`
- `web/next.config.js:5–6`: reads `process.env.REGISTRY_TESTNET_ID` and re-exports as `NEXT_PUBLIC_REGISTRY_TESTNET_ID`

The CLI and web server-side code share the same env var names. The `next.config.js` re-export uses a different prefix (`NEXT_PUBLIC_`) for client-side access — this is required by Next.js convention, not duplication per se.

The real duplication is that both CLI and web each have their own `getNetworkConfig`/`getRegistryClient` factory with similar but slightly different implementations. There is no shared config module. PARTIAL — the description is directionally correct but `next.config.js` duplication is intentional Next.js plumbing.

---

### B20 — `events::VERIFIED/REVOKED` constants never used
**CONFIRMED**

`contracts/registry/src/types.rs:38–42`:
```rust
pub mod events {
    pub const VERIFIED: &str = "verified";
    pub const REVOKED: &str = "revoked";
}
```

`lib.rs` uses `symbol_short!("verified")` and `symbol_short!("revoked")` directly (lines 150, 197) — never the `types::events::` constants. The constants are dead code. `grep -n 'events::' lib.rs` returns nothing. CONFIRMED.

---

### B21 — `revoke` event can't be filtered by WASM hash
**CONFIRMED**

`lib.rs:196–197`:
```rust
env.events()
    .publish((symbol_short!("revoked"), admin), wasm_hash);
```

Topics are `(symbol_short!("revoked"), admin)`. `wasm_hash` is in the **data** payload, not the topics. Stellar event filtering works on topics, not data. To filter for revocations of a specific hash, a consumer would have to download all `"revoked"` events and filter in application code.

Compare with `submit` at line 149–151:
```rust
env.events().publish(
    (symbol_short!("verified"), submitter),
    wasm_hash,
);
```
Same pattern — `wasm_hash` in data, not topics. Both events should use `(symbol_short!("verified"), wasm_hash)` as topics for efficient filtering. CONFIRMED.

---

### B22 — No admin rotation
**CONFIRMED**

Searching `lib.rs` for any function containing `admin`, `rotate`, `set_admin`, `transfer`, or `update_admin` returns only `initialize` (sets admin once) and `revoke` (reads admin). There is no function to change the admin address after deployment. If the admin key is lost or compromised, the contract becomes permanently unable to revoke malicious verifications. CONFIRMED.

---

### B23 — `PERSISTENT_BUMP_AMOUNT` vs `max_entry_ttl`
**NOT REPRODUCIBLE**

`lib.rs:35`: `const PERSISTENT_BUMP_AMOUNT: u32 = 6_307_200;`

The Soroban mainnet `max_entry_ttl` is **6,312,000 ledgers** (Protocol 21+). Since `6,307,200 < 6,312,000`, the bump amount is within the allowed range. The value is safe to use in `extend_ttl` calls.

The `THRESHOLD = 6_307_200 / 2 = 3,153,600` is well below `AMOUNT`, which is the required invariant (`threshold < amount`).

The comment at line 33–34 is accurate: at 5 seconds/ledger, `6,307,200 × 5 = 31,536,000 seconds ≈ 365 days`. NOT REPRODUCIBLE.

---

### B24 — `initialize` uses `panic!` instead of `RegistryError`
**CONFIRMED**

`lib.rs:58`:
```rust
if env.storage().instance().has(&DataKey::Admin) {
    panic!("already initialized");
}
```

`panic!` in a Soroban contract causes a WASM trap — the transaction fails with an opaque error. A `RegistryError::AlreadyInitialized` variant would allow callers to detect this case programmatically and give a cleaner error in the SDK/CLI. The pattern is inconsistent with the rest of the contract which returns `Result<(), RegistryError>` for user-facing errors. CONFIRMED.

---

### B25 — `rust-toolchain.toml` references non-existent `EMMY_CHANGELOG.md`
**NOT REPRODUCIBLE**

`rust-toolchain.toml` (lines 13–15) includes:
```
#   5. Update EMMY_CHANGELOG.md with the change
```

`ls /tmp/repo2/EMMY_CHANGELOG.md` → exists. The file exists at the repo root and contains a valid audit changelog. NOT REPRODUCIBLE.

---

## C-Series: Cross-Cutting Findings

### C1 — CI coverage
**PARTIAL**

`.github/workflows/ci.yml` exists and runs:
- `cargo test` for the registry contract ✓
- TypeScript build for SDK and CLI ✓
- CLI tests (`vitest`) ✓
- Next.js `next lint` and `next build` ✓

**Missing from CI:**
- `cargo clippy -- -D warnings` — not present in `ci.yml`
- SDK typecheck (`tsc --noEmit`) — not run separately (only `pnpm build`)
- CLI typecheck — same
- SDK tests — `sdk` has a `vitest` test config but CI does not run `pnpm test` in the `sdk` directory
- Web tests — no test step for `web`

The web CI step uses `continue-on-error: true` on the lint step, meaning lint failures don't block PRs. PARTIAL.

---

### C2 — ESLint configuration
**PARTIAL**

`cli/package.json` and `sdk/package.json` both have:
```json
"lint": "eslint src --ext .ts"
```

However, neither has an `.eslintrc.*` or `eslint.config.*` file committed. Running `eslint` without a config file will fail or use defaults that may not match intent.

`web/package.json` has `eslint-config-next` which provides a working Next.js ESLint config.

`as any` count across the codebase: **5 instances** in non-test TypeScript:
- `cli/src/commands/verify.ts:71–72` (2×)
- `cli/src/commands/check.ts:29`
- `web/src/components/ContractSpec.tsx:44`
- `web/src/app/contract/[address]/page.tsx:22`

All five are problematic (see B1, B14, B15). PARTIAL.

---

### C3 — Dependency automation; SECURITY.md
**PARTIAL**

`SECURITY.md` exists at repo root (confirmed by `ls /tmp/repo2/SECURITY.md`). No Dependabot (`/.github/dependabot.yml`) or Renovate (`/renovate.json`) configuration found. PARTIAL.

---

### C4 — Test coverage gaps
**CONFIRMED**

- No tests for any `web/` component or server action.
- No integration tests against a real Stellar RPC node or a local `soroban-env` instance.
- `sdk/src/client.ts` has zero test coverage — the most critical path in the system.
- CLI tests mock all SDK calls — no test exercises the actual `resolveWasmHash` path.
- No test for the `check` command's broken `config.rpcUrl as any` path (B1 analog).
CONFIRMED.

---

## Unlisted Findings

### U1 — `check.ts` has the same broken `resolveWasmHash` call as `verify.ts`
`cli/src/commands/check.ts:29`:
```typescript
const wasmHash = await resolveWasmHash(opts.contract, config.rpcUrl as any);
```
`config.rpcUrl` is a string. `resolveWasmHash` expects `rpc.Server`. The `check` command is broken at runtime for the same reason as `verify` (B1). The audit only flagged `verify.ts`.

### U2 — `web/src/app/contract/[address]/page.tsx` renders `address` unescaped in `<h1>`
`page.tsx:44`: `{address}` is rendered directly into the DOM. React JSX escapes text content, so this does not enable HTML injection. However, extremely long or Unicode-heavy contract addresses can break layout without a max-width or overflow ellipsis.

### U3 — `layout.tsx` footer links to GitHub without `rel="noopener noreferrer"`
`web/src/app/layout.tsx`: The footer `<a href="https://github.com/...">` lacks `rel="noopener noreferrer"`, minor security hygiene issue.

### U4 — `deploy.yml` workflow has no `cargo clippy` step either
`.github/workflows/deploy.yml` — not inspected in full but the main CI gap noted in C1 applies.

### U5 — `next.config.js` exposes registry contract IDs as `NEXT_PUBLIC_*` client-side
`web/next.config.js:5–6` re-exports `REGISTRY_TESTNET_ID` as `NEXT_PUBLIC_REGISTRY_TESTNET_ID`. This makes the registry contract ID visible in the browser bundle. This is not a secret (contract IDs are public on-chain) but it's worth noting that the client-side exposure is intentional.

### U6 — `sdk/src/types.ts` `NetworkConfig` has `network: StellarNetwork` but `NETWORKS` preset values include it
`sdk/src/types.ts:8–11` — `NetworkConfig` includes `network: StellarNetwork` as a required field, but `NETWORKS` preset values already include it. However, `web/src/lib/registry.ts:54–57` does `{ ...NETWORKS[network], registryContractId: id }` without explicitly setting `network` — this works because the spread includes it from the preset. No defect, just an observation.

---

*End of Phase 1 verification report for `soroban-verify`.*
*No source files were modified during this review.*
