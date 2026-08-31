import type { VerificationResult } from "@soroban-verify/sdk";

interface Props {
  result: VerificationResult | null;
}

export function VerificationBadge({ result }: Props) {
  if (!result) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: 8,
          padding: "10px 16px",
          color: "#888",
          fontSize: 14,
        }}
      >
        ⏳ Checking verification status...
      </div>
    );
  }

  if (result.verified) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "#0a1f0a",
          border: "1px solid #1a5e1a",
          borderRadius: 8,
          padding: "10px 16px",
          color: "#4caf50",
          fontSize: 14,
          fontWeight: 600,
        }}
        role="status"
        aria-label="Contract is source verified"
      >
        ✅ Source Verified
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "#1a1000",
        border: "1px solid #5e4a00",
        borderRadius: 8,
        padding: "10px 16px",
        color: "#f0a500",
        fontSize: 14,
        fontWeight: 600,
      }}
      role="status"
      aria-label="Contract is not source verified"
    >
      ⚠️ Not Verified
      <span style={{ fontWeight: 400, color: "#888", fontSize: 13 }}>
        — source code not linked
      </span>
    </div>
  );
}
