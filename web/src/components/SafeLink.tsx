/**
 * SafeLink — renders on-chain URLs as clickable anchors only when they start
 * with "https://". Any other value (including javascript:, data:, vbscript:,
 * plain paths, or empty strings) is rendered as plain text to prevent stored
 * XSS from attacker-submitted on-chain data.
 *
 * The sourceRepo field in VerificationRecord is submitted by any Stellar
 * address and stored on-chain with no URL validation in the contract — it
 * must be treated as untrusted input before being placed in an href.
 */

interface SafeLinkProps {
  href: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * Returns true only for URLs that begin with "https://".
 * Deliberately conservative: we only allow the scheme we actually
 * expect for source repository URLs. http:// is excluded intentionally
 * because source repos should always be served over TLS.
 */
export function isSafeUrl(url: string): boolean {
  return url.startsWith("https://");
}

export function SafeLink({ href, style, children }: SafeLinkProps) {
  if (!isSafeUrl(href)) {
    // Render as plain text — the value is not a safe URL to navigate to.
    return (
      <span
        style={style}
        title="URL not rendered as a link: only https:// URLs are allowed"
      >
        {children ?? href}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={style}
    >
      {children ?? href}
    </a>
  );
}
