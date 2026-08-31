/**
 * `stellar-verify check`
 *
 * Check whether a deployed contract is source-verified in the registry.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createRegistryClient, resolveWasmHash } from "@soroban-verify/sdk";
import { getNetworkConfig } from "../lib/config.js";

export const checkCommand = new Command("check")
  .description("Check if a Soroban contract is source-verified")
  .requiredOption("-c, --contract <address>", "Contract address (C... Stellar address)")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const network = globalOpts.network ?? "testnet";
    const config = getNetworkConfig(network, {
      rpcUrl: globalOpts.rpcUrl,
      registryId: globalOpts.registryId,
    });

    const client = createRegistryClient(config);
    const spinner = ora(`Checking ${chalk.cyan(opts.contract)} on ${chalk.cyan(network)}...`).start();

    try {
      // Resolve the WASM hash for this contract address.
      const wasmHash = await resolveWasmHash(opts.contract, config.rpcUrl as any);
      const result = await client.getVerification(wasmHash);

      if (!result.verified) {
        spinner.fail(
          chalk.yellow(`✗ Contract ${opts.contract} is NOT source-verified.`)
        );
        console.log(`  WASM hash: ${chalk.gray(wasmHash)}`);
        console.log(
          chalk.gray(
            `\n  To submit a verification, run:\n  stellar-verify verify --contract ${opts.contract} --source <url> --commit <sha>\n`
          )
        );
        process.exit(1);
      }

      const rec = result.record;
      spinner.succeed(chalk.green(`✓ Contract ${opts.contract} is source-verified!`));
      console.log(`\n${chalk.bold("WASM hash:")}     ${chalk.cyan(rec.wasmHash)}`);
      console.log(`${chalk.bold("Source repo:")}   ${chalk.cyan(rec.sourceRepo)}`);
      console.log(`${chalk.bold("Commit:")}        ${chalk.cyan(rec.sourceCommit)}`);
      console.log(`${chalk.bold("Build args:")}    ${chalk.cyan(rec.buildArgs)}`);
      console.log(`${chalk.bold("Submitted by:")} ${chalk.cyan(rec.submittedBy)}`);
      console.log(`${chalk.bold("Ledger:")}        ${chalk.cyan(String(rec.submittedAt))}\n`);
    } catch (err) {
      spinner.fail(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
