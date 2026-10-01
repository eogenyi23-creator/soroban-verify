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

---

## Verified Testnet Deployment

**Date deployed:** 2026-09-30

**Contract ID:** `CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO`

**Explorer link:** https://lab.stellar.org/r/testnet/contract/CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO

---

### Steps executed

**Step 1 — Build WASM**

```
$ cargo build --manifest-path contracts/registry/Cargo.toml --target wasm32v1-none --release
   Compiling soroban-verify-registry v0.1.0 (...)
    Finished `release` profile [optimized] target(s) in 1m 04s

$ ls -lh target/wasm32v1-none/release/soroban_verify_registry.wasm
-rwxrwxrwx 2 codespace codespace 17K Sep 30 14:53 target/wasm32v1-none/release/soroban_verify_registry.wasm
```

**Step 2 — Generate and fund deployer identity**

```
$ stellar keys generate deployer --network testnet --fund
✅ Key saved with alias deployer in "/home/codespace/.config/stellar/identity/deployer.toml"
✅ Account deployer funded on "Test SDF Network ; September 2015"

$ stellar keys address deployer
GA3E4QUBCD6VNFM7M4KJHPWN5N4WDAQTDBXMROVSFKM3STSO35IBA3TN
```

**Step 3 — Upload WASM**

```
$ stellar contract upload \
  --network testnet \
  --source deployer \
  --wasm target/wasm32v1-none/release/soroban_verify_registry.wasm
ℹ️  Simulating transaction…
ℹ️  Signing transaction: 913bd8b322427b05d449ef5c3e864b6fc9e3935c043197792e8d85e2cf6dc770
🌎 Sending transaction…
✅ Transaction submitted successfully!
🔗 https://stellar.expert/explorer/testnet/tx/913bd8b322427b05d449ef5c3e864b6fc9e3935c043197792e8d85e2cf6dc770
42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5
```

WASM hash: `42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5`

**Step 4 — Deploy contract instance**

```
$ stellar contract deploy \
  --network testnet \
  --source deployer \
  --wasm-hash 42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5
ℹ️  Deploying contract using wasm hash 42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5
ℹ️  Simulating transaction…
ℹ️  Signing transaction: e6ce5bcb010809765c12a91cb1564235d26b34d5f76e66170ff40a73e853f805
🌎 Sending transaction…
✅ Transaction submitted successfully!
🔗 https://stellar.expert/explorer/testnet/tx/e6ce5bcb010809765c12a91cb1564235d26b34d5f76e66170ff40a73e853f805
🔗 https://lab.stellar.org/r/testnet/contract/CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO
✅ Deployed!
CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO
```

**Step 5 — Initialize contract**

```
$ stellar contract invoke \
  --network testnet \
  --source deployer \
  --id CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO \
  -- initialize \
  --admin GA3E4QUBCD6VNFM7M4KJHPWN5N4WDAQTDBXMROVSFKM3STSO35IBA3TN
ℹ️  Simulating transaction…
ℹ️  Signing transaction: 565b91c4f1a94f8e6c3394088bec204d3d1958c1d82f32ca5ceef7d30f3e1fe6
🌎 Sending transaction…
✅ Transaction submitted successfully!
🔗 https://stellar.expert/explorer/testnet/tx/565b91c4f1a94f8e6c3394088bec204d3d1958c1d82f32ca5ceef7d30f3e1fe6
```

**Step 6 — Confirm deployment**

```
$ stellar contract invoke --network testnet --source deployer \
  --id CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO -- admin
ℹ️  Simulation identified as read-only. Send by rerunning with `--send=yes`.
"GA3E4QUBCD6VNFM7M4KJHPWN5N4WDAQTDBXMROVSFKM3STSO35IBA3TN"

$ stellar contract invoke --network testnet --source deployer \
  --id CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO -- count
ℹ️  Simulation identified as read-only. Send by rerunning with `--send=yes`.
0
```

---

### Full CLI end-to-end example

**Hash (computed from local WASM):**
```
$ node cli/dist/index.js check \
  --contract CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO
- Checking CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO on testnet...
✖ ✗ Contract CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO is NOT source-verified.
  WASM hash: 42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5

  To submit a verification, run:
  stellar-verify verify --contract CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO --source <url> --commit <sha>
```

**Submit verification (original run — stellar-sdk v13.1.0):**

The original submission was made with stellar-sdk v13.1.0 using `--wasm` to supply the
local WASM file. The transaction succeeded on-chain, but the CLI's polling step threw
`Bad union switch: 4` due to an XDR incompatibility between sdk v13.1.0 and testnet
protocol v29. The record was confirmed on-chain via direct contract invocation
(see "Verify on-chain" block below).

