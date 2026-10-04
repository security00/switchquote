export function TranscriptPanel({
  title,
  subtitle,
  lines,
  variant,
}: {
  title: string;
  subtitle: string;
  lines: string[];
  variant: "before" | "after";
}) {
  const before = variant === "before";
  return (
    <div className={`overflow-hidden rounded-xl border ${before ? "border-rule bg-paper" : "border-accent/25 bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.14)]"}`}>
      <div className={`flex items-baseline justify-between gap-3 border-b px-5 py-3 ${before ? "border-rule" : "border-accent/15 bg-accent-tint/60"}`}>
        <h3 className="font-display text-lg text-ink">{title}</h3>
        <span className={`shrink-0 font-mono text-[10.5px] font-medium uppercase tracking-wider ${before ? "text-ink-faint" : "text-accent"}`}>{subtitle}</span>
      </div>
      <ul className={`space-y-3 px-5 py-5 font-display text-[17px] leading-relaxed ${before ? "text-ink-soft" : "text-ink"}`}>
        {lines.map((line, i) => (
          <li key={i} className={before ? "" : "border-l-2 border-es-line/60 pl-3"}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
