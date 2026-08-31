//! soroban-verify Registry Contract
//!
//! An on-chain registry that maps Soroban contract WASM hashes to their
//! human-readable source verification records — Etherscan-style contract
//! verification, native to Stellar.
//!
//! # Storage layout
//!
//! - `DataKey::Verification(wasm_hash)` → `VerificationRecord`  (persistent)
//! - `DataKey::SubmitterIndex(address)` → `Vec<String>`  (persistent)
//! - `DataKey::Admin`                   → `Address`       (instance)
//! - `DataKey::Count`                   → `u32`           (instance)

#![no_std]

mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractimpl, contractmeta, symbol_short, vec, Address, Env, String, Vec,
};
use types::{DataKey, RegistryError, VerificationRecord};

// Embed contract metadata visible via `stellar contract info`.
contractmeta!(
    key = "Description",
    val = "On-chain source-verification registry for Soroban contracts"
);
contractmeta!(key = "Version", val = "0.1.0");

/// Persistent storage TTL bump: keep records alive for ~1 year of ledgers.
/// Stellar produces ~1 ledger / 5 seconds → 6_307_200 ledgers / year.
const PERSISTENT_BUMP_AMOUNT: u32 = 6_307_200;
const PERSISTENT_BUMP_THRESHOLD: u32 = 6_307_200 / 2;

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    // ─────────────────────────────────────────────────────────────────────────
    // Initialisation
    // ─────────────────────────────────────────────────────────────────────────

    /// Initialise the registry with an admin address.
    ///
    /// Can only be called once. The admin can revoke malicious or incorrect
    /// verifications.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Count, &0u32);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Write: submit a verification
    // ─────────────────────────────────────────────────────────────────────────

    /// Submit a source-verification record for a given WASM hash.
    ///
    /// # Arguments
    ///
    /// * `submitter`     - Address that signs this transaction.
    /// * `wasm_hash`     - SHA-256 of the deployed WASM bytecode (hex, 64 chars).
    /// * `source_repo`   - Public URL of the source repository.
    /// * `source_commit` - Full git commit SHA compiled to produce the WASM.
    /// * `build_args`    - Build invocation (e.g. `cargo build --release --target wasm32v1-none`).
    ///
    /// # Errors
    ///
    /// Returns `RegistryError::AlreadyVerified` if a record for `wasm_hash` already exists.
    /// Returns `RegistryError::InvalidInput` if any string field is empty.
    pub fn submit(
        env: Env,
        submitter: Address,
        wasm_hash: String,
        source_repo: String,
        source_commit: String,
        build_args: String,
    ) -> Result<(), RegistryError> {
        // Require the submitter to sign.
        submitter.require_auth();

        // Validate inputs.
        if wasm_hash.len() == 0
            || source_repo.len() == 0
            || source_commit.len() == 0
            || build_args.len() == 0
        {
            return Err(RegistryError::InvalidInput);
        }

        // Reject duplicate verifications.
        let key = DataKey::Verification(wasm_hash.clone());
        if env.storage().persistent().has(&key) {
            return Err(RegistryError::AlreadyVerified);
        }

        let record = VerificationRecord {
            wasm_hash: wasm_hash.clone(),
            source_repo,
            source_commit,
            build_args,
            submitted_by: submitter.clone(),
            submitted_at: env.ledger().sequence(),
        };

        // Store the verification record with a ~1-year TTL.
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_BUMP_THRESHOLD, PERSISTENT_BUMP_AMOUNT);

        // Update submitter index.
        let idx_key = DataKey::SubmitterIndex(submitter.clone());
        let mut hashes: Vec<String> = env
            .storage()
            .persistent()
            .get(&idx_key)
            .unwrap_or_else(|| vec![&env]);
        hashes.push_back(wasm_hash.clone());
        env.storage().persistent().set(&idx_key, &hashes);
        env.storage().persistent().extend_ttl(
            &idx_key,
            PERSISTENT_BUMP_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        // Bump total count.
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Count, &(count + 1));

        // Emit event.
        env.events().publish(
            (symbol_short!("verified"), submitter),
            wasm_hash,
        );

        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Write: revoke a verification (admin only)
    // ─────────────────────────────────────────────────────────────────────────

    /// Revoke a previously submitted verification record.
    ///
    /// Only the admin can call this. Used to remove incorrect or malicious records.
    ///
    /// # Errors
    ///
    /// Returns `RegistryError::Unauthorized` if caller is not the admin.
    /// Returns `RegistryError::NotFound` if no record exists for `wasm_hash`.
    pub fn revoke(env: Env, wasm_hash: String) -> Result<(), RegistryError> {
        // Only the admin may revoke.
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        let key = DataKey::Verification(wasm_hash.clone());
        if !env.storage().persistent().has(&key) {
            return Err(RegistryError::NotFound);
        }

        env.storage().persistent().remove(&key);

        // Decrement count (saturating to avoid underflow).
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Count, &count.saturating_sub(1));

        // Emit event.
        env.events()
            .publish((symbol_short!("revoked"), admin), wasm_hash);

        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read: query the registry
    // ─────────────────────────────────────────────────────────────────────────

    /// Look up the verification record for a given WASM hash.
    ///
    /// Returns `None` if no verification exists.
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

    /// Return `true` if the given WASM hash has a verification record.
    pub fn is_verified(env: Env, wasm_hash: String) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Verification(wasm_hash))
    }

    /// Return all WASM hashes submitted by a given address.
    pub fn get_by_submitter(env: Env, submitter: Address) -> Vec<String> {
        let key = DataKey::SubmitterIndex(submitter);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| vec![&env])
    }

    /// Return the total number of verified contracts in the registry.
    pub fn count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0)
    }

    /// Return the current admin address.
    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized")
    }
}
