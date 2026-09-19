# DEPLOY.md — Deploying soroban-verify to Stellar Testnet

This guide walks you through deploying the registry contract to Stellar testnet
from scratch. No live contract IDs are provided here — run the steps below and
you will get your own.

## Prerequisites

Install these tools before starting:

```bash
# 1. Rust + wasm target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none

# 2. Stellar CLI (latest release)
cargo install --locked stellar-cli --features opt

# 3. Node.js 20+ and pnpm
npm install -g pnpm
```

Verify:

```bash
rustc --version                  # rustc 1.xx.x
stellar --version                # stellar x.x.x
node --version                   # v20.x.x
```

## Step 1: Clone and build the WASM

```bash
git clone https://github.com/eogenyi23-creator/soroban-verify
cd soroban-verify

cargo build \
  --manifest-path contracts/registry/Cargo.toml \
  --target wasm32v1-none \
  --release
```

Expected output path:
```
target/wasm32v1-none/release/soroban_verify_registry.wasm
```

Verify the file exists and check its size (should be < 50 KB after `opt-level = "z"`):

```bash
ls -lh target/wasm32v1-none/release/soroban_verify_registry.wasm
```

## Step 2: Create a testnet identity

```bash
# Generate a new keypair and fund it from Stellar's testnet friendbot
stellar keys generate --global deployer --network testnet
stellar keys fund deployer --network testnet

# Confirm the account is funded
stellar keys address deployer
# → prints: GXXX...your-public-key
```

> **Security note:** The `deployer` key will be the initial admin of the
> registry. It can revoke malicious or incorrect verification records. Store
> it securely; do not commit it to source control.

## Step 3: Upload the WASM to testnet

```bash
WASM_HASH=$(stellar contract upload \
  --network testnet \
  --source deployer \
  --wasm target/wasm32v1-none/release/soroban_verify_registry.wasm)

echo "WASM hash: $WASM_HASH"
# → prints the 64-char hex SHA-256 of the WASM bytes
```

Save this hash — it identifies the exact version of the registry contract code.

## Step 4: Deploy a contract instance

```bash
CONTRACT_ID=$(stellar contract deploy \
  --network testnet \
  --source deployer \
  --wasm-hash "$WASM_HASH")

echo "Contract ID: $CONTRACT_ID"
# → prints: CXXX...your-contract-address
```

## Step 5: Initialize the contract

The contract must be initialized before any verifications can be submitted.
The deployer address becomes the registry admin.

```bash
ADMIN=$(stellar keys address deployer)

stellar contract invoke \
  --network testnet \
  --source deployer \
  --id "$CONTRACT_ID" \
  -- initialize \
  --admin "$ADMIN"
```

## Step 6: Confirm the deployment

```bash
# Check admin was set correctly
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id "$CONTRACT_ID" \
  -- admin
# → prints your deployer address

# Check the count is 0 (empty registry)
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id "$CONTRACT_ID" \
  -- count
# → 0
```

## Step 7: Configure the CLI

Set your contract ID so the CLI knows where the registry lives:

```bash
# In cli/.env (or export in shell)
REGISTRY_TESTNET_ID=<your CONTRACT_ID from step 4>
```

Or pass it per-command:

```bash
stellar-verify check \
  --contract CSOME_CONTRACT \
  --registry-id "$CONTRACT_ID" \
  --network testnet
```

## Step 8: Submit your first verification

```bash
export STELLAR_SECRET_KEY=$(stellar keys show deployer)  # or your own secret
export REGISTRY_TESTNET_ID=<your CONTRACT_ID>

# Build the CLI
cd cli && pnpm install && pnpm build && cd ..

# Submit a verification for the registry contract itself
./cli/dist/index.js verify \
  --contract "$CONTRACT_ID" \
  --source https://github.com/eogenyi23-creator/soroban-verify \
  --commit $(git rev-parse HEAD) \
  --build-args "cargo build --release --target wasm32v1-none" \
  --network testnet
```

## Automated Deployment via GitHub Actions

The `.github/workflows/deploy.yml` workflow automates steps 1–5. Configure
these secrets in your repo settings before running it:

| Secret | Description |
|--------|-------------|
| `DEPLOYER_SECRET_KEY` | Secret key of the deployer/admin account |

Then go to **Actions → Deploy Contract (Testnet) → Run workflow** and select
`testnet` or `mainnet`.

After the workflow runs, copy the printed `Contract ID` and set it as a
repository variable:

| Variable | Description |
|----------|-------------|
| `REGISTRY_TESTNET_ID` | Testnet contract ID (used by CI web build) |
| `REGISTRY_MAINNET_ID` | Mainnet contract ID (once you deploy there) |

## Mainnet Deployment

Mainnet deployment follows the same steps with two differences:

1. Replace `--network testnet` with `--network mainnet` everywhere
2. Fund the deployer account with real XLM instead of using friendbot

There is currently no mainnet deployment of soroban-verify. The contract is
being run on testnet while the verification model matures.

## Troubleshooting

**`stellar contract upload` hangs or fails with a timeout**

Testnet can be congested. Try again in a few minutes, or increase the fee:
```bash
stellar contract upload ... --fee 1000000
```

**`initialize` fails with "already initialized"**

The contract was already initialized. You cannot re-initialize; you must
re-deploy a fresh instance using steps 4–6.

**CLI fails with "No registry contract ID configured"**

Set `REGISTRY_TESTNET_ID` in your environment or pass `--registry-id`.

**`wasm32v1-none` target not found**

```bash
rustup target add wasm32v1-none
```
