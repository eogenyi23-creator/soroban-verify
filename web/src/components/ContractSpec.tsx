/**
 * ContractSpec — fetches and renders the on-chain Soroban contract spec (ABI).
 * 
 * Soroban stores every contract's interface types on-chain from day one.
 * This component retrieves them and renders the function signatures.
 */

import { contract, xdr } from "@stellar/stellar-sdk";

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

export interface ParsedFunction {
  name: string;
  doc: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: string[];
}

/**
 * Parse a flat list of v17 ScSpecEntry objects into ParsedFunction descriptors.
 *
 * Exported so it can be unit-tested without network access.
 *
 * v17 type facts (verified from installed @stellar/stellar-sdk 17.2.0 types):
 *
 *   xdr.ScSpecEntry is a discriminated union of concrete classes.
 *   Each variant has:
 *     readonly type: ScSpecEntryVariantName   — typed string literal property,
 *                                               no cast required for narrowing
 *     get value()                             — returns the variant payload
 *
 *   When entry.type === "scSpecEntryFunctionV0", TypeScript narrows to
 *   xdr.ScSpecEntryFunctionV0 and .value returns xdr.ScSpecFunctionV0 with:
 *     readonly name: XdrString    — .toString() yields the function name
 *     readonly doc:  XdrString    — .toString() yields the doc string
 *     readonly inputs: xdr.ScSpecFunctionInputV0[]  each with:
 *         readonly name: XdrString
 *         readonly type: xdr.ScSpecTypeDef   — .type is a ScSpecTypeDefVariantName
 *                                              string (e.g. "scSpecTypeU32")
 *     readonly outputs: xdr.ScSpecTypeDef[]  each with:
 *         readonly type: ScSpecTypeDefVariantName
 *
 *   This was cross-checked against:
 *     lib/esm/xdr/generated/sc-spec-entry.d.ts        (union + variants)
 *     lib/esm/xdr/generated/sc-spec-function-v0.d.ts  (name/doc/inputs/outputs)
 *     lib/esm/xdr/generated/sc-spec-function-input-v0.d.ts
 *     lib/esm/xdr/generated/sc-spec-type-def.d.ts     (.type string property)
 *     lib/esm/xdr/values/xdr-string.d.ts              (.toString())
 */
export function parseFunctions(entries: xdr.ScSpecEntry[]): ParsedFunction[] {
  const functions: ParsedFunction[] = [];
  for (const entry of entries) {
    // entry.type is a real typed property — TypeScript narrows here.
    if (entry.type === "scSpecEntryFunctionV0") {
      // .value is the typed getter returning xdr.ScSpecFunctionV0.
      const fn = entry.value;
      functions.push({
        name: fn.name.toString(),
        doc: fn.doc.toString().trim(),
        inputs: fn.inputs.map((inp) => ({
          name: inp.name.toString(),
          // inp.type is xdr.ScSpecTypeDef; .type is the variant-name string
          type: inp.type.type,
        })),
        // out.type is the ScSpecTypeDefVariantName string
        outputs: fn.outputs.map((out) => out.type),
      });
    }
  }
  return functions;
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

    // contract.Client.from() returns a Client whose .spec is a contract.Spec.
    // contract.Spec exposes .entries: xdr.ScSpecEntry[] — the v17 discriminated union.
    // The TypeScript signature of Client does not expose .spec publicly, so we
    // cast via unknown once at the boundary.
    const spec = (client as unknown as { spec: contract.Spec }).spec;
    return parseFunctions(spec.entries);
  } catch (err) {
    console.error("ContractSpec: failed to load spec for", address, err);
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
