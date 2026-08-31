/**
 * Network configuration builder for the CLI.
 *
 * Merges well-known network presets with user-provided overrides from
 * command-line flags and environment variables.
 */

import { NETWORKS, NetworkConfig, StellarNetwork } from "@soroban-verify/sdk";

/** Registry contract addresses per network (update after deployment). */
const REGISTRY_CONTRACT_IDS: Record<StellarNetwork, string> = {
  testnet: process.env.REGISTRY_TESTNET_ID ?? "",
  mainnet: process.env.REGISTRY_MAINNET_ID ?? "",
};

export function getNetworkConfig(
  network: string,
  overrides: { rpcUrl?: string; registryId?: string }
): NetworkConfig {
  if (network !== "testnet" && network !== "mainnet") {
    console.error(`Unknown network: ${network}. Use "testnet" or "mainnet".`);
    process.exit(1);
  }

  const preset = NETWORKS[network as StellarNetwork];
  const registryContractId =
    overrides.registryId ?? REGISTRY_CONTRACT_IDS[network as StellarNetwork];

  if (!registryContractId) {
    console.error(
      `No registry contract ID configured for ${network}.\n` +
        `Set the REGISTRY_${network.toUpperCase()}_ID environment variable or pass --registry-id.`
    );
    process.exit(1);
  }

  return {
    ...preset,
    rpcUrl: overrides.rpcUrl ?? preset.rpcUrl,
    registryContractId,
  };
}
