# soroban-verify

> On-chain source verification registry for Soroban smart contracts on Stellar — Etherscan-style verified contracts, native to Stellar.

[![CI](https://github.com/eogenyi23-creator/soroban-verify/actions/workflows/ci.yml/badge.svg)](https://github.com/eogenyi23-creator/soroban-verify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What is soroban-verify?

When you deploy a Soroban contract, anyone can see its WASM bytecode on-chain. But can they verify **what source code produced that bytecode**? That's the gap soroban-verify fills.

soroban-verify is a three-part system:

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
- ❌ **Unverified** — WASM hash known, no source linked yet

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
│           └── rpc.ts       # Stellar RPC helpers
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
│           ├── registry.ts  # Registry contract client
│           └── stellar.ts   # Stellar RPC helpers
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
├── .github/
│   ├── workflows/
│   │   ├── ci.yml           # Build + test on every PR
│   │   └── deploy.yml       # Deploy contract to testnet
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md
│       └── feature_request.md
├── Cargo.toml               # Rust workspace
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

See [docs/contributing.md](docs/contributing.md). Issues tagged `good first issue` are great starting points.

## License

MIT — see [LICENSE](LICENSE).
