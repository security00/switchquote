# SwitchQuote

Phase A marketing site for **quote-ready Spanish–English interview transcripts** — not meeting notes, not auto-translate.

**Stack:** Next.js App Router · React 19 · TypeScript · Tailwind CSS · [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) · Cloudflare Workers · D1 (waitlist)

**Worker name:** `switchquote` → `https://switchquote.<your-subdomain>.workers.dev`

## Product scope (Phase A)

- Landing, samples, SEO discovery pages, privacy/terms
- Waitlist form → `POST /api/waitlist` → D1 table `waitlist`
- **No** audio upload, STT pipeline, or Stripe checkout yet

## Prerequisites

- Node.js 20+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (required for live deploy)
- Wrangler CLI (installed as a dev dependency)

```bash
npm install
```

## Local development

1. Copy env template:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Apply D1 migrations locally (creates SQLite under `.wrangler`):

   ```bash
   npx wrangler d1 migrations apply switchquote --local
   ```

3. Run the Next.js dev server (OpenNext dev integration + local D1 bindings):

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

### Preview in the Workers runtime

```bash
npm run preview
```

## Build

Next.js production build (used by OpenNext):

```bash
npm run build
```

Cloudflare Worker bundle (OpenNext):

```bash
npm run cf:build
```

Output lands in `.open-next/` (gitignored).

## Deploy to Cloudflare Workers

### One-time Cloudflare setup

1. Log in:

   ```bash
   npx wrangler login
   ```

2. Create the D1 database:

   ```bash
   npx wrangler d1 create switchquote
   ```

   Copy the `database_id` from the command output into `wrangler.toml` (replace the placeholder `00000000-0000-0000-0000-000000000000`).

3. Apply migrations to production D1:

   ```bash
   npx wrangler d1 migrations apply switchquote --remote
   ```

4. (Optional) Regenerate binding types after editing `wrangler.toml`:

   ```bash
   npm run cf-typegen
   ```

### Deploy

```bash
npm run deploy
```

This runs `cf:build` then `wrangler deploy`, publishing to `*.workers.dev`.

## Waitlist API

**`POST /api/waitlist`**

JSON body:

| Field | Type | Values |
|-------|------|--------|
| `email` | string | valid email |
| `role` | string | `journalist` · `researcher` · `other` |
| `bilingual_interviews` | boolean | regular bilingual interviews Y/N |

D1 schema (`migrations/0001_create_waitlist.sql`):

- `email` (unique)
- `role`
- `bilingual_interviews` (0/1)
- `created_at`

## Transcription engines (pluggable)

Every engine sits behind one adapter interface (`lib/engines/types.ts` → `EngineAdapter`) and returns the
same normalized output: segments → words (`{w, lang, start, end}`), speakers, duration, plus the USD cost of
that one call and how the cost was obtained. The route (`app/api/transcribe/route.ts`) never knows which
vendor it is talking to.

| id | Model (default) | Route | Diarization | Word timestamps | Per-word language | Cost recorded as |
|----|-----------------|-------|-------------|-----------------|-------------------|------------------|
| `deepgram` (default) | `nova-3` + `language=multi` | direct | yes | yes | **yes (engine)** | list $0.0052/min × provider duration |
| `assemblyai` | `universal-3-5-pro`, code-switching en+es | direct (upload → poll → delete) | yes | yes | no → fallback tagger | list ($0.21 + $0.02 diarization)/hr × provider duration |
| `gemini` | `google/gemini-3.8-flash` | OpenRouter (`GEMINI_ROUTE=google` for native) | model-generated | estimated | span tags from the prompt (model-generated) | OpenRouter `usage.cost` (native: list $/token × reported tokens) |
| `grok` | `grok-voice-transcribe-2.0` | xAI direct (`GROK_ROUTE=openrouter` → `x-ai/grok-stt-1.0`, text only) | xAI: yes / OR: no | xAI: yes / OR: estimated | no → fallback tagger | xAI: list $0.10/hr × duration · OR: `usage.cost` |
| `elevenlabs` | `scribe_v2` | direct | yes | yes | no → fallback tagger | list $0.22/hr × provider duration |

