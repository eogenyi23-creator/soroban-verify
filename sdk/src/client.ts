/**
 * Registry contract client factory.
 *
 * Wraps @stellar/stellar-sdk to provide a typed interface for interacting
 * with the soroban-verify registry contract.
 */

import {
  Contract,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  scValToNative,
  nativeToScVal,
  Keypair,
  Address,
  Account,
} from "@stellar/stellar-sdk";
import type {
  NetworkConfig,
  VerificationRecord,
  VerificationResult,
  SubmitVerificationInput,
  SubmitResult,
} from "./types.js";

export function createRegistryClient(config: NetworkConfig) {
  const server = new rpc.Server(config.rpcUrl, { allowHttp: false });
  const contractInst = new Contract(config.registryContractId);

  async function isVerified(wasmHash: string): Promise<boolean> {
    const result = await simulateReadOnly(
      contractInst.call("is_verified", nativeToScVal(wasmHash, { type: "string" }))
    );
    return scValToNative(result) as boolean;
  }

  async function getVerification(wasmHash: string): Promise<VerificationResult> {
    const result = await simulateReadOnly(
      contractInst.call("get_verification", nativeToScVal(wasmHash, { type: "string" }))
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

  async function getBySubmitter(submitterAddress: string): Promise<string[]> {
    const result = await simulateReadOnly(
      contractInst.call("get_by_submitter", new Address(submitterAddress).toScVal())
    );
    return scValToNative(result) as string[];
  }

  async function count(): Promise<number> {
    const result = await simulateReadOnly(contractInst.call("count"));
    return scValToNative(result) as number;
  }

  async function submit(input: SubmitVerificationInput): Promise<SubmitResult> {
    const keypair = Keypair.fromSecret(input.signerSecretKey);
    const sourceAccount = await server.getAccount(keypair.publicKey());
    const wasmHash =
      input.wasmHash ?? (await resolveWasmHash(input.contractAddress, server));

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(
        contractInst.call(
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
    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    const preparedTx = rpc.assembleTransaction(tx, simResult).build();
    preparedTx.sign(keypair);

    const sendResult = await server.sendTransaction(preparedTx);
    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction failed: ${sendResult.errorResult?.toXDR("base64")}`);
    }

    const txHash = sendResult.hash;
    const POLL_INTERVAL_MS = 2000;
    const POLL_TIMEOUT_MS = 60_000; // 60 s — ~30 ledgers at 2 s each
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (true) {
      await sleep(POLL_INTERVAL_MS);
      if (Date.now() > deadline) {
        throw new Error(
          `Transaction polling timed out after ${POLL_TIMEOUT_MS / 1000}s. ` +
          `Check the transaction manually: ${txHash}`
        );
      }
      const poll = await server.getTransaction(txHash);
      if (poll.status === "SUCCESS") return { success: true, txHash, wasmHash };
      if (poll.status === "FAILED") throw new Error(`Transaction failed on-chain: ${txHash}`);
    }
  }

  async function simulateReadOnly(operation: xdr.Operation): Promise<xdr.ScVal> {
    const dummyKeypair = Keypair.random();
    const account = new Account(dummyKeypair.publicKey(), "0");
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const simResult = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Read simulation failed: ${simResult.error}`);
    }
    const success = simResult as rpc.Api.SimulateTransactionSuccessResponse;
    return success.result!.retval;
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

export async function resolveWasmHash(
  contractAddress: string,
  server: rpc.Server | string
): Promise<string> {
  const rpcServer =
    typeof server === "string"
      ? new rpc.Server(server, { allowHttp: false })
      : server;
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractAddress).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      // v17: ContractDataDurability enum values are singletons — no call ()
      durability: xdr.ContractDataDurability.persistent,
    })
  );

  const response = await rpcServer.getLedgerEntries(ledgerKey);
  if (!response.entries || response.entries.length === 0) {
    throw new Error(`Contract not found: ${contractAddress}`);
  }

  const entry = response.entries[0].val;
  // v17 xdr: union arm accessors are now readonly properties, not method calls.
  // LedgerEntryDataContractData.contractData, ContractDataEntry.val (ScVal),
  // ScValContractInstance.instance (ScContractInstance),
  // ScContractInstance.executable (ContractExecutable union),
  // ContractExecutableWasm.wasmHash (Hash) — all properties, not functions.
  //
  // Hash wraps a 32-byte Uint8Array with `static readonly encoding = "hex"`,
  // so Hash.toString() returns the 64-char lowercase hex string directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractData = (entry as any).contractData as {
    val: { instance: { executable: { wasmHash: { toString(): string } } } };
  };
  return contractData.val.instance.executable.wasmHash.toString();
}
