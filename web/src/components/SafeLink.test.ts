/**
 * Tests for SafeLink — ensures on-chain URL data cannot be used for XSS
 * via javascript:, data:, or other unsafe schemes.
 *
 * Regression test for B2: web/src/app/contract/[address]/page.tsx previously
 * rendered <a href={record.sourceRepo}> where sourceRepo is arbitrary
 * attacker-submitted on-chain data with no URL validation.
 */

import { describe, it, expect } from "vitest";
import { isSafeUrl } from "./SafeLink.js";

describe("isSafeUrl", () => {
  // --- Safe URLs (should be allowed as href) ---
  it("allows a normal https GitHub URL", () => {
    expect(isSafeUrl("https://github.com/org/repo")).toBe(true);
  });

  it("allows https URL with path, query, and fragment", () => {
    expect(isSafeUrl("https://example.com/path?q=1#anchor")).toBe(true);
  });

  // --- Unsafe schemes (must not render as anchor) ---
  it("blocks javascript: scheme", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("blocks javascript: with leading whitespace", () => {
    // Some browsers accept whitespace before the scheme
    expect(isSafeUrl("  javascript:alert(1)")).toBe(false);
  });

  it("blocks javascript: with mixed case", () => {
    expect(isSafeUrl("JavaScript:alert(1)")).toBe(false);
  });

  it("blocks data: URI", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("blocks vbscript: scheme", () => {
    expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("blocks http:// (intentionally not allowed — source repos should use TLS)", () => {
    expect(isSafeUrl("http://github.com/org/repo")).toBe(false);
  });

  it("blocks relative paths", () => {
    expect(isSafeUrl("/relative/path")).toBe(false);
  });

  it("blocks empty string", () => {
    expect(isSafeUrl("")).toBe(false);
  });

  it("blocks a plain string with no scheme", () => {
    expect(isSafeUrl("github.com/org/repo")).toBe(false);
  });

  it("blocks ftp:// scheme", () => {
    expect(isSafeUrl("ftp://files.example.com/file")).toBe(false);
  });
});
