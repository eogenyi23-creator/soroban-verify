/**
 * Unit tests for resolveWasmHash (sdk/src/client.ts)
 *
 * These tests verify the three v17 xdr API breaking-change fixes that live
 * inside resolveWasmHash:
 *
 *   1. xdr.ContractDataDurability.persistent  — singleton, not a factory call
 *   2. entry.contractData.val.instance.executable.wasmHash — all properties,
 *      not method calls
 *   3. wasmHash.toString()  — Hash.encoding = "hex", not Buffer.from(…)
 *
 * The mock does NOT mock resolveWasmHash itself.  It mocks only
 * rpc.Server.getLedgerEntries at the transport boundary, returning a
 * realistic v17-shaped XDR LedgerEntryResult constructed from live xdr.*
 * objects.  resolveWasmHash's internal XDR-parsing logic is fully executed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  xdr,
  Address,
  rpc,
} from "@stellar/stellar-sdk";
import { resolveWasmHash } from "../client.js";

// ---------------------------------------------------------------------------
// Helpers: build a realistic v17 LedgerEntryResult
// ---------------------------------------------------------------------------

/**
 * Construct the v17 xdr object graph that rpc.Server.getLedgerEntries
 * returns as entries[0].val for a contract-instance ledger entry.
 *
 * Shape (v17 discriminated-union classes, all arms are properties):
 *
 *   LedgerEntryData (type: "contractData")
 *     .contractData  → ContractDataEntry
 *       .val         → ScVal (type: "scvContractInstance")
 *         .instance  → ScContractInstance
 *           .executable → ContractExecutable (type: "contractExecutableWasm")
 *             .wasmHash → Hash  (BytesValue, .toString() = 64-char hex)
 */
function buildLedgerEntryVal(wasmHashHex: string, contractAddress: string): xdr.LedgerEntryData {
  const executableWasm = xdr.ContractExecutable.contractExecutableWasm(
    new xdr.Hash(Buffer.from(wasmHashHex, "hex"))
  );

  const scvInstance = xdr.ScVal.scvContractInstance(
    new xdr.ScContractInstance({ executable: executableWasm, storage: null })
  );

  const contractDataEntry = new xdr.ContractDataEntry({
    ext: xdr.ExtensionPoint.v0(),
    contract: new Address(contractAddress).toScAddress(),
    key: xdr.ScVal.scvLedgerKeyContractInstance(),
    // fix 1: .persistent is a singleton — no ()
    durability: xdr.ContractDataDurability.persistent,
    val: scvInstance,
  });

  // fix 2: LedgerEntryData.contractData is a factory that returns
  // LedgerEntryDataContractData — the contractData arm is a property
  return xdr.LedgerEntryData.contractData(contractDataEntry);
}

/**
 * Build a full rpc.Api.GetLedgerEntriesResponse-shaped mock return value.
 */
function buildMockResponse(
  wasmHashHex: string,
  contractAddress: string
): rpc.Api.GetLedgerEntriesResponse {
  return {
    entries: [
      {
        key: xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Address(contractAddress).toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent,
          })
        ),
        val: buildLedgerEntryVal(wasmHashHex, contractAddress),
        lastModifiedLedgerSeq: 1000,
        liveUntilLedgerSeq: 99999,
      },
    ],
    latestLedger: 1000,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTRACT_A = "CCWVSYESKQVEHFZ24HQ6D5UQPRMSFD3PYFF4AEJ7SSJNYOKDVJTVARRO";
const WASM_HASH_A = "42b88b61faa5bbabee406c14b562c0f5888e5305457c26548bc4fa15ae7c51e5";

// A second valid contract address (StrKey.encodeContract of 32 x 0x01 bytes)
const CONTRACT_B = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";
const WASM_HASH_B = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00000001";

// ---------------------------------------------------------------------------
// Mock rpc.Server
// ---------------------------------------------------------------------------

