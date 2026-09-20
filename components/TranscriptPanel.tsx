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
  const border =
    variant === "before" ? "border-amber-200 bg-amber-50/50" : "border-teal-200 bg-teal-50/40";

  return (
    <div className={`rounded-xl border p-5 ${border}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {subtitle}
        </span>
      </div>
      <ul className="mt-4 space-y-3 font-mono text-sm leading-relaxed text-slate-800">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
