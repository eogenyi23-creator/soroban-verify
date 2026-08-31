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
