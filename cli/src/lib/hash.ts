/**
 * WASM hash computation utilities.
 *
 * Soroban identifies contract code by the SHA-256 hash of its WASM bytes,
 * returned as a 64-character hex string.
 */

import { createHash } from "crypto";
import { readFile } from "fs/promises";

/**
 * Compute the SHA-256 hash of a local .wasm file, matching what Soroban
 * stores on-chain when you run `stellar contract upload`.
 */
export async function computeLocalWasmHash(wasmPath: string): Promise<string> {
  const bytes = await readFile(wasmPath);
  return sha256Hex(bytes);
}

/**
 * Compute the SHA-256 hash of raw bytes, returned as a lowercase hex string.
 */
export function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Normalize a user-supplied WASM hash to the canonical form expected by the
 * registry contract: 64 lowercase hex characters, no "0x" prefix.
 *
 * Accepts:
 *   "0x6ddb28..."  → "6ddb28..."
 *   "6DDB28..."    → "6ddb28..."
 *   "0X6DDB28..."  → "6ddb28..."
 */
export function normalizeHash(hash: string): string {
  const stripped = hash.startsWith("0x") || hash.startsWith("0X")
    ? hash.slice(2)
    : hash;
  return stripped.toLowerCase();
}
