/**
 * `stellar-verify lookup`
 *
 * Look up a verification record directly by WASM hash.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createRegistryClient } from "@soroban-verify/sdk";
import { getNetworkConfig } from "../lib/config.js";

export const lookupCommand = new Command("lookup")
  .description("Look up a verification record by WASM hash")
  .requiredOption("--hash <wasm-hash>", "SHA-256 WASM hash (64-char hex string)")
  .option("--json", "Output raw JSON")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const network = globalOpts.network ?? "testnet";
    const config = getNetworkConfig(network, {
      rpcUrl: globalOpts.rpcUrl,
      registryId: globalOpts.registryId,
    });

    const client = createRegistryClient(config);
    const spinner = ora(`Looking up hash ${chalk.cyan(opts.hash.slice(0, 16))}... on ${chalk.cyan(network)}`).start();

    try {
      const result = await client.getVerification(opts.hash);

      if (!result.verified) {
        spinner.fail(chalk.yellow(`No verification found for hash: ${opts.hash}`));
        process.exit(1);
      }

      spinner.succeed(chalk.green("Verification record found!"));

      if (opts.json) {
        console.log(JSON.stringify(result.record, null, 2));
        return;
      }

      const rec = result.record;
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
