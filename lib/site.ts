export const site = {
  name: "SwitchQuote",
  tagline:
    "Keep the Spanish and the English. Quote-ready Spanish–English interview transcripts — not meeting notes, not auto-translate.",
  url: "https://switchquote.potter-faa.workers.dev",
  /** Debug phase: the whole site stays out of search indexes. */
  indexable: false,
  phrases: {
    transcribe: "Transcribe, don't translate",
    quoteReady: "Quote-ready",
    notMeetingNotes: "Not meeting notes",
  },
} as const;

export const navLinks = [
  { href: "/app", label: "Try it" },
  { href: "/samples", label: "Samples" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/for-journalists", label: "For journalists" },
] as const;

export type WaitlistRole = "journalist" | "researcher" | "other";
