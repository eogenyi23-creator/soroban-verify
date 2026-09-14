# Contributing to soroban-verify

Thank you for your interest in contributing to `soroban-verify`! This project acts as an on-chain source verification registry for Soroban smart contracts on the Stellar network.

This codebase spans two environments: Rust (for smart contracts) and Node/TypeScript/pnpm (for the toolkits, SDK, and web explorer UI). Please review the guidelines below to ensure a smooth contribution pipeline.

---

## 📂 Repository & Monorepo Structure

This project is managed as a set of decoupled workspaces:
* `contracts/registry/` - The core registry smart contract written in Rust.
* `cli/` - The `stellar-verify` TypeScript command-line program.
* `sdk/` - Shared TypeScript definitions and RPC clients utilized by the web UI and CLI.
* `web/` - The Next.js explorer UI for tracking verified contracts.

---

## 🛠️ Local Development Setup

### Prerequisites
* **Rust:** With the `wasm32v1-none` toolchain compilation target installed.
* **Stellar CLI:** For manual contract deployment or evaluation testing.
* **Node.js 20+** along with **pnpm 8+**.

### Workspace Installation
1. Fork the repository on GitHub, then clone your fork locally:
   ```bash
   git clone https://github.com
   cd soroban-verify
   ```
2. Install the JavaScript package workspaces from the repository root:
   ```bash
   pnpm install
   ```

---

## 🧪 Building and Testing Each Component

Before submitting a pull request, verify that your changes build smoothly and do not break existing logic.

### 1. Smart Contract Workflow (`contracts/registry/`)
Navigate into the contract workspace folder or manage your builds via the top-level manifest file:
* **Compile the contract target:**
  ```bash
  cargo build --manifest-path contracts/registry/Cargo.toml --target wasm32v1-none --release
  ```
* **Run contract unit tests:**
  ```bash
  cargo test --manifest-path contracts/registry/Cargo.toml
  ```

### 2. TypeScript CLI Workflow (`cli/`)
Verify that the `stellar-verify` CLI parses and builds correctly:
```bash
cd cli
pnpm build
```

### 3. Next.js Web Explorer Workflow (`web/`)
Launch the browser explorer UI layout to test layout components or state query lookups:
```bash
cd web
pnpm dev
```

---

## 📥 Pull Request (PR) Requirements

* **Target Branch Base:** Always ensure your feature branch stems from the latest `main` branch.
* **Descriptive Branch Names:** Use precise prefix schemas matching the component you alter (e.g., `feat/contract-revocation`, `fix/cli-rpc-retry`, or `docs/architecture-update`).
* **Atomic Modifications:** Keep pull requests tightly contained. Do not mix unrelated backend smart contract refactors with frontend Next.js component visual tweaks.
* **Testing and Verification:** If your work extends registry tracking states, cryptographic verification math, or helper utilities, add corresponding assertions inside `test.rs` or the related JavaScript test paths.
* **CI Build Verification:** Your contributions must clear the automated GitHub Actions pipeline (`ci.yml`) tracking compilation health across all modules.

---
