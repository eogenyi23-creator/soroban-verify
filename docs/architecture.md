# Architecture

## Overview

soroban-verify is a three-layer system connecting deployed Soroban contracts to their source code, with full on-chain verifiability.

```
┌─────────────────────────────────────────────────────────────┐
│                     soroban-verify                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  web/        │  │  cli/        │  │  sdk/            │  │
│  │  Next.js     │  │  stellar-    │  │  @soroban-       │  │
│  │  Explorer    │  │  verify CLI  │  │  verify/sdk      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                  │                   │            │
│         └──────────────────┴───────────────────┘            │
│                            │                                │
│                    ┌───────▼────────┐                       │
│                    │  Stellar RPC   │                       │
│                    │  (Soroban RPC) │                       │
│                    └───────┬────────┘                       │
│                            │                                │
│              ┌─────────────▼──────────────┐                 │
│              │   Stellar Network           │                 │
│              │                            │                 │
│              │  ┌─────────────────────┐   │                 │
│              │  │  Registry Contract  │   │                 │
│              │  │  (soroban-verify-   │   │                 │
│              │  │   registry)         │   │                 │
│              │  │                     │   │                 │
│              │  │  wasm_hash →        │   │                 │
│              │  │    VerificationRec  │   │                 │
│              │  └─────────────────────┘   │                 │
│              │                            │                 │
│              │  ┌─────────────────────┐   │                 │
│              │  │  Target Contract    │   │                 │
│              │  │  (any contract)     │   │                 │
│              │  │                     │   │                 │
│              │  │  spec (ABI)         │   │                 │
│              │  │  stored on-chain    │   │                 │
│              │  └─────────────────────┘   │                 │
│              └────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## Registry Contract

The registry contract is deployed once per network. It stores:

- `DataKey::Verification(wasm_hash)` → `VerificationRecord` in **persistent storage**
- `DataKey::SubmitterIndex(address)` → `Vec<String>` (hashes) in **persistent storage**
- `DataKey::Admin` → `Address` in **instance storage**
- `DataKey::Count` → `u32` in **instance storage**

### Why WASM hash as the key?

On Stellar, multiple contract instances can share the same uploaded WASM. The WASM hash is therefore the canonical identifier for a piece of code, independent of which address deployed it. A single verification record covers all contracts sharing that WASM.

### TTL management

Soroban uses a time-to-live (TTL) model for storage. Records are set with a ~1-year TTL (`PERSISTENT_BUMP_AMOUNT = 6_307_200` ledgers) and extended on every read. This ensures active records don't expire.

## Data Flow: Submitting a Verification

```
Developer
  │
  ├── 1. Build: cargo build --target wasm32v1-none --release
  │
  ├── 2. CLI resolves WASM hash
  │        Either: SHA-256(local .wasm file)
  │        Or:     fetch from on-chain CONTRACT_CODE ledger entry
  │
  ├── 3. CLI checks registry: is_verified(wasm_hash)?
  │        If yes → warn, exit
  │
  ├── 4. CLI submits: registry.submit(
  │        submitter, wasm_hash, source_repo, source_commit, build_args
  │      )
  │
  └── 5. On-chain event emitted: ("verified", submitter) → wasm_hash
```

## Data Flow: Checking a Contract

```
User / Tool
  │
  ├── 1. Provide contract address (C...)
  │
  ├── 2. Resolve WASM hash from network
  │        GET CONTRACT_CODE ledger entry for address
  │        Extract executable.wasm_hash
  │
  ├── 3. Query registry: get_verification(wasm_hash)
  │
  └── 4. Return VerificationRecord or null
```

## SDK Design

The `@soroban-verify/sdk` package is the shared data layer:

- **Types**: mirror on-chain structs (`VerificationRecord`, etc.)
- **Client factory**: `createRegistryClient(config)` returns a typed client
- **`resolveWasmHash`**: utility to fetch a contract's WASM hash from the network

Both the CLI and the Next.js server components use this package, avoiding duplication.

## ABI Display

Soroban stores every contract's interface types (analogous to Ethereum ABIs) in the WASM's custom section, on-chain from day one. The web explorer uses `@stellar/stellar-sdk`'s `contract.Client.from()` to fetch and parse these types dynamically — no secondary API needed.
