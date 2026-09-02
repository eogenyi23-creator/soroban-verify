import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkCommand } from "../check.js";
import { lookupCommand } from "../lookup.js";
import { verifyCommand } from "../verify.js";

vi.mock("../../lib/config.js", () => ({
  getNetworkConfig: vi.fn(() => ({
    rpcUrl: "https://testnet.example.com",
    networkPassphrase: "Test SDF Network ; September 2015",
    registryContractId: "C00000000000000000000000000000000000000000000000000000",
  })),
}));

const mocks = vi.hoisted(() => ({
  getVerification: vi.fn(),
  isVerified: vi.fn(),
  resolveWasmHash: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("@soroban-verify/sdk", () => ({
  createRegistryClient: vi.fn(() => ({
    getVerification: mocks.getVerification,
    isVerified: mocks.isVerified,
    submit: mocks.submit,
  })),
  resolveWasmHash: mocks.resolveWasmHash,
  NETWORKS: {
    testnet: { rpcUrl: "https://testnet.example.com", networkPassphrase: "Test SDF Network ; September 2015" },
    mainnet: { rpcUrl: "https://mainnet.example.com", networkPassphrase: "Public Global Stellar Network ; September 2015" },
  },
}));

describe("stellar-verify CLI commands", () => {
  const originalExit = process.exit;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exit = vi.fn((code?: number) => {
      throw new Error(`process.exit(${code ?? ""})`);
    }) as unknown as typeof process.exit;
    process.env = { ...originalEnv };
    delete process.env.STELLAR_SECRET_KEY;
    process.env.REGISTRY_TESTNET_ID = "C00000000000000000000000000000000000000000000000000000";
    process.env.REGISTRY_MAINNET_ID = "C00000000000000000000000000000000000000000000000000000";
  });

  afterEach(() => {
    process.exit = originalExit;
    process.env = originalEnv;
  });

  describe("check command", () => {
    it("succeeds when the contract is source-verified", async () => {
      mocks.resolveWasmHash.mockResolvedValue("abcd1234");
      mocks.getVerification.mockResolvedValue({
        verified: true,
        record: {
          wasmHash: "abcd1234",
          sourceRepo: "https://github.com/org/repo",
          sourceCommit: "deadbeef",
          buildArgs: "cargo build --release --target wasm32v1-none",
          submittedBy: "G...",
          submittedAt: 12345,
        },
      });

      await checkCommand.parseAsync([
        "node",
        "stellar-verify",
        "check",
        "--contract",
        "CACVFG6MBJ9SPQ6C7NU...",
      ]);

      expect(mocks.resolveWasmHash).toHaveBeenCalledWith(
        "CACVFG6MBJ9SPQ6C7NU...",
        expect.anything()
      );
      expect(mocks.getVerification).toHaveBeenCalledWith("abcd1234");
    });

    it("exits with error when the contract is not source-verified", async () => {
      mocks.resolveWasmHash.mockResolvedValue("abcd1234");
      mocks.getVerification.mockResolvedValue({ verified: false, record: null });

      await expect(
        checkCommand.parseAsync([
          "node",
          "stellar-verify",
          "check",
          "--contract",
          "CACVFG6MBJ9SPQ6C7NU...",
        ])
      ).rejects.toThrow("process.exit(1)");

      expect(mocks.getVerification).toHaveBeenCalledWith("abcd1234");
    });
  });

  describe("lookup command", () => {
    it("succeeds when a verification record is found", async () => {
      mocks.getVerification.mockResolvedValue({
        verified: true,
        record: {
          wasmHash: "abcd1234",
          sourceRepo: "https://github.com/org/repo",
          sourceCommit: "deadbeef",
          buildArgs: "cargo build --release --target wasm32v1-none",
          submittedBy: "G...",
          submittedAt: 12345,
        },
      });

      await lookupCommand.parseAsync([
        "node",
        "stellar-verify",
        "lookup",
        "--hash",
        "abcd1234",
      ]);

      expect(mocks.getVerification).toHaveBeenCalledWith("abcd1234");
    });

    it("exits with error when no verification is found", async () => {
      mocks.getVerification.mockResolvedValue({ verified: false, record: null });

      await expect(
        lookupCommand.parseAsync([
          "node",
          "stellar-verify",
          "lookup",
          "--hash",
          "abcd1234",
        ])
      ).rejects.toThrow("process.exit(1)");

      expect(mocks.getVerification).toHaveBeenCalledWith("abcd1234");
    });
  });

  describe("verify command", () => {
    it("warns and exits cleanly when the WASM hash is already verified", async () => {
      mocks.resolveWasmHash.mockResolvedValue("abcd1234");
      mocks.isVerified.mockResolvedValue(true);
      await expect(
        verifyCommand.parseAsync([
          "node",
          "stellar-verify",
          "verify",
          "--contract",
          "CACVFG6MBJ9SPQ6C7NU...",
          "--source",
          "https://github.com/org/repo",
          "--commit",
          "deadbeef",
          "--secret-key",
          "S...",
        ])
      ).rejects.toThrow("process.exit(1)");

      expect(mocks.resolveWasmHash).toHaveBeenCalledWith(
        "CACVFG6MBJ9SPQ6C7NU...",
        expect.anything()
      );
      expect(mocks.isVerified).toHaveBeenCalledWith("abcd1234");
      expect(mocks.submit).not.toHaveBeenCalled();
    });
  });
});
