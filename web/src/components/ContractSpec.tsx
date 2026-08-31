/**
 * ContractSpec — fetches and renders the on-chain Soroban contract spec (ABI).
 *
 * Soroban stores every contract's interface types on-chain from day one.
 * This component retrieves them and renders the function signatures.
 */

import { contract, SorobanRpc } from "@stellar/stellar-sdk";

interface Props {
  address: string;
  network: "testnet" | "mainnet";
}

const RPC_URLS: Record<string, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://mainnet.sorobanrpc.com",
};

const PASSPHRASES: Record<string, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
};

interface ParsedFunction {
  name: string;
  doc: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: string[];
}

async function fetchContractSpec(address: string, network: string): Promise<ParsedFunction[]> {
  const rpcUrl = RPC_URLS[network] ?? RPC_URLS.testnet;
  const networkPassphrase = PASSPHRASES[network] ?? PASSPHRASES.testnet;

  try {
    const client = await contract.Client.from({
      contractId: address,
      networkPassphrase,
      rpcUrl,
    });

    // Extract spec entries from the client spec.
    const spec = (client as any).spec as contract.Spec;
    const functions: ParsedFunction[] = [];

    for (const entry of spec.entries) {
      if (entry.switch().name === "scSpecEntryFunctionV0") {
        const fn = entry.functionV0();
        functions.push({
          name: fn.name().toString(),
          doc: fn.doc().toString().trim(),
          inputs: fn.inputs().map((inp: any) => ({
            name: inp.name().toString(),
            type: inp.type().switch().name,
          })),
          outputs: fn.outputs().map((out: any) => out.switch().name),
        });
      }
    }

    return functions;
  } catch {
    return [];
  }
}

export async function ContractSpec({ address, network }: Props) {
  const functions = await fetchContractSpec(address, network);

  if (functions.length === 0) {
    return (
      <div style={{ marginTop: 32, color: "#555", fontSize: 14 }}>
        No contract spec available (ABI not found on-chain).
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#ccc" }}>
        Contract Interface (ABI)
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {functions.map((fn) => (
          <div
            key={fn.name}
            style={{
              border: "1px solid #222",
              borderRadius: 8,
              padding: 16,
              background: "#111",
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <code style={{ color: "#8ae4ff", fontSize: 14, fontWeight: 700 }}>
                {fn.name}
              </code>
              <code style={{ color: "#888", fontSize: 13 }}>
                ({fn.inputs.map((i) => `${i.name}: ${i.type}`).join(", ")})
              </code>
              {fn.outputs.length > 0 && (
                <code style={{ color: "#a8e6a3", fontSize: 13 }}>
                  {" → "}{fn.outputs.join(" | ")}
                </code>
              )}
            </div>
            {fn.doc && (
              <p style={{ margin: 0, color: "#666", fontSize: 13, lineHeight: 1.5 }}>
                {fn.doc}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
