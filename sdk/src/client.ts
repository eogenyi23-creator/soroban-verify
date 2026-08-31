/**
 * Registry contract client factory.
 *
 * Wraps @stellar/stellar-sdk to provide a typed interface for interacting
 * with the soroban-verify registry contract.
 */

import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  scValToNative,
  nativeToScVal,
  Keypair,
  Address,
} from "@stellar/stellar-sdk";
import type {
  NetworkConfig,
  VerificationRecord,
  VerificationResult,
  SubmitVerificationInput,
  SubmitResult,
} from "./types.js";

/**
 * Factory function that returns a typed client for the registry contract.
 *
 * @example
 * ```ts
 * const client = createRegistryClient({
 *   network: "testnet",
 *   rpcUrl: "https://soroban-testnet.stellar.org",
 *   networkPassphrase: Networks.TESTNET,
 *   registryContractId: "C...",
 * });
 * const result = await client.getVerification("6ddb...");
 * ```
 */
export function createRegistryClient(config: NetworkConfig) {
  const server = new SorobanRpc.Server(config.rpcUrl, { allowHttp: false });
  const contract = new Contract(config.registryContractId);

  /**
   * Check whether a WASM hash has a verification record.
   */
  async function isVerified(wasmHash: string): Promise<boolean> {
    const result = await simulateReadOnly(
      contract.call("is_verified", nativeToScVal(wasmHash, { type: "string" }))
    );
    return scValToNative(result) as boolean;
  }

  /**
   * Look up the full verification record for a WASM hash.
   * Returns `{ verified: false, record: null }` if not found.
   */
  async function getVerification(wasmHash: string): Promise<VerificationResult> {
    const result = await simulateReadOnly(
      contract.call("get_verification", nativeToScVal(wasmHash, { type: "string" }))
    );
    const native = scValToNative(result);
    if (native === null || native === undefined) {
      return { verified: false, record: null };
    }
    return {
      verified: true,
      record: mapToRecord(native as Record<string, unknown>),
    };
  }

  /**
   * Return all WASM hashes submitted by a given Stellar address.
   */
  async function getBySubmitter(submitterAddress: string): Promise<string[]> {
    const result = await simulateReadOnly(
      contract.call(
        "get_by_submitter",
        new Address(submitterAddress).toScVal()
      )
    );
    return scValToNative(result) as string[];
  }

  /**
   * Return the total count of verified contracts.
   */
  async function count(): Promise<number> {
    const result = await simulateReadOnly(contract.call("count"));
    return scValToNative(result) as number;
  }

  /**
   * Submit a new source-verification record.
   *
   * Builds, simulates, signs and submits the transaction.
   */
  async function submit(input: SubmitVerificationInput): Promise<SubmitResult> {
    const keypair = Keypair.fromSecret(input.signerSecretKey);
    const sourceAccount = await server.getAccount(keypair.publicKey());

    const wasmHash = input.wasmHash ?? (await resolveWasmHash(input.contractAddress, server));

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(
        contract.call(
          "submit",
          new Address(keypair.publicKey()).toScVal(),
          nativeToScVal(wasmHash, { type: "string" }),
          nativeToScVal(input.sourceRepo, { type: "string" }),
          nativeToScVal(input.sourceCommit, { type: "string" }),
          nativeToScVal(input.buildArgs, { type: "string" })
        )
      )
      .setTimeout(30)
      .build();

    const simResult = await server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
    preparedTx.sign(keypair);

    const sendResult = await server.sendTransaction(preparedTx);
    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction failed: ${sendResult.errorResult?.toXDR("base64")}`);
    }

    // Poll for confirmation.
    const txHash = sendResult.hash;
    let status = sendResult.status;
    while (status === "PENDING" || status === "NOT_FOUND") {
      await sleep(2000);
      const poll = await server.getTransaction(txHash);
      if (poll.status === "SUCCESS") {
        return { success: true, txHash, wasmHash };
      }
      if (poll.status === "FAILED") {
        throw new Error(`Transaction failed on-chain: ${txHash}`);
      }
    }

    return { success: true, txHash, wasmHash };
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  async function simulateReadOnly(operation: xdr.Operation): Promise<xdr.ScVal> {
    // Build a dummy source account for read-only simulation.
    const dummyKeypair = Keypair.random();
    // Use friendbot to avoid needing a real account for reads.
    const account = await server
      .getAccount(dummyKeypair.publicKey())
      .catch(() => {
        // Fall back to a synthetic account object.
        const { Account } = require("@stellar/stellar-sdk");
        return new Account(dummyKeypair.publicKey(), "0");
      });

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const simResult = await server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Read simulation failed: ${simResult.error}`);
    }
    const successResult = simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse;
    return successResult.result!.retval;
  }

  function mapToRecord(raw: Record<string, unknown>): VerificationRecord {
    return {
      wasmHash: raw["wasm_hash"] as string,
      sourceRepo: raw["source_repo"] as string,
      sourceCommit: raw["source_commit"] as string,
      buildArgs: raw["build_args"] as string,
      submittedBy: raw["submitted_by"] as string,
      submittedAt: raw["submitted_at"] as number,
    };
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return { isVerified, getVerification, getBySubmitter, count, submit };
}

/**
 * Resolve the WASM hash for a given contract address via RPC.
 */
export async function resolveWasmHash(
  contractAddress: string,
  server: SorobanRpc.Server
): Promise<string> {
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractAddress).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );

  const response = await server.getLedgerEntries(ledgerKey);
  if (!response.entries || response.entries.length === 0) {
    throw new Error(`Contract not found: ${contractAddress}`);
  }

  const entry = response.entries[0].val;
  const contractData = entry.contractData();
  const instance = contractData.val().instance();
  const wasmHash = instance.executable().wasmHash();
  return Buffer.from(wasmHash).toString("hex");
}
