//! Storage key definitions and data types for the soroban-verify registry contract.

use soroban_sdk::{contracttype, contracterror, Address, String};

/// A single source-verification record stored on-chain.
///
/// Maps a WASM hash → the source code that produced it.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VerificationRecord {
    /// SHA-256 hash of the deployed WASM bytecode (hex string, 64 chars).
    pub wasm_hash: String,
    /// URL of the public source repository (e.g. "https://github.com/org/repo").
    pub source_repo: String,
    /// Full git commit SHA that was compiled.
    pub source_commit: String,
    /// Build arguments used (e.g. "--release --target wasm32v1-none").
    pub build_args: String,
    /// The Stellar address that submitted this verification.
    pub submitted_by: Address,
    /// Ledger number at submission time.
    pub submitted_at: u32,
}

/// Storage keys used by the registry contract.
#[contracttype]
pub enum DataKey {
    /// Verification record keyed by WASM hash (hex string).
    Verification(String),
    /// List of WASM hashes submitted by a given address.
    SubmitterIndex(Address),
    /// Admin address — the only account that can revoke verifications.
    Admin,
    /// Total number of verifications stored.
    Count,
}

/// Events emitted by the registry contract.
pub mod events {
    pub const VERIFIED: &str = "verified";
    pub const REVOKED: &str = "revoked";
}

/// Errors returned by the registry contract.
#[contracterror]
#[derive(Clone, Debug, Eq, PartialEq, Copy)]
pub enum RegistryError {
    /// A verification for this WASM hash already exists.
    AlreadyVerified = 1,
    /// No verification exists for the given WASM hash.
    NotFound = 2,
    /// Caller is not authorised to perform this action.
    Unauthorized = 3,
    /// One or more required fields are empty.
    InvalidInput = 4,
}
