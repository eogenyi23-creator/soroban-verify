/**
 * Registry client factory for Next.js server components.
 *
 * Environment variables required:
 *   REGISTRY_TESTNET_ID  — testnet registry contract address (C...)
 *   REGISTRY_MAINNET_ID  — mainnet registry contract address (C...)
 *
 * Call validateEnv() in your app startup (e.g. next.config.js or layout.tsx)
 * to catch missing config at boot time rather than at request time.
 */

import { createRegistryClient, NETWORKS, NetworkConfig, StellarNetwork } from "@soroban-verify/sdk";

/** Registry contract IDs sourced from environment variables. */
const REGISTRY_IDS: Record<StellarNetwork, string | undefined> = {
  testnet: process.env.REGISTRY_TESTNET_ID,
  mainnet: process.env.REGISTRY_MAINNET_ID,
};

/**
 * Validate that all required registry environment variables are set.
 * Throws a single error listing every missing variable.
 *
 * Call this at application startup to surface config problems immediately.
 */
export function validateEnv(): void {
  const missing: string[] = [];

  if (!process.env.REGISTRY_TESTNET_ID) missing.push("REGISTRY_TESTNET_ID");
  if (!process.env.REGISTRY_MAINNET_ID) missing.push("REGISTRY_MAINNET_ID");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n` +
        missing.map((v) => `  - ${v}`).join("\n") +
        `\n\nSet these in your .env.local file or deployment environment.`
    );
  }
}

/**
 * Return a registry client configured for the given Stellar network.
 * Throws immediately if the contract ID for that network is not configured.
 */
export function getRegistryClient(network: StellarNetwork) {
  const id = REGISTRY_IDS[network];
  if (!id) {
    throw new Error(
      `Registry contract ID not configured for network "${network}".\n` +
        `Set REGISTRY_${network.toUpperCase()}_ID in your environment.\n` +
        `See DEPLOY.md for deployment instructions.`
    );
  }
  const config: NetworkConfig = {
    ...NETWORKS[network],
    registryContractId: id,
  };
  return createRegistryClient(config);
}
