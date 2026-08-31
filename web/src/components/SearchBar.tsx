"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export function SearchBar() {
  const [value, setValue] = useState("");
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/contract/${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, maxWidth: 700, margin: "0 auto" }}>
      <input
        type="text"
        placeholder="Enter contract address (C...) or WASM hash"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          flex: 1,
          padding: "14px 18px",
          fontSize: 15,
          background: "#111",
          border: "1px solid #333",
          borderRadius: 10,
          color: "#ededed",
          outline: "none",
          fontFamily: "monospace",
        }}
        aria-label="Contract address or WASM hash"
      />
      <button
        type="submit"
        style={{
          padding: "14px 28px",
          fontSize: 15,
          fontWeight: 700,
          background: "#8ae4ff",
          color: "#000",
          border: "none",
          borderRadius: 10,
          cursor: "pointer",
        }}
      >
        Verify →
      </button>
    </form>
  );
}
