import { SearchBar } from "@/components/SearchBar";

export default function HomePage() {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 12 }}>
          Soroban Contract Verification
        </h1>
        <p style={{ color: "#aaa", fontSize: 18, maxWidth: 600, margin: "0 auto" }}>
          Verify that a deployed Soroban contract matches its published source code.
          Etherscan-style trust, native to Stellar.
        </p>
      </div>

      <SearchBar />

      <div style={{ marginTop: 64, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        <FeatureCard
          icon="🔒"
          title="On-chain Records"
          desc="Verification records are stored on Stellar — no centralised database, no single point of failure."
        />
        <FeatureCard
          icon="🔗"
          title="Reproducible Builds"
          desc="Link any contract address to its exact source commit and build arguments so anyone can re-verify."
        />
        <FeatureCard
          icon="⚡"
          title="Native ABI Support"
          desc="Soroban stores contract specs on-chain. We surface them alongside verification status automatically."
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #222",
        borderRadius: 12,
        padding: 24,
        background: "#111",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{title}</h3>
      <p style={{ margin: 0, color: "#888", fontSize: 14, lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}
