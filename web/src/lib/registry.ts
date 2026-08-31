/**
 * Registry client singleton for server components.
 */

import { createRegistryClient, NETWORKS, NetworkConfig, StellarNetwork } from "@soroban-verify/sdk";

const REGISTRY_IDS: Record<StellarNetwork, string> = {
  testnet: process.env.REGISTRY_TESTNET_ID ?? "",
  mainnet: process.env.REGISTRY_MAINNET_ID ?? "",
};

export function getRegistryClient(network: StellarNetwork) {
  const id = REGISTRY_IDS[network];
  if (!id) {
    throw new Error(
      `Registry contract ID not configured for ${network}. ` +
        `Set REGISTRY_${network.toUpperCase()}_ID in your environment.`
    );
  }
  const config: NetworkConfig = {
    ...NETWORKS[network],
    registryContractId: id,
  };
  return createRegistryClient(config);
}
