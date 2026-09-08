#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    Address, Env, String,
};

fn setup_env() -> (Env, RegistryContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(RegistryContract, ());
    let client = RegistryContractClient::new(&env, &contract_id);
    (env, client)
}

fn s(env: &Env, val: &str) -> String {
    String::from_str(env, val)
}

#[test]
fn test_initialize() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.count(), 0);
}

/// Verify that initialize() enforces admin consent via require_auth().
///
/// Uses `mock_auths` (not `mock_all_auths`) so we can deliberately omit the
/// admin's signature and confirm the contract panics with an auth error.
#[test]
#[should_panic]
fn test_initialize_requires_admin_auth() {
    let env = Env::default();
    // Deliberately do NOT call env.mock_all_auths() — no auth mocks at all.
    // The contract calls admin.require_auth(), which will panic when no
    // matching authorization is present.
    let contract_id = env.register(RegistryContract, ());
    let client = RegistryContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    // This must panic because the admin has not authorized this call.
    client.initialize(&admin);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialize_panics() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    client.initialize(&admin);
}

#[test]
fn test_submit_and_lookup() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let submitter = Address::generate(&env);
    client.initialize(&admin);

    let wasm_hash = s(&env, "6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b");
    let source_repo = s(&env, "https://github.com/example/my-contract");
    let source_commit = s(&env, "abc123def456");
    let build_args = s(&env, "cargo build --release --target wasm32v1-none");

    // submit returns () on success in the generated test client (panics on error)
    client.submit(
        &submitter,
        &wasm_hash,
        &source_repo,
        &source_commit,
        &build_args,
    );

    assert_eq!(client.count(), 1);
    assert!(client.is_verified(&wasm_hash));

    let record = client.get_verification(&wasm_hash).unwrap();
    assert_eq!(record.wasm_hash, wasm_hash);
    assert_eq!(record.source_repo, source_repo);
    assert_eq!(record.source_commit, source_commit);
    assert_eq!(record.build_args, build_args);
    assert_eq!(record.submitted_by, submitter);
}

#[test]
fn test_get_by_submitter() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let submitter = Address::generate(&env);
    client.initialize(&admin);

    let hash1 = s(&env, "aaaa000000000000000000000000000000000000000000000000000000000001");
    let hash2 = s(&env, "bbbb000000000000000000000000000000000000000000000000000000000002");

    client.submit(
        &submitter,
        &hash1,
        &s(&env, "https://github.com/example/repo1"),
        &s(&env, "commit1"),
        &s(&env, "cargo build --release"),
    );
    client.submit(
        &submitter,
        &hash2,
        &s(&env, "https://github.com/example/repo2"),
        &s(&env, "commit2"),
        &s(&env, "cargo build --release"),
    );

    let hashes = client.get_by_submitter(&submitter);
    assert_eq!(hashes.len(), 2);
}

#[test]
fn test_submit_duplicate_returns_error() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let submitter = Address::generate(&env);
    client.initialize(&admin);

    let wasm_hash = s(&env, "6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b");

    client.submit(
        &submitter,
        &wasm_hash,
        &s(&env, "https://github.com/example/repo"),
        &s(&env, "abc123"),
        &s(&env, "cargo build --release"),
    );

    // Use try_submit for error-path test — returns Result
    let result = client.try_submit(
        &submitter,
        &wasm_hash,
        &s(&env, "https://github.com/example/repo"),
        &s(&env, "abc123"),
        &s(&env, "cargo build --release"),
    );

    assert_eq!(
        result,
        Err(Ok(RegistryError::AlreadyVerified))
    );
}

#[test]
fn test_submit_empty_fields_returns_error() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let submitter = Address::generate(&env);
    client.initialize(&admin);

    let result = client.try_submit(
        &submitter,
        &s(&env, ""),
        &s(&env, "https://github.com/example/repo"),
        &s(&env, "abc123"),
        &s(&env, "cargo build --release"),
    );
    assert_eq!(result, Err(Ok(RegistryError::InvalidInput)));
}

#[test]
fn test_revoke() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    let submitter = Address::generate(&env);
    client.initialize(&admin);

    let wasm_hash = s(&env, "6ddb28e0980f643bb97350f7e3bacb0ff1fe74d846c6d4f2c625e766210fbb5b");

    client.submit(
        &submitter,
        &wasm_hash,
        &s(&env, "https://github.com/example/repo"),
        &s(&env, "abc123"),
        &s(&env, "cargo build --release"),
    );

    assert!(client.is_verified(&wasm_hash));
    client.revoke(&wasm_hash); // panics on error
    assert!(!client.is_verified(&wasm_hash));
    assert_eq!(client.count(), 0);
}

#[test]
fn test_revoke_nonexistent_returns_error() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let result = client.try_revoke(&s(
        &env,
        "0000000000000000000000000000000000000000000000000000000000000000",
    ));
    assert_eq!(result, Err(Ok(RegistryError::NotFound)));
}

#[test]
fn test_unverified_hash_returns_none() {
    let (env, client) = setup_env();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let unknown = s(
        &env,
        "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    );
    assert!(client.get_verification(&unknown).is_none());
    assert!(!client.is_verified(&unknown));
}
