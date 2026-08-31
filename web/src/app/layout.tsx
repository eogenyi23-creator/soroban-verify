import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "soroban-verify — Stellar Contract Verification",
  description:
    "On-chain source verification registry for Soroban smart contracts. Etherscan-style verified contracts, native to Stellar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#ededed" }}>
        <nav style={{ borderBottom: "1px solid #222", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ color: "#8ae4ff", textDecoration: "none", fontWeight: 700, fontSize: 18 }}>
            🔍 soroban-verify
          </a>
          <span style={{ color: "#555", fontSize: 13 }}>Soroban Contract Source Registry</span>
        </nav>
        <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
          {children}
        </main>
        <footer style={{ textAlign: "center", padding: 24, color: "#555", fontSize: 13, borderTop: "1px solid #1a1a1a" }}>
          Built on Stellar · Open source ·{" "}
          <a href="https://github.com/eogenyi23-creator/soroban-verify" style={{ color: "#8ae4ff" }}>
            GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
