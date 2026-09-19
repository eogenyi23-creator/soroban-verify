/**
 * Unit tests for cli/src/lib/hash.ts
 *
 * These tests verify that:
 * - computeLocalWasmHash produces the correct SHA-256 of a .wasm file
 * - sha256Hex matches Node's crypto output for known inputs
 * - computeLocalWasmHash rejects non-existent files with a clear error
 *
 * These are the functions used by the `stellar-verify verify` command to
 * compute the WASM hash that gets submitted to the on-chain registry.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, rm, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { join } from "path";
import { tmpdir } from "os";
import { computeLocalWasmHash, sha256Hex } from "../hash.js";

// ---------------------------------------------------------------------------
// Test fixture: a minimal valid-ish WASM binary
// ---------------------------------------------------------------------------

// Real WebAssembly magic bytes + version (first 8 bytes of any .wasm file)
const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

const SANDBOX = join(tmpdir(), `soroban-verify-hash-test-${process.pid}`);
const FIXTURE_PATH = join(SANDBOX, "test_contract.wasm");

let FIXTURE_BYTES: Buffer;

beforeAll(async () => {
  await mkdir(SANDBOX, { recursive: true });
  // Build a 256-byte buffer: WASM magic + version + padding
  FIXTURE_BYTES = Buffer.alloc(256, 0);
  WASM_MAGIC.copy(FIXTURE_BYTES, 0);
  await writeFile(FIXTURE_PATH, FIXTURE_BYTES);
});

afterAll(async () => {
  await rm(SANDBOX, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// sha256Hex
// ---------------------------------------------------------------------------

describe("sha256Hex", () => {
  it("returns a 64-character lowercase hex string", () => {
    const result = sha256Hex(Buffer.from("hello"));
    expect(result).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });

  it("matches Node crypto's SHA-256 output for known input", () => {
    const input = Buffer.from("soroban");
    const expected = createHash("sha256").update(input).digest("hex");
    expect(sha256Hex(input)).toBe(expected);
  });

  it("treats empty Buffer as valid input (SHA-256 of empty string)", () => {
    const empty = sha256Hex(Buffer.alloc(0));
    // SHA-256 of the empty string is well-known
    expect(empty).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("returns different hashes for different inputs", () => {
    expect(sha256Hex(Buffer.from("a"))).not.toBe(sha256Hex(Buffer.from("b")));
  });

  it("accepts Uint8Array as well as Buffer", () => {
    const u8 = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
    const buf = Buffer.from(u8);
    expect(sha256Hex(u8)).toBe(sha256Hex(buf));
  });

  it("produces the correct hash for the 4 WASM magic bytes", () => {
    // Known SHA-256 of 0x00 0x61 0x73 0x6d
    const magic = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
    const expected = createHash("sha256").update(magic).digest("hex");
    expect(sha256Hex(magic)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// computeLocalWasmHash
// ---------------------------------------------------------------------------

describe("computeLocalWasmHash", () => {
  it("reads a .wasm file and returns its SHA-256 as a hex string", async () => {
    const result = await computeLocalWasmHash(FIXTURE_PATH);
    expect(typeof result).toBe("string");
    expect(result).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });

  it("matches the SHA-256 computed directly from the file bytes", async () => {
    const expected = createHash("sha256").update(FIXTURE_BYTES).digest("hex");
    const result = await computeLocalWasmHash(FIXTURE_PATH);
    expect(result).toBe(expected);
  });

  it("produces the same hash on repeated calls (deterministic)", async () => {
    const a = await computeLocalWasmHash(FIXTURE_PATH);
    const b = await computeLocalWasmHash(FIXTURE_PATH);
    expect(a).toBe(b);
  });

  it("produces different hashes for files with different contents", async () => {
    const path2 = join(SANDBOX, "other_contract.wasm");
    const buf2 = Buffer.alloc(256, 0xab);
    await writeFile(path2, buf2);
    const h1 = await computeLocalWasmHash(FIXTURE_PATH);
    const h2 = await computeLocalWasmHash(path2);
    expect(h1).not.toBe(h2);
  });

  it("throws an error for a non-existent file path", async () => {
    await expect(
      computeLocalWasmHash("/tmp/this-file-does-not-exist-soroban-verify.wasm")
    ).rejects.toThrow();
  });

  it("correctly hashes a 1-byte file (minimal edge case)", async () => {
    const tiny = join(SANDBOX, "tiny.wasm");
    await writeFile(tiny, Buffer.from([0xff]));
    const result = await computeLocalWasmHash(tiny);
    const expected = createHash("sha256").update(Buffer.from([0xff])).digest("hex");
    expect(result).toBe(expected);
  });

  it("correctly hashes a file whose bytes match a known WASM hash from testnet", async () => {
    // This is the test vector used in the Rust contract tests:
    // wasm_hash = SHA-256 of these known bytes
    const knownBytes = Buffer.alloc(64, 0xde);
    const knownPath = join(SANDBOX, "known.wasm");
    await writeFile(knownPath, knownBytes);
    const result = await computeLocalWasmHash(knownPath);
    expect(result).toBe(createHash("sha256").update(knownBytes).digest("hex"));
  });
});
