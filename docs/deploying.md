# Deploying the Registry Contract

This guide walks you through deploying the soroban-verify registry contract to Stellar testnet or mainnet.

## Prerequisites

- [Stellar CLI](https://developers.stellar.org/docs/tools/cli) installed
- A funded Stellar account (for testnet, use friendbot)
- Rust + `wasm32v1-none` target

## Step 1: Build the WASM

```bash
cargo build \
  --manifest-path contracts/registry/Cargo.toml \
  --target wasm32v1-none \
  --release
```

The WASM will be at:
```
target/wasm32v1-none/release/soroban_verify_registry.wasm
```

## Step 2: Configure your identity

```bash
# Add your deployer key
stellar keys add deployer --secret-key

# Fund on testnet (skip for mainnet)
stellar keys fund deployer --network testnet
```

## Step 3: Upload WASM to the network

```bash
WASM_HASH=$(stellar contract upload \
  --network testnet \
  --source deployer \
  --wasm target/wasm32v1-none/release/soroban_verify_registry.wasm)

echo "WASM hash: $WASM_HASH"
```

## Step 4: Deploy the contract

```bash
CONTRACT_ID=$(stellar contract deploy \
  --network testnet \
  --source deployer \
  --wasm-hash "$WASM_HASH")

echo "Contract ID: $CONTRACT_ID"
```

## Step 5: Initialize the contract

```bash
ADMIN_ADDRESS=$(stellar keys address deployer)

stellar contract invoke \
  --network testnet \
  --source deployer \
  --id "$CONTRACT_ID" \
  -- initialize \
  --admin "$ADMIN_ADDRESS"
```

## Step 6: Configure the CLI and web

Set the contract ID in your environment:

```bash
# .env in cli/ and web/
REGISTRY_TESTNET_ID=<your contract ID>
```

Or use the `--registry-id` CLI flag:

```bash
stellar-verify check --contract C... --registry-id "$CONTRACT_ID"
```

## Verifying the deployment

```bash
# Check the admin is set
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id "$CONTRACT_ID" \
  -- admin

# Check the count (should be 0)
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id "$CONTRACT_ID" \
  -- count
```

## Automated deployment via GitHub Actions

The `.github/workflows/deploy.yml` workflow automates the above. Set these secrets in your repo:

| Secret | Description |
|--------|-------------|
| `DEPLOYER_SECRET_KEY` | Stellar secret key for the deployer account |

Then trigger the workflow manually from the Actions tab, selecting `testnet` or `mainnet`.
