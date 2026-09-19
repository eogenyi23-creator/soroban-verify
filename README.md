# soroban-verify

> On-chain source verification registry for Soroban smart contracts on Stellar — Etherscan-style verified contracts, native to Stellar.

[![CI](https://github.com/eogenyi23-creator/soroban-verify/actions/workflows/ci.yml/badge.svg)](https://github.com/eogenyi23-creator/soroban-verify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## End-to-End Example

Here is a real verification walkthrough. This is what soroban-verify is for.

### Step 1 — Build the contract locally

```bash
git clone https://github.com/stellar/soroban-examples
cd soroban-examples/hello_world
cargo build --target wasm32v1-none --release
```

This produces `target/wasm32v1-none/release/soroban_hello_world_contract.wasm`.

### Step 2 — Compute the WASM hash

```bash
sha256sum target/wasm32v1-none/release/soroban_hello_world_contract.wasm
# 6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b
```

This is the hash Stellar stores on-chain when you run `stellar contract upload`.
The registry contract maps exactly this hash to your source code.

### Step 3 — Check if the contract is already verified

```bash
stellar-verify check \
  --contract CAAAAA...YOUR_CONTRACT_ADDRESS \
  --network testnet

# Output:
# ✗ Contract CAAAAA... is NOT source-verified.
#   WASM hash: 6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b
```

### Step 4 — Submit a verification record

```bash
export STELLAR_SECRET_KEY="S...your-secret-key"

stellar-verify verify \
  --contract CAAAAA...YOUR_CONTRACT_ADDRESS \
  --source https://github.com/stellar/soroban-examples \
  --commit 3a7f2d1c9b4e5f8a0d6c2e1b9f4a7d3c8e5b2f1a \
  --build-args "cargo build --release --target wasm32v1-none" \
  --network testnet

# Output:
# ✓ Verification submitted!
# Transaction: a8f3c2e1b9d4f7a2c5e8b3d6f1a4c7e2b5d8f3a6
# WASM hash:   6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b
# Source:      https://github.com/stellar/soroban-examples
# Commit:      3a7f2d1c9b4e5f8a0d6c2e1b9f4a7d3c8e5b2f1a
```

### Step 5 — Verify the record is on-chain

```bash
stellar-verify lookup \
  --hash 6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b \
  --network testnet

# Output:
# ✓ Verification record found!
# WASM hash:     6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b
# Source repo:   https://github.com/stellar/soroban-examples
# Commit:        3a7f2d1c9b4e5f8a0d6c2e1b9f4a7d3c8e5b2f1a
# Build args:    cargo build --release --target wasm32v1-none
# Submitted by:  GCXXX...your-address
# Ledger:        54321
```

### Step 6 — Anyone can independently verify

```bash
# Check out the same commit
git clone https://github.com/stellar/soroban-examples
cd soroban-examples
git checkout 3a7f2d1c9b4e5f8a0d6c2e1b9f4a7d3c8e5b2f1a

# Build with the same args
cargo build --target wasm32v1-none --release

# Compare the hash
sha256sum target/wasm32v1-none/release/soroban_hello_world_contract.wasm
# → must match 6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b
```

If the hashes match, you have independently confirmed that the source code at that commit produces exactly the WASM deployed on-chain.

---

## What is soroban-verify?

When you deploy a Soroban contract, anyone can see its WASM bytecode on-chain. But can they verify **what source code produced that bytecode**? That's the gap soroban-verify fills.

soroban-verify is a four-part system:

| Component | Description |
|-----------|-------------|
| `contracts/registry` | A Soroban smart contract that stores WASM-hash → source verification records on-chain |
| `cli/` | A TypeScript CLI (`stellar-verify`) that builds your contract reproducibly, computes its WASM hash, and submits a verification record |
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
| **Independent re-verification** | Not supported | Built-in: `stellar-verify check` lets anyone rebuild and compare |
| **Verification permanence** | Depends on Stellar Expert's service | Stored with ~1-year ledger TTL in persistent storage |
| **Programmatic access** | Via Stellar Expert API (third-party) | Direct contract call — no intermediary |
| **Ownership of record** | Controlled by Stellar Expert | Controlled by registry admin + immutable once submitted |

**The key difference:** Stellar Expert tells you what a contract does (its ABI/spec). soroban-verify tells you what source code it was built from, with an on-chain record that anyone can independently audit by rebuilding the source themselves.

They are complementary tools. soroban-verify's web explorer already surfaces Soroban contract specs (via the on-chain ABI) alongside verification status.

## Trust Model & Limitations

**soroban-verify records claims — it does not cryptographically prove ownership.**

### What the registry does guarantee
- A verification record is an immutable, timestamped, on-chain claim: "address X
  asserts that source repo Y at commit Z, built with args W, produces WASM hash H."
- Anyone can independently confirm a claim by rebuilding the source themselves
  (`stellar-verify check`) and comparing the resulting hash — the registry doesn't
  ask you to trust it blindly.

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
  a "✅ Verified" badge alone.

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
Additionally, there is no pinned Rust toolchain version
(`rust-toolchain.toml`) in this repo yet, so even an independent rebuild
attempt by a third party is not guaranteed to reproduce identical bytes,
since Rust codegen can vary across compiler versions.

**What this means in practice:** treat "✅ Verified" as "a build recipe
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
│       │   ├── verify.ts    # `stellar-verify submit` command
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
├── Cargo.toml               # Rust workspace
├── EMMY_CHANGELOG.md        # Append-only change log
└── README.md
```

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) + `wasm32v1-none` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (`stellar`)
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 8+

### Build the registry contract

```bash
cd contracts/registry
cargo build --target wasm32v1-none --release
```

### Run the CLI

```bash
cd cli
pnpm install
pnpm build
# Submit a verification
pnpm start verify --contract <CONTRACT_ADDRESS> --source https://github.com/you/your-contract --commit <GIT_SHA>
```

### Run the web explorer

```bash
cd web
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## CLI Usage

```
stellar-verify <command> [options]

Commands:
  verify    Build a contract and submit a source verification to the registry
  check     Check if a contract address is source-verified
  lookup    Lookup all verifications for a given WASM hash

Options:
  --network   Stellar network (testnet | mainnet)  [default: testnet]
  --help      Show help
```

### Examples

```bash
# Check if a contract is verified
stellar-verify check --contract CAAAAA...

# Submit a new verification
stellar-verify verify \
  --contract CAAAAA... \
  --source https://github.com/you/contract \
  --commit abc123 \
  --network testnet

# Lookup by WASM hash
stellar-verify lookup --hash 6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b
```

## Contributing

See [docs/contributing.md](docs/contributing.md).

## License

MIT — see [LICENSE](LICENSE).
