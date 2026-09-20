export const site = {
  name: "SwitchQuote",
  tagline:
    "Quote-ready Spanish–English interview transcripts — not meeting notes, not auto-translate.",
  url: "https://switchquote.workers.dev",
  phrases: {
    transcribe: "Transcribe, don't translate",
    quoteReady: "Quote-ready",
    notMeetingNotes: "Not meeting notes",
  },
} as const;

export const navLinks = [
  { href: "/samples", label: "Samples" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/for-journalists", label: "For journalists" },
] as const;

export type WaitlistRole = "journalist" | "researcher" | "other";
