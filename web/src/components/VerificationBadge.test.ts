/**
 * Tests for VerificationBadge component wording.
 *
 * The badge must NOT say "Source Verified" (which implies a cryptographic
 * rebuild confirmation that the CLI does not yet perform). Instead it must
 * say "Source Claim Recorded" to accurately describe what the registry
 * actually stores: a submitter's claim about the source, not a confirmed build.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Read the source file directly — no JSX runtime needed for a string-search test.
const badgeSource = readFileSync(
  resolve(__dirname, "VerificationBadge.tsx"),
  "utf-8"
);

describe("VerificationBadge wording", () => {
  it('does not contain the misleading text "Source Verified"', () => {
    expect(badgeSource).not.toContain("Source Verified");
  });

  it('contains the accurate text "Source Claim Recorded"', () => {
    expect(badgeSource).toContain("Source Claim Recorded");
  });

  it('does not say "is source verified" in any aria-label', () => {
    expect(badgeSource).not.toMatch(/aria-label=["'][^"']*source verified[^"']*["']/i);
  });

  it('aria-label for verified badge references "source claim"', () => {
    expect(badgeSource).toContain("source claim recorded on-chain");
  });

  it('aria-label for unverified badge is updated too', () => {
    expect(badgeSource).toContain("no source claim on-chain");
  });
});
