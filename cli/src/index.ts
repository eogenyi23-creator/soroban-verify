#!/usr/bin/env node
/**
 * stellar-verify — Soroban contract source verification CLI
 *
 * Usage:
 *   stellar-verify verify  --contract <C...> --source <url> --commit <sha>
 *   stellar-verify check   --contract <C...>
 *   stellar-verify lookup  --hash <wasm-hash>
 */

import "dotenv/config";
import { Command } from "commander";
import { verifyCommand } from "./commands/verify.js";
import { checkCommand } from "./commands/check.js";
import { lookupCommand } from "./commands/lookup.js";

const program = new Command();

program
  .name("stellar-verify")
  .description(
    "Soroban contract source verification — submit and query on-chain verification records"
  )
  .version("0.1.0");

program
  .option(
    "-n, --network <network>",
    'Stellar network to use ("testnet" or "mainnet")',
    "testnet"
  )
  .option("--rpc-url <url>", "Override the Stellar RPC URL")
  .option("--registry-id <id>", "Override the registry contract address");

program.addCommand(verifyCommand);
program.addCommand(checkCommand);
program.addCommand(lookupCommand);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