const mockGetLedgerEntries = vi.fn();

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn().mockImplementation(() => ({
        getLedgerEntries: mockGetLedgerEntries,
      })),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveWasmHash", () => {
  describe("v17 xdr property-access chain", () => {
    it("extracts the wasm hash from a v17 ContractData ledger entry", async () => {
      mockGetLedgerEntries.mockResolvedValue(buildMockResponse(WASM_HASH_A, CONTRACT_A));

      const result = await resolveWasmHash(CONTRACT_A, "https://rpc.testnet.stellar.org");

      expect(result).toBe(WASM_HASH_A);
    });

    it("returns a 64-character lowercase hex string", async () => {
      mockGetLedgerEntries.mockResolvedValue(buildMockResponse(WASM_HASH_A, CONTRACT_A));

      const result = await resolveWasmHash(CONTRACT_A, "https://rpc.testnet.stellar.org");

      expect(result).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
    });

    it("correctly round-trips a different wasm hash", async () => {
      mockGetLedgerEntries.mockResolvedValue(buildMockResponse(WASM_HASH_B, CONTRACT_B));

      const result = await resolveWasmHash(CONTRACT_B, "https://rpc.testnet.stellar.org");

      expect(result).toBe(WASM_HASH_B);
    });

    it("returns distinct hashes for distinct inputs", async () => {
      mockGetLedgerEntries
        .mockResolvedValueOnce(buildMockResponse(WASM_HASH_A, CONTRACT_A))
        .mockResolvedValueOnce(buildMockResponse(WASM_HASH_B, CONTRACT_B));

      const hashA = await resolveWasmHash(CONTRACT_A, "https://rpc.testnet.stellar.org");
      const hashB = await resolveWasmHash(CONTRACT_B, "https://rpc.testnet.stellar.org");

      expect(hashA).not.toBe(hashB);
      expect(hashA).toBe(WASM_HASH_A);
      expect(hashB).toBe(WASM_HASH_B);
    });

    it("uses ContractDataDurability.persistent (singleton) when building the ledger key", async () => {
      mockGetLedgerEntries.mockResolvedValue(buildMockResponse(WASM_HASH_A, CONTRACT_A));

      await resolveWasmHash(CONTRACT_A, "https://rpc.testnet.stellar.org");

      // The ledger key passed to getLedgerEntries must use .persistent durability.
      // v17: LedgerKey union arms are readonly properties, not method calls.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capturedKey = (mockGetLedgerEntries.mock.calls[0] as any[])[0] as xdr.LedgerKey;
      expect(capturedKey.type).toBe("contractData");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((capturedKey as any).contractData.durability).toBe(
        xdr.ContractDataDurability.persistent
      );
    });

    it("builds the LedgerKey for the correct contract address", async () => {
      mockGetLedgerEntries.mockResolvedValue(buildMockResponse(WASM_HASH_A, CONTRACT_A));

      await resolveWasmHash(CONTRACT_A, "https://rpc.testnet.stellar.org");

      // v17: .contractData is a property (LedgerKeyContractData), not a function
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capturedKey = (mockGetLedgerEntries.mock.calls[0] as any[])[0] as xdr.LedgerKey;
      const contractInKey = Address.fromScAddress(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (capturedKey as any).contractData.contract
      ).toString();
      expect(contractInKey).toBe(CONTRACT_A);
    });
  });

  describe("error handling", () => {
    it("throws a descriptive error when no entries are returned", async () => {
      mockGetLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1000 });

      await expect(
        resolveWasmHash(CONTRACT_A, "https://rpc.testnet.stellar.org")
      ).rejects.toThrow(`Contract not found: ${CONTRACT_A}`);
    });

    it("throws when entries is undefined (RPC returned no results)", async () => {
      mockGetLedgerEntries.mockResolvedValue({ latestLedger: 1000 });

      await expect(
        resolveWasmHash(CONTRACT_A, "https://rpc.testnet.stellar.org")
      ).rejects.toThrow(`Contract not found: ${CONTRACT_A}`);
    });

    it("accepts an rpc.Server instance directly (not just a URL string)", async () => {
      mockGetLedgerEntries.mockResolvedValue(buildMockResponse(WASM_HASH_A, CONTRACT_A));

      // Pass a pre-constructed server object instead of a URL string
      const serverInstance = new rpc.Server("https://rpc.testnet.stellar.org");
      const result = await resolveWasmHash(CONTRACT_A, serverInstance);

      expect(result).toBe(WASM_HASH_A);
    });
  });
});
