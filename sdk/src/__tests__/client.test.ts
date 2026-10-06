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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

const mockAssembleTransaction = vi.hoisted(() => vi.fn());

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn().mockImplementation(() => ({
        getLedgerEntries: mockGetLedgerEntries,
      })),
      assembleTransaction: mockAssembleTransaction,
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

    it("throws a descriptive error for a Stellar Asset Contract (SAC)", async () => {
      // A SAC ledger entry has contractExecutableStellarAsset, not contractExecutableWasm.
      // Build a mock response where executable.type is NOT "contractExecutableWasm"
      // so executable.wasmHash is undefined.
      const sacExecutable = xdr.ContractExecutable.contractExecutableStellarAsset();
      const scvInstance = xdr.ScVal.scvContractInstance(
        new xdr.ScContractInstance({ executable: sacExecutable, storage: null })
      );
      const contractDataEntry = new xdr.ContractDataEntry({
        ext: xdr.ExtensionPoint.v0(),
        contract: new Address(CONTRACT_A).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent,
        val: scvInstance,
      });
      const sacVal = xdr.LedgerEntryData.contractData(contractDataEntry);

      mockGetLedgerEntries.mockResolvedValue({
        entries: [
          {
            key: xdr.LedgerKey.contractData(
              new xdr.LedgerKeyContractData({
                contract: new Address(CONTRACT_A).toScAddress(),
                key: xdr.ScVal.scvLedgerKeyContractInstance(),
                durability: xdr.ContractDataDurability.persistent,
              })
            ),
            val: sacVal,
            lastModifiedLedgerSeq: 1000,
            liveUntilLedgerSeq: 99999,
          },
        ],
        latestLedger: 1000,
      });

      await expect(
        resolveWasmHash(CONTRACT_A, "https://rpc.testnet.stellar.org")
      ).rejects.toThrow("Stellar Asset Contract (SAC)");
    });
  });
});

// ---------------------------------------------------------------------------
// Polling timeout tests for submit()
// ---------------------------------------------------------------------------

import { createRegistryClient } from "../client.js";
import type { NetworkConfig } from "../types.js";
import { Keypair } from "@stellar/stellar-sdk";

// We need a mock server whose `getTransaction` never resolves to SUCCESS
// and whose sendTransaction returns immediately. We mock the rpc.Server
// constructor again here — vi.mock is hoisted so we patch getTransaction
// and the other server methods inside the test via the already-mocked constructor.

const MOCK_CONFIG: NetworkConfig = {
  network: "testnet",
  rpcUrl: "https://rpc.testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  registryContractId: CONTRACT_A,
};

// Helper: build a minimal account mock
function buildAccountMock() {
  const kp = Keypair.random();
  return {
    id: kp.publicKey(),
    sequence: "100",
    incrementSequenceNumber: () => {},
    sequenceNumber: () => "100",
    accountId: () => kp.publicKey(),
  };
}

describe("submit() polling timeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use fake timers so we can advance time without actually waiting
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws a timeout error when polling does not resolve within POLL_TIMEOUT_MS", async () => {
    // Each getTransaction call returns NOT_FOUND so the loop keeps running
    const mockGetTransaction = vi.fn().mockResolvedValue({ status: "NOT_FOUND" });
    const mockSendTransaction = vi.fn().mockResolvedValue({
      status: "PENDING",
      hash: "testhash1234567890",
    });
    // isSimulationError checks `"error" in sim` — must NOT have an error key.
    // isSimulationSuccess checks `"transactionData" in sim`.
    const mockSimulate = vi.fn().mockResolvedValue({
      result: { retval: null },
      transactionData: "",
      minResourceFee: "0",
    });
    const mockGetAccount = vi.fn().mockResolvedValue(buildAccountMock());
    // assembleTransaction returns a builder object; we only need .build() to return
    // something that has a .sign() method.
    const mockPreparedTx = { sign: vi.fn() };
    mockAssembleTransaction.mockReturnValue({ build: () => mockPreparedTx });

    // rpc.Server is already a vi.fn() from the top-level vi.mock — just
    // reconfigure its return value for this test.
    (rpc.Server as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      getLedgerEntries: mockGetLedgerEntries,
      getAccount: mockGetAccount,
      simulateTransaction: mockSimulate,
      sendTransaction: mockSendTransaction,
      getTransaction: mockGetTransaction,
    }));

    const client = createRegistryClient(MOCK_CONFIG);

    // Attach a no-op catch immediately to prevent "unhandled rejection" warnings
    // that can occur when fake timers fire the rejection asynchronously.
    const submitPromise = client.submit({
      contractAddress: CONTRACT_A,
      wasmHash: WASM_HASH_A,
      sourceRepo: "https://github.com/example/repo",
      sourceCommit: "abc123",
      buildArgs: "cargo build --release",
      signerSecretKey: Keypair.random().secret(),
    });
    // Suppress the unhandled rejection warning — we assert on it below.
    submitPromise.catch(() => {});

    // Advance time past the 60-second timeout
    await vi.advanceTimersByTimeAsync(65_000);

    await expect(submitPromise).rejects.toThrow(
      "Transaction polling timed out after 60s"
    );
  });

  it("resolves successfully when getTransaction returns SUCCESS before timeout", async () => {
    const txHash = "successhash0000000000000000000000000000000000000000000000000";
    const mockGetTransaction = vi.fn().mockResolvedValue({ status: "SUCCESS" });
    const mockSendTransaction = vi.fn().mockResolvedValue({
      status: "PENDING",
      hash: txHash,
    });
    const mockSimulate = vi.fn().mockResolvedValue({
      result: { retval: null },
      transactionData: "",
      minResourceFee: "0",
    });
    const mockGetAccount = vi.fn().mockResolvedValue(buildAccountMock());
    const mockPreparedTx = { sign: vi.fn() };
    mockAssembleTransaction.mockReturnValue({ build: () => mockPreparedTx });

    (rpc.Server as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      getLedgerEntries: mockGetLedgerEntries,
      getAccount: mockGetAccount,
      simulateTransaction: mockSimulate,
      sendTransaction: mockSendTransaction,
      getTransaction: mockGetTransaction,
    }));

    const client = createRegistryClient(MOCK_CONFIG);

    const submitPromise = client.submit({
      contractAddress: CONTRACT_A,
      wasmHash: WASM_HASH_A,
      sourceRepo: "https://github.com/example/repo",
      sourceCommit: "abc123",
      buildArgs: "cargo build --release",
      signerSecretKey: Keypair.random().secret(),
    });

    // Advance past the 2-second poll interval
    await vi.advanceTimersByTimeAsync(3_000);

    const result = await submitPromise;
    expect(result.success).toBe(true);
    expect(result.txHash).toBe(txHash);
  });
});
