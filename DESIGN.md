# SwitchQuote design

SwitchQuote looks like a bilingual newsroom desk: warm proof paper, a serif headline, and a mono caption for timecodes. It is a research bench for Spanish–English interviews, not a meeting-notes product and not a generic SaaS skin.

This system has to stay visually distinct from other portfolio sites and from Sonix. Do not use a saturated blue app header, purple pill buttons, a product-tour screenshot, or a legal/medical dashboard as the first screen.

## Principles

1. The transcript is the product. Marketing pages lead to the desk, then get out of the way.
2. Language is labeled twice: color, and a cue that survives without color (ES / EN letters, solid underline for Spanish, dotted underline for English).
3. A language switch is a review task. The words "Review suggested" are the mark. Color alone is not the mark.
4. English translation sits beside the original. It never replaces it.
5. No invented customers, no star ratings, no accuracy percentage.

## Color

Tokens live in `app/globals.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#f3efe4` | Page background. Warm newsprint, not cool gray. |
| `--surface` | `#fffdf8` | Cards and the transcript sheet. |
| `--ink` | `#1c1915` | Text and the bottom call-to-action block. |
| `--brass` | `#8d6a2f` | Eyebrow labels and the sample-wall kicker. |
| `--accent` | `#1e3a5f` | One press-navy action color. Not a bright product blue. |
| `--es` / `--es-line` | `#9a3412` / `#c2410c` | Spanish chip and solid underline. |
| `--en` | `#0f4c81` | English chip and dotted underline. |
| `--mark` | `#f3d27a` | Review highlight and the bottom call-to-action button. |

Spanish and English are not red-vs-green. The chips keep their letters when "Language colors" is off. Low-confidence words use an inset underline, toggled separately, and the tooltip states the percent.

## Type

- Newsreader for headlines and transcript words (the reading face).
- IBM Plex Sans for UI.
- IBM Plex Mono for timecodes, credits, language chips, and the "Review suggested" flag.

Do not set the transcript in a geometric sans. The words are the quote.

## Layout

- Homepage: a two-column hero (promise + upload), then the sample wall (source card on the left, word-level transcript on the right), then numbered steps, three use-case cards, a pricing note, FAQ, and a dark bottom call to action.
- Comparison pages (`/vs/sonix`, and the same frame if a `/vs/rev` page is added later): a quotation, then a three-column table. Unwritten cells say `[Editorial copy pending]` rather than a guessed sentence.
- The transcript toolbar is sticky. Playback speed, find and replace, and export stay with the file name.

## Voice

English UI only. Say "No credit card required" next to the signup grant. Say that Google sign-in is required and that anonymous transcription is not offered. Describe packs as lasting 24 months. When a public competitor price is cited, cite only the figure that was actually read, and label it public.

## What not to add

- Composite case studies or borrowed logos.
- A "99% accuracy" line, with or without a footnote.
- Sonix's blue bar, purple plan button, or export-modal chrome.
- A second accent color for marketing sections. Brass is for labels. Navy is for actions. Yellow is for review.
