# Contributing to soroban-verify

Thanks for your interest in contributing! This project is part of the Stellar Wave Program.

## Prerequisites

- [Rust](https://rustup.rs/) stable + `wasm32v1-none` target  
  ```bash
  rustup target add wasm32v1-none
  ```
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (`stellar`)
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 8+

## Project structure

| Directory | Language | Purpose |
|-----------|----------|---------|
| `contracts/registry` | Rust | On-chain Soroban registry contract |
| `cli/` | TypeScript | `stellar-verify` CLI tool |
| `web/` | TypeScript / Next.js | Contract explorer web app |
| `sdk/` | TypeScript | Shared types and RPC helpers |

## Development workflow

### Contract

```bash
# Run tests
cargo test --manifest-path contracts/registry/Cargo.toml

# Build WASM
cargo build --manifest-path contracts/registry/Cargo.toml \
  --target wasm32v1-none --release
```

### SDK

```bash
cd sdk
pnpm install
pnpm build    # compile TypeScript
pnpm test     # run vitest tests
```

### CLI

```bash
cd cli
pnpm install
pnpm build
# Run in dev mode
pnpm dev -- check --contract CAAAA...
```

### Web

```bash
cd web
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build
```

## Environment variables

Copy `.env.example` to `.env` in the `cli/` and `web/` directories:

```env
# Registry contract IDs (set after deploying)
REGISTRY_TESTNET_ID=C...
REGISTRY_MAINNET_ID=C...

# For CLI verification submissions
STELLAR_SECRET_KEY=S...
```

## Opening a PR

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Add tests for new functionality
4. Run the full test suite: `cargo test` + `pnpm test`
5. Open a PR against `main`

## Good first issues

Issues tagged [`good first issue`](https://github.com/eogenyi23-creator/soroban-verify/issues?q=label%3A%22good+first+issue%22) are a great starting point.

## Code style

- **Rust**: `cargo fmt` + `cargo clippy`
- **TypeScript**: ESLint + Prettier (configured in each package)

## License

MIT. By contributing you agree your code will be licensed under MIT.