**Submit verification (stellar-sdk v17.2.0 — polling fix confirmed, real CLI output):**

After upgrading to v17.2.0 and fixing the xdr accessor calls, the full CLI `verify`
flow was re-run against a new WASM hash (not previously registered) to prove the
polling step completes through the actual compiled CLI binary:

```
$ node cli/dist/index.js verify \
  --contract CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO \
  --source https://github.com/eogenyi23-creator/soroban-verify \
  --commit fix-cli-sdk-upgrade-e2e-verify \
  --build-args "cargo build --release --target wasm32v1-none" \
  --wasm /tmp/test_unique.wasm

🔍 soroban-verify — submitting verification on testnet

- Resolving WASM hash...
✔ WASM hash (local): 49b3149b5e0ef7d62546cca93ab49710dc79ddd83e08db4df47368d8e2f20acc
- Checking existing registry entry...
✔ No existing record found — proceeding.
- Submitting verification to the registry...
✔ Verification submitted!

Transaction: 4feda316bfa284896cdff01616a00dc8fd04a413ab6469c6bc2653ebb03fc2f0
WASM hash:    49b3149b5e0ef7d62546cca93ab49710dc79ddd83e08db4df47368d8e2f20acc
Source:       https://github.com/eogenyi23-creator/soroban-verify
Commit:       fix-cli-sdk-upgrade-e2e-verify
```

Exit 0. Polling step completed successfully — no `Bad union switch: 4`.

**Lookup confirms on-chain record:**

```
$ node cli/dist/index.js lookup \
  --hash 49b3149b5e0ef7d62546cca93ab49710dc79ddd83e08db4df47368d8e2f20acc
- Looking up hash 49b3149b5e0ef7d6... on testnet
✔ Verification record found!

WASM hash:     49b3149b5e0ef7d62546cca93ab49710dc79ddd83e08db4df47368d8e2f20acc
Source repo:   https://github.com/eogenyi23-creator/soroban-verify
Commit:        fix-cli-sdk-upgrade-e2e-verify
Build args:    cargo build --release --target wasm32v1-none
Submitted by: GDBX76SRLJDANJWADAOCAZBMGCLTTE42JAFH4IZBIEA6DXJKPTEK7RP5
Ledger:        4958758
```

**Verify on-chain (confirmed via stellar CLI):**
```
$ stellar contract invoke --network testnet --source deployer \
  --id CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO \
  -- get_verification \
  --wasm_hash 42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5
ℹ️  Simulation identified as read-only. Send by rerunning with `--send=yes`.
{"build_args":"cargo build --release --target wasm32v1-none","source_commit":"9519886a1c1a8d0ab169fc3496d99cacd050f7bf","source_repo":"https://github.com/eogenyi23-creator/soroban-verify","submitted_at":4951304,"submitted_by":"GA3E4QUBCD6VNFM7M4KJHPWN5N4WDAQTDBXMROVSFKM3STSO35IBA3TN","wasm_hash":"42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5"}
```

**Check command (read path works fine):**
```
$ node cli/dist/index.js check \
  --contract CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO
- Checking CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO on testnet...
✔ ✓ Contract CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO is source-verified!

WASM hash:     42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5
Source repo:   https://github.com/eogenyi23-creator/soroban-verify
Commit:        9519886a1c1a8d0ab169fc3496d99cacd050f7bf
Build args:    cargo build --release --target wasm32v1-none
Submitted by: GA3E4QUBCD6VNFM7M4KJHPWN5N4WDAQTDBXMROVSFKM3STSO35IBA3TN
Ledger:        4951304
```

**Lookup command:**
```
$ node cli/dist/index.js lookup \
  --hash 42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5
- Looking up hash 42b88b61faa5bbab... on testnet
✔ Verification record found!

WASM hash:     42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5
Source repo:   https://github.com/eogenyi23-creator/soroban-verify
Commit:        9519886a1c1a8d0ab169fc3496d99cacd050f7bf
Build args:    cargo build --release --target wasm32v1-none
Submitted by: GA3E4QUBCD6VNFM7M4KJHPWN5N4WDAQTDBXMROVSFKM3STSO35IBA3TN
Ledger:        4951304
```

The registry contract is live and fully functional on testnet. The read path (check,
lookup) and write path (verify/submit + polling) all work correctly through the CLI
after the stellar-sdk upgrade to v17.2.0 (branch: fix/cli-sdk-upgrade). The original
`Bad union switch: 4` XDR error is resolved.
