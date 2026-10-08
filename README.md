# soroban-verify

> On-chain source verification registry for Soroban smart contracts on Stellar. Etherscan-style "verified source" records, stored in a Soroban contract.

[![CI](https://github.com/eogenyi23-creator/soroban-verify/actions/workflows/ci.yml/badge.svg)](https://github.com/eogenyi23-creator/soroban-verify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

When you deploy a Soroban contract, anyone can see its WASM bytecode, but not **which source code produced it**. soroban-verify stores a record on-chain that links a WASM hash to a source repository, a git commit, and the build command. Anyone can then rebuild that commit and compare hashes.

This README is a step-by-step guide. Follow Parts A to E in order and you will install the project, test it, deploy your own registry to Stellar **testnet**, submit and read back a verification record, browse it in the web explorer, and independently check it. Everything uses testnet and throwaway keys. No real funds are involved.

**Contents:** [Part A](#part-a-install-build-and-test) · [Part B](#part-b-deploy-your-own-registry-to-testnet) · [Part C](#part-c-submit-and-check-a-verification) · [Part D](#part-d-browse-it-in-the-web-explorer) · [Part E](#part-e-verify-a-record-independently) · [Troubleshooting](#troubleshooting) · [Current deployment](#current-testnet-deployment) · [How it works and limits](#what-is-soroban-verify) · [CLI reference](#cli-reference)

> **Important:** a record is a *claim*, not a proof. The CLI does not rebuild the source for you. See [Trust Model & Limitations](#trust-model--limitations).

---

## Part A: Install, build and test

This part needs no network access and no keys. It confirms the code works on your machine.

### A1. Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Rust | 1.91.0 (pinned by `rust-toolchain.toml`; rustup installs it automatically) | `rustc --version` |
| Node.js | 22.12 or newer | `node --version` |
| pnpm | 9 or newer | `pnpm --version` |
| Stellar CLI | 28.x (tested with 28.1.0) | `stellar --version` |

Install what is missing:

```bash
# Rust (then load it into the current shell)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Stellar CLI: use the prebuilt installer
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
```

Do **not** use `cargo install stellar-cli`. Current releases need a newer Rust than the pinned 1.91.0, and changing the toolchain changes the WASM hash. The installer may warn that the `wasm32v1-none` target is missing; ignore it, because the repo's toolchain file installs it on the first build.

In a fresh GitHub Codespace, Node and pnpm were already present; Rust and the Stellar CLI were not.

### A2. Get the code and build the JavaScript packages

```bash
git clone https://github.com/eogenyi23-creator/soroban-verify
cd soroban-verify

pnpm install
pnpm build
```

`pnpm build` builds the SDK, CLI and web app in order. The SDK must be built before the CLI or web tests can run, because they import `sdk/dist`.

### A3. Run the tests

```bash
pnpm test:ts     # TypeScript: sdk, cli, web
cargo test       # Rust: the registry contract
```

Expected results: SDK **12** passed, CLI **30** passed, web **27** passed, contract **14** passed. The first `cargo test` downloads the pinned toolchain and compiles dependencies, which takes a few minutes. The CLI tests use mocks and never touch a network.

### A4. Build the contract WASM and hash it

```bash
cargo build --manifest-path contracts/registry/Cargo.toml \
  --target wasm32v1-none --release

ls -lh target/wasm32v1-none/release/soroban_verify_registry.wasm
sha256sum target/wasm32v1-none/release/soroban_verify_registry.wasm
```

The file should be about 16 KB. The SHA-256 is the identifier the registry stores records under. Note that Cargo only honors release profiles in the **workspace root** `Cargo.toml`; do not move them into `contracts/registry/Cargo.toml`.

---

## Part B: Deploy your own registry to testnet

### B1. Create and fund a throwaway testnet identity

```bash
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet
stellar keys address deployer      # prints a G... address
```

(Stellar CLI 28 has no `--global` flag; keys are stored in your home directory by default.)

### B2. Deploy the contract

```bash
REGISTRY_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/soroban_verify_registry.wasm \
  --source deployer --network testnet)
echo "Registry: $REGISTRY_ID"
```

`Registry:` must print an ID starting with `C`. If it prints nothing, stop and check [Troubleshooting](#troubleshooting). Every later command depends on this ID.

### B3. Initialize it

The account you pass becomes the registry admin, who can revoke records.

```bash
stellar contract invoke --id "$REGISTRY_ID" --source deployer --network testnet \
  -- initialize --admin "$(stellar keys address deployer)"
```

Calling `initialize` a second time fails by design.

---

## Part C: Submit and check a verification

### C1. Set the environment variables

```bash
export REGISTRY_TESTNET_ID="$REGISTRY_ID"
export REGISTRY_MAINNET_ID="$REGISTRY_ID"    # placeholder; only the web app needs it set
export STELLAR_SECRET_KEY="$(stellar keys secret deployer)"
```

The secret key is only accepted through this environment variable, never as a flag, so it stays out of shell history and process listings. Use throwaway testnet keys only. These variables disappear when the terminal or Codespace restarts; the deployed contract and its records do not. After a restart, set `REGISTRY_ID` again to your contract ID and re-run the exports.

### C2. Run the CLI

The CLI has no `pnpm start` script. Run the built file directly from the `cli/` folder:

```bash
cd cli

# 1. Before: should report NOT source-verified and print the WASM hash
node dist/index.js --network testnet check --contract "$REGISTRY_ID"

# 2. Submit a record. --wasm makes the CLI compare your local hash with the on-chain hash first
node dist/index.js --network testnet verify \
  --contract "$REGISTRY_ID" \
  --source https://github.com/eogenyi23-creator/soroban-verify \
  --commit "$(git rev-parse HEAD)" \
  --wasm ../target/wasm32v1-none/release/soroban_verify_registry.wasm

# 3. After: should report source-verified, with the record's details
node dist/index.js --network testnet check --contract "$REGISTRY_ID"

# 4. Look the same record up by hash
WASM_HASH=$(sha256sum ../target/wasm32v1-none/release/soroban_verify_registry.wasm | cut -d' ' -f1)
node dist/index.js --network testnet lookup --hash "$WASM_HASH"
```

Output from a real run (2026-10-07), trimmed:

```
✔ WASM hash verified (local = on-chain): 5a051bb9fe3f7deef77f6548e1fea945782d4b4ca84cb3657d51c623662da086
✔ No existing record found — proceeding.
✔ Verification submitted!

✔ ✓ Contract CDXYHMEZ...LYMOHS is source-verified!
WASM hash:     5a051bb9fe3f7deef77f6548e1fea945782d4b4ca84cb3657d51c623662da086
Source repo:   https://github.com/eogenyi23-creator/soroban-verify
Commit:        c6a4f98d965e73f3a4e1e06a0ea5094b06ac003d
Submitted by:  GDTZ66MB...JWS7ZMN5
Ledger:        5074434
```

What to expect from the safety checks:

- Run step 2 again: the CLI finds the existing record and stops without submitting.
- Pass a `--wasm` file that does not match the contract on-chain: the CLI refuses to submit and exits with an error.
- Contracts that are Stellar Asset Contracts (tokens created natively) have no WASM hash and cannot be registered.

This guide registers the registry contract itself, because it is the one contract you just deployed. To verify a different contract, use its address for `--contract` and the `.wasm` it was built from for `--wasm`.

---

## Part D: Browse it in the web explorer

```bash
# still in the same terminal, so the environment variables are set
cd ../web
pnpm dev
```

Open http://localhost:3000. In a Codespace, open the **Ports** tab and click the forwarded port 3000. Paste the contract address into the search bar. A recorded contract shows a "Source Claim Recorded" badge with the repo, commit and submitter; a contract with no record shows that no source claim exists. Press Ctrl+C to stop the server.

---

## Part E: Verify a record independently

This is the point of the project: you do not have to trust the registry or the submitter. Rebuild the recorded commit on a clean checkout and compare hashes. The commit must be pushed to the public repository for this to work.

```bash
cd /tmp
git clone https://github.com/eogenyi23-creator/soroban-verify
cd soroban-verify
git checkout c6a4f98d965e73f3a4e1e06a0ea5094b06ac003d    # the commit from the record

cargo build --manifest-path contracts/registry/Cargo.toml \
  --target wasm32v1-none --release
sha256sum target/wasm32v1-none/release/soroban_verify_registry.wasm
```

If the hash equals the one on-chain, the source at that commit produces exactly the deployed code. If it differs, the claim is wrong or the build environment differs; check that you are on the pinned Rust version and the recorded build arguments. Reproducing hash `5a051bb9...` from a clean clone has not yet been confirmed (see CHANGELOG, "Not yet verified").

---

## Troubleshooting

These are real errors hit while writing this guide.

| Symptom | Cause and fix |
|---|---|
| `cargo: command not found` | Rust is not installed or not loaded. Install with rustup, then `source "$HOME/.cargo/env"`. |
| `stellar: command not found` | Run the Stellar CLI installer from A1. |
| `cargo install stellar-cli` fails: requires rustc 1.93.0 or newer | Expected on the pinned 1.91.0. Use the prebuilt installer instead. |
| `error: unexpected argument '--global'` | Stellar CLI 28 removed it. Use `stellar keys generate deployer --network testnet`. |
| `Failed to find config identity for deployer` | The key was never created. Run B1, then redo the failed step. |
| `Invalid name: names cannot exceed 250 characters or be empty` | `$REGISTRY_ID` is empty because the deploy did not run or failed. Redo B2 and check the printed ID. |
| `bash: syntax error near unexpected token 'newline'` | You pasted a placeholder such as `<REGISTRY_ID>`. Angle brackets are shell syntax; replace the whole placeholder with the real value, without brackets. |
| `Failed to resolve entry for package "@soroban-verify/sdk"` | The SDK is not built. Run `pnpm build` from the repo root, then retry. |
| `ERR_PNPM_NO_SCRIPT_OR_SERVER ... Missing script start` | The CLI has no `start` script. Use `node dist/index.js ...` from `cli/`. |
| `No registry contract ID configured for testnet` | `REGISTRY_TESTNET_ID` is not set, or pass `--registry-id <C...>`. |
| `secret key required` | `STELLAR_SECRET_KEY` is not set. See C1. |
| `warning: profiles for the non root package will be ignored` | An older checkout. The release profile now lives in the workspace root `Cargo.toml`. |
| Variables gone after a restart | Normal. Re-export them. The contract and records persist on testnet. |
| `stellar keys secret` not found | Try `stellar keys show deployer` on other CLI versions. |

---

## Current Testnet Deployment

| | |
|---|---|
| Registry contract | `CDXYHMEZU2WTDW53MXTWO6IHVDHXTOLHHBCF4LHC43RZ24QE52LYMOHS` |
| WASM hash | `5a051bb9fe3f7deef77f6548e1fea945782d4b4ca84cb3657d51c623662da086` |
| Self-verification ledger | 5074434 |
| Source commit recorded | `c6a4f98d965e73f3a4e1e06a0ea5094b06ac003d` |

The record was submitted by the registry's own admin account as a demonstration, so it is a claim like any other. Earlier testnet deployments (`CBMQVH7M...`, `CCWVSYES...`) are superseded. There is no mainnet deployment. Testnet can be reset by the network operators, in which case redeploy using Part B. See [CHANGELOG.md](CHANGELOG.md) for history.

---

## What is soroban-verify?

When you deploy a Soroban contract, anyone can see its WASM bytecode on-chain. But can they verify **what source code produced that bytecode**? That's the gap soroban-verify fills.

soroban-verify is a four-part system:

| Component | Description |
|-----------|-------------|
| `contracts/registry` | A Soroban smart contract that stores WASM-hash → source verification records on-chain |
| `cli/` | A TypeScript CLI (`stellar-verify`) that hashes a WASM artifact (or fetches the hash from the network), compares it to the on-chain hash, and submits a verification record |
| `web/` | A Next.js explorer UI — paste any contract address to see if it's source-verified, view its ABI/spec, and browse its metadata |
| `sdk/` | Shared TypeScript types and RPC helpers used by both the CLI and web |

## How It Works

```
Developer                     soroban-verify                    Stellar Network
   │                               │                                 │
   │── stellar contract build ───► │                                 │
   │                               │── compute SHA256(wasm) ───────► │
   │                               │                                 │── wasm_hash stored on-chain
   │                               │◄── wasm_hash ───────────────────│
   │                               │                                 │
   │                               │── submit_verification(          │
   │                               │     wasm_hash,                  │
   │                               │     source_repo,                │
   │                               │     source_commit,              │
   │                               │     build_args                  │
   │                               │   ) ──────────────────────────► │
   │                               │                                 │── record stored on-chain ✓
```

Anyone can then look up any contract address and see:
- ✅ **Verified** — source repo, commit, and build args that reproduce the exact WASM
- ❌ **Unverified** — WASM hash known, no source linked yet.

## How soroban-verify Differs from Stellar Expert

[Stellar Expert](https://stellar.expert/) is the leading Stellar network explorer and provides contract information. Here is exactly how soroban-verify is different:

| Feature | Stellar Expert | soroban-verify |
|---------|---------------|----------------|
| **Verification storage** | Centralised database (off-chain) | On-chain Soroban contract — no single point of failure |
| **Source-code linking** | Not available — shows bytecode/ABI only | Explicit: source repo URL + git commit SHA + build args |
| **Independent re-verification** | Not supported | Built-in: the on-chain record gives anyone the source repo, commit, and build args needed to rebuild and compare independently |
| **Verification permanence** | Depends on Stellar Expert's service | Stored with ~1-year ledger TTL in persistent storage |
| **Programmatic access** | Via Stellar Expert API (third-party) | Direct contract call — no intermediary |
| **Ownership of record** | Controlled by Stellar Expert | Controlled by registry admin — admin can revoke |

**The key difference:** Stellar Expert tells you what a contract does (its ABI/spec). soroban-verify tells you what source code it was built from, with an on-chain record that anyone can independently audit by rebuilding the source themselves.

They are complementary tools. soroban-verify's web explorer already surfaces Soroban contract specs (via the on-chain ABI) alongside verification status.

## Trust Model & Limitations

**soroban-verify records claims — it does not cryptographically prove ownership.**

### What the registry does guarantee
- A verification record is a timestamped, on-chain claim: "address X
  asserts that source repo Y at commit Z, built with args W, produces WASM hash H."
  The admin can revoke any record, so records are not immutable.
- Anyone can independently confirm a claim by rebuilding the source themselves
  at the recorded commit and comparing the resulting hash with the one
  `stellar-verify check` reports — the registry doesn't ask you to trust it blindly.

### What it does *not* guarantee
Soroban's execution environment does not expose who deployed a given WASM hash —
there is no on-chain API to look up a contract's deployer, and multiple contract
instances can share a single WASM code entry, so "ownership" of a hash is not
even a well-defined concept at the protocol level. This means:

- **The registry cannot verify that a submitter actually deployed or controls
  the contract behind the WASM hash they're submitting for.** Submissions are
  first-come, first-served: whoever submits a hash first "wins," with no proof
  of ownership required.
- A malicious actor could theoretically front-run a legitimate developer by
  submitting a fake source/commit pairing for a hash before the real developer
  does.

### How this is mitigated today
- The registry **admin can revoke** any verification record
  (`RegistryContract::revoke`) if it's reported as incorrect or malicious.
- If you believe a verification is wrong, please
  [open an issue](../../issues/new?template=incorrect_verification.md)
  reporting it, including the WASM hash and why you believe it's incorrect.
- The web explorer displays the submitter's address and submission timestamp
  alongside every record — always check these, and independently rebuild
  the source yourself for anything security-critical, rather than trusting
  a "✅ Source Claim Recorded" badge alone.

### Where this is headed
A stronger model — cryptographic attestation via a signing key embedded in the
WASM's own metadata (similar in spirit to Stellar's SEP-0048 draft) — is worth
pursuing as this project matures, since it would let the registry verify
ownership without relying on Soroban exposing deployer info. Contributions
toward this are welcome; see [open issues](../../issues).

### Build Verification Is Not Yet End-to-End

**The CLI currently records build claims — it does not yet independently
verify them.**

`stellar-verify verify` hashes a WASM artifact you provide (or fetches an
existing hash from-chain) and submits it to the registry along with the
`source_repo`, `source_commit`, and `build_args` you report. It does
**not** currently:

- Check out the given source at the given commit itself
- Rebuild the WASM using a pinned, reproducible toolchain
- Compare its own build's hash against the one being submitted

This means a submitted verification is currently a **claim about how the
WASM was built**, not a cryptographic confirmation that the claim is true.
A pinned Rust toolchain (`rust-toolchain.toml`) is present in this repo,
which helps independent rebuilds reproduce identical bytes — but the CLI
itself does not yet perform the rebuild.

**What this means in practice:** treat "✅ Source Claim Recorded" as "a build recipe
was recorded," not "this recipe was confirmed to produce this exact WASM."
For anything security-critical, independently rebuild the source yourself
using the recorded `source_commit` and `build_args`, and compare the
resulting hash to the WASM hash on-chain.

True end-to-end build verification — where the CLI itself performs the
rebuild and only submits on a hash match — is tracked in
[#7](../../issues/7) and is a priority for this project's next phase.

## Repository Structure

```
soroban-verify/
├── contracts/
│   └── registry/           # Soroban registry contract (Rust)
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs       # Contract entrypoint
│           ├── types.rs     # Data types & storage keys
│           └── test.rs      # Contract tests
├── cli/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts         # CLI entrypoint (commander)
│       ├── commands/
│       │   ├── verify.ts    # `stellar-verify verify` command
│       │   ├── check.ts     # `stellar-verify check` command
│       │   └── lookup.ts    # `stellar-verify lookup` command
│       └── lib/
│           ├── hash.ts      # WASM hash computation
│           ├── hash.test.ts # Unit tests for hash.ts
│           └── config.ts    # Network config builder
├── web/
│   ├── package.json
│   ├── next.config.js
│   └── src/
│       ├── app/
│       │   ├── page.tsx          # Landing / search
│       │   └── contract/
│       │       └── [address]/
│       │           └── page.tsx  # Contract detail page
│       ├── components/
│       │   ├── VerificationBadge.tsx
│       │   ├── ContractSpec.tsx
│       │   └── SearchBar.tsx
│       └── lib/
│           └── registry.ts  # Registry contract client
├── sdk/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── types.ts         # Shared types
│       └── client.ts        # Registry contract client factory
├── docs/
│   ├── architecture.md
│   ├── contributing.md
│   └── deploying.md
├── DEPLOY.md                # Quick-start deploy guide (root)
├── .github/
│   ├── workflows/
│   │   ├── ci.yml           # Build + test on every PR
│   │   └── deploy.yml       # Deploy contract to testnet
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md
│       └── feature_request.md
├── Cargo.toml               # Rust workspace + release profiles
├── CHANGELOG.md        # Append-only change log
└── README.md
```

## CLI Reference

The binary is `stellar-verify` (`cli/dist/index.js`). Run it with `node dist/index.js` from `cli/`, or define a shortcut once per shell:

```bash
alias stellar-verify="node $(pwd)/dist/index.js"     # run inside cli/
```

```
stellar-verify [global options] <command> [options]

Global options:
  -n, --network <network>   testnet | mainnet            [default: testnet]
      --rpc-url <url>       Override the Stellar RPC URL
      --registry-id <id>    Override the registry contract address
  -V, --version / -h, --help

Commands:
  verify    Submit a source-verification record
              -c, --contract <address>   contract to register (required)
              -s, --source <url>         public source repo URL (required)
                  --commit <sha>         commit that produced the WASM (required)
              -b, --build-args <args>    build command  [default: cargo build --release --target wasm32v1-none]
                  --wasm <path>          local .wasm; its hash must equal the on-chain hash
  check     Check whether a contract has a record
              -c, --contract <address>   (required)
  lookup    Look up a record by WASM hash
                  --hash <wasm-hash>     64-char hex; a 0x prefix and uppercase are accepted
                  --json                 print raw JSON
```

Environment variables:

| Variable | Purpose |
|---|---|
| `REGISTRY_TESTNET_ID` | Registry contract address on testnet (or use `--registry-id`) |
| `REGISTRY_MAINNET_ID` | Registry contract address on mainnet |
| `STELLAR_SECRET_KEY` | Signing key for `verify`. Environment only; there is no flag for it |

The CLI loads a `.env` file from the directory you run it in (`.env` is git-ignored). Keep real keys out of it.

## Contributing 

See [docs/contributing.md](docs/contributing.md).

## License

MIT — see [LICENSE](LICENSE).
