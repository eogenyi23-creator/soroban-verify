/**
 * `stellar-verify verify`
 *
 * Builds a Soroban contract reproducibly, computes its WASM hash,
 * and submits a source-verification record to the on-chain registry.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createRegistryClient, resolveWasmHash } from "@soroban-verify/sdk";
import { getNetworkConfig } from "../lib/config.js";
import { computeLocalWasmHash } from "../lib/hash.js";
import path from "path";

export const verifyCommand = new Command("verify")
  .description("Submit a source-verification record for a Soroban contract")
  .requiredOption("-c, --contract <address>", "Contract address (C... Stellar address)")
  .requiredOption("-s, --source <url>", "Public source repository URL")
  .requiredOption(
    "--commit <sha>",
    "Git commit SHA that was compiled to produce the deployed WASM"
  )
  .option(
    "-b, --build-args <args>",
    "Build command used",
    "cargo build --release --target wasm32v1-none"
  )
  .option(
    "--wasm <path>",
    "Path to local .wasm file (if provided, hash is computed locally rather than fetched from network)"
  )
  .option(
    "--secret-key <key>",
    "Stellar secret key for signing (or set STELLAR_SECRET_KEY env var)"
  )
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const network = globalOpts.network ?? "testnet";
    const secretKey = opts.secretKey ?? process.env.STELLAR_SECRET_KEY;

    if (!secretKey) {
      console.error(
        chalk.red(
          "Error: secret key required. Use --secret-key or set STELLAR_SECRET_KEY env var."
        )
      );
      process.exit(1);
    }

    const config = getNetworkConfig(network, {
      rpcUrl: globalOpts.rpcUrl,
      registryId: globalOpts.registryId,
    });

    console.log(
      chalk.bold(
        `\n🔍 soroban-verify — submitting verification on ${chalk.cyan(network)}\n`
      )
    );

    // Step 1: resolve WASM hash
    let wasmHash: string;
    const spinner = ora("Resolving WASM hash...").start();
    try {
      if (opts.wasm) {
        wasmHash = await computeLocalWasmHash(path.resolve(opts.wasm));
        spinner.succeed(`WASM hash (local): ${chalk.green(wasmHash)}`);
      } else {
        const client = createRegistryClient(config);
        const server = (client as any)._server; // access internal server
        wasmHash = await resolveWasmHash(opts.contract, (client as any)._server ?? config.rpcUrl);
        spinner.succeed(`WASM hash (on-chain): ${chalk.green(wasmHash)}`);
      }
    } catch (err) {
      spinner.fail(`Failed to resolve WASM hash: ${(err as Error).message}`);
      process.exit(1);
    }

    // Step 2: check if already verified
    const checkSpinner = ora("Checking existing registry entry...").start();
    const client = createRegistryClient(config);
    try {
      const existing = await client.isVerified(wasmHash);
      if (existing) {
        checkSpinner.warn(
          chalk.yellow(
            `A verification for this WASM hash already exists. Use 'stellar-verify lookup --hash ${wasmHash}' to view it.`
          )
        );
        process.exit(0);
      }
      checkSpinner.succeed("No existing record found — proceeding.");
    } catch (err) {
      checkSpinner.fail(`Registry check failed: ${(err as Error).message}`);
      process.exit(1);
    }

    // Step 3: submit
    const submitSpinner = ora("Submitting verification to the registry...").start();
    try {
      const result = await client.submit({
        contractAddress: opts.contract,
        wasmHash,
        sourceRepo: opts.source,
        sourceCommit: opts.commit,
        buildArgs: opts.buildArgs,
        signerSecretKey: secretKey,
      });

      submitSpinner.succeed(chalk.green("Verification submitted!"));
      console.log(`\n${chalk.bold("Transaction:")} ${chalk.cyan(result.txHash)}`);
      console.log(`${chalk.bold("WASM hash:")}    ${chalk.cyan(result.wasmHash)}`);
      console.log(`${chalk.bold("Source:")}       ${chalk.cyan(opts.source)}`);
      console.log(`${chalk.bold("Commit:")}       ${chalk.cyan(opts.commit)}\n`);
    } catch (err) {
      submitSpinner.fail(`Submission failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });
