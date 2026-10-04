/** Wordmark glyph: two transcript lines in the two language colours, offset like a switch. */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="var(--ink)" />
      <rect x="6" y="8" width="11" height="3" rx="1.5" fill="var(--es-line)" />
      <rect x="11" y="12.5" width="11" height="3" rx="1.5" fill="#7fb8e6" />
      <rect x="6" y="17" width="16" height="3" rx="1.5" fill="#ffffff" opacity="0.85" />
    </svg>
  );
}
