/**
 * Shared TypeScript types for soroban-verify.
 *
 * These mirror the on-chain `VerificationRecord` struct defined in
 * contracts/registry/src/types.rs.
 */

/** The Stellar network to target. */
export type StellarNetwork = "testnet" | "mainnet";

/** Network configuration. */
export interface NetworkConfig {
  network: StellarNetwork;
  rpcUrl: string;
  networkPassphrase: string;
  registryContractId: string;
}

/** Well-known network presets. */
export const NETWORKS: Record<StellarNetwork, Omit<NetworkConfig, "registryContractId">> = {
  testnet: {
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  mainnet: {
    network: "mainnet",
    rpcUrl: "https://mainnet.sorobanrpc.com",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
};

/**
 * A source-verification record as returned by the registry contract.
 * Mirrors the on-chain `VerificationRecord` struct.
 */
export interface VerificationRecord {
  /** SHA-256 of the deployed WASM bytecode (hex string, 64 chars). */
  wasmHash: string;
  /** Public URL of the source repository. */
  sourceRepo: string;
  /** Full git commit SHA that was compiled to produce the WASM. */
  sourceCommit: string;
  /** Build invocation, e.g. "cargo build --release --target wasm32v1-none". */
  buildArgs: string;
  /** Stellar address that submitted the verification. */
  submittedBy: string;
  /** Stellar ledger sequence number at the time of submission. */
  submittedAt: number;
}

/** Result of a verification lookup. */
export type VerificationResult =
  | { verified: true; record: VerificationRecord }
  | { verified: false; record: null };

/** Input for submitting a new verification. */
export interface SubmitVerificationInput {
  /** The contract address to verify (C... address on Stellar). */
  contractAddress: string;
  /** WASM hash (auto-computed if not provided). */
  wasmHash?: string;
  /** Public source repository URL. */
  sourceRepo: string;
  /** Git commit SHA. */
  sourceCommit: string;
  /** Build command used. */
  buildArgs: string;
  /** Secret key of the submitter (for signing the transaction). */
  signerSecretKey: string;
}

/** Response from a submit call. */
export interface SubmitResult {
  success: boolean;
  txHash: string;
  wasmHash: string;
}