An engine is **enabled** only when every key it needs for its route is set and it is not listed in
`ENGINES_DISABLED`. Engines with a missing key still ship and show up (with the missing key *names*) at
`GET /api/admin/engines`. At the time of writing `XAI_API_KEY` and `ELEVENLABS_API_KEY` are not set, so
`grok` (xAI route) and `elevenlabs` are disabled.

### Choosing the engine

- `STT_ENGINE` (wrangler var) picks the engine for everyone. Default `deepgram`. (`STT_PROVIDER` is read as a legacy alias.)
- Admins listed in `ADMIN_EMAILS` can override per request for testing with the header `x-sq-engine: <id>` on
  `POST /api/transcribe`. Anyone else sending the header gets 403. Users never choose an engine.

### Fallback switch detector

Engines without per-word language (`caps.languageTags === "none"`) go through `lib/langtag.ts`:

- `LANG_TAGGER=llm` (default): one `LANG_TAGGER_MODEL` call (default `google/gemini-3.5-flash-lite` via OpenRouter)
  per ~2,500 words returns language runs over indexed tokens ("0s 4e 9s", JSON-schema constrained). Lines whose answer doesn't fit fall back to the
  heuristic. Logged as its own spend event (`kind='tag'`, `engine='langtag'`, provider-returned cost).
  Measured ≈ $0.0006–0.0007 per transcript minute (2026-10-05).
- `LANG_TAGGER=heuristic`: free lexicon + orthography rules; ambiguous words inherit their neighbours' language.
- `LANG_TAGGER=off`: words stay `other` (no switch highlights).

The transcript row records where the tags came from (`transcripts.lang_tags`: `word`, `span-prompted`,
`fallback:llm`, `fallback:heuristic`, `fallback:llm+heuristic`); JSON export includes it as `lang_tags`.

### Spend ledger

Every paid call is a row in `spend_events`: `kind` (`stt` / `tag` / `translate`), `engine`, `provider`
(`<engine>:<route>`), `model`, `audio_seconds`, `micro_usd`, `cost_source`. `cost_source` is one of
`provider_returned` (the provider's response states the charge, e.g. OpenRouter `usage.cost`),
`list_price_x_provider_duration`, `list_price_x_detected_duration`, `list_price_x_tokens`, or `estimate`
(call failed before a cost was known). Rows are written at submission (estimate, used by the USD breakers)
and settled with the actual figure.

### Adding a model

1. Create `lib/engines/<id>.ts` exporting an `EngineAdapter` (id, label, caps, model/route/requiredKeys,
   list price + source URL, `transcribe()` returning the normalized output and its cost). Helpers for
   grouping words into segments, speaker ids and estimated timestamps are in `lib/engines/util.ts`.
2. Add it to the `ENGINES` array in `lib/engines/registry.ts`.
3. Add its key name to `AppEnv` in `lib/cf.ts` (and `wrangler secret put <KEY>`), optional model/route vars to `wrangler.toml`.

The contract test in `lib/engines/engines.test.ts` checks every registered adapter automatically.

## Routes

| Path | Purpose |
|------|---------|
| `/` | Hero, Otter/Whisper contrast, waitlist |
| `/samples` | Illustrative before/after panels (labeled Sample) |
| `/how-it-works` | Transcribe ≠ translate |
| `/for-journalists` | ICP-focused copy |
| `/otter-alternative-for-journalists` | Discovery SEO |
| `/transcribe-spanish-english-interview` | Discovery SEO |
| `/privacy` · `/terms` | Minimal legal stubs |

## Copy rules

- English-only UI
- Phrase bank: **Transcribe, don't translate** · **Quote-ready** · **Not meeting notes**
- No invented traffic or revenue stats

## Project layout

```
app/                 # App Router pages + /api/waitlist
components/          # Header, Footer, WaitlistForm, samples UI
lib/site.ts          # Brand constants
lib/engines/         # Transcription engine adapters + registry
lib/langtag.ts       # Fallback switch detector (LLM / heuristic)
migrations/          # D1 SQL
open-next.config.ts
wrangler.toml        # Worker + D1 + assets bindings
```

## License

Private / all rights reserved unless otherwise noted by the repo owner.
