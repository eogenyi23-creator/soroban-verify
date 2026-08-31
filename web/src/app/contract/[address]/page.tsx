import { VerificationBadge } from "@/components/VerificationBadge";
import { ContractSpec } from "@/components/ContractSpec";
import { getRegistryClient } from "@/lib/registry";
import { resolveWasmHash } from "@soroban-verify/sdk";
import { SorobanRpc } from "@stellar/stellar-sdk";

interface Props {
  params: { address: string };
}

export default async function ContractPage({ params }: Props) {
  const { address } = params;
  const network = "testnet"; // TODO: derive from query param

  let wasmHash: string | null = null;
  let verificationResult = null;
  let error: string | null = null;

  try {
    const rpcUrl = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
    const server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    wasmHash = await resolveWasmHash(address, server as any);

    const client = getRegistryClient(network);
    verificationResult = await client.getVerification(wasmHash);
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <div>
      <h2 style={{ fontSize: 14, color: "#888", fontWeight: 400, marginBottom: 4 }}>
        Contract
      </h2>
      <h1
        style={{
          fontFamily: "monospace",
          fontSize: 18,
          fontWeight: 600,
          wordBreak: "break-all",
          marginBottom: 24,
        }}
      >
        {address}
      </h1>

      {error && (
        <div
          style={{
            background: "#1a0a0a",
            border: "1px solid #5a1a1a",
            borderRadius: 8,
            padding: 16,
            color: "#ff6b6b",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {!error && (
        <>
          {wasmHash && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>
                WASM HASH
              </label>
              <code
                style={{
                  background: "#111",
                  border: "1px solid #222",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  display: "block",
                  wordBreak: "break-all",
                }}
              >
                {wasmHash}
              </code>
            </div>
          )}

          <VerificationBadge result={verificationResult} />

          {verificationResult?.verified && (
            <div
              style={{
                marginTop: 24,
                border: "1px solid #222",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["Source Repository", verificationResult.record.sourceRepo],
                    ["Commit", verificationResult.record.sourceCommit],
                    ["Build Args", verificationResult.record.buildArgs],
                    ["Submitted By", verificationResult.record.submittedBy],
                    ["Ledger", String(verificationResult.record.submittedAt)],
                  ].map(([label, value], i) => (
                    <tr
                      key={label}
                      style={{ borderBottom: i < 4 ? "1px solid #1a1a1a" : "none" }}
                    >
                      <td
                        style={{
                          padding: "12px 16px",
                          color: "#888",
                          fontSize: 13,
                          width: 160,
                          background: "#111",
                        }}
                      >
                        {label}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontFamily: "monospace" }}>
                        {label === "Source Repository" ? (
                          <a
                            href={value}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#8ae4ff" }}
                          >
                            {value}
                          </a>
                        ) : (
                          value
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ContractSpec address={address} network={network} />
        </>
      )}
    </div>
  );
}
