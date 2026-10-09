# SwitchQuote

Phase A marketing site for **quote-ready Spanish–English interview transcripts** — not meeting notes, not auto-translate.

**Stack:** Next.js App Router · React 19 · TypeScript · Tailwind CSS · [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) · Cloudflare Workers · D1 (waitlist)

**Worker name:** `switchquote` → `https://switchquote.<your-subdomain>.workers.dev`

## Product scope (Phase A)

- Landing, samples, SEO discovery pages, privacy/terms
- Waitlist form → `POST /api/waitlist` → D1 table `waitlist`
- Invite-only transcription billed in **credits** (1 credit ≈ 1 minute), with Stripe Checkout for subscriptions and packs

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
| `/pricing` | Plans (month/year) and credit packs. Checkout requires a signed-in allowlisted account |
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

## Credits and Stripe (test mode)

Usage is a `credit_ledger` in D1. **60 units = 1 credit ≈ 1 minute** of default-engine audio. Kinds: `signup`, `subscription`, `pack`, `charge`, `refund`. Charges spend the signup grant first, then subscription credits, then packs (soonest expiry inside a pool). Packs expire 24 months after purchase. Signup credits and subscription credits do not expire. A yearly subscription is billed once a year and still mints **one month of credits at a time** while the paid period is active.

`SIGNUP_FREE_CREDITS` (wrangler var, default `20`) replaces `SIGNUP_FREE_MINUTES`. Existing `minute_ledger` rows are copied by `migrations/0004_credit_ledger.sql` and are not granted a second time. A yearly plan does not drop 12 months of credits at once: each elapsed month of the paid period is minted once, on `invoice.paid` or the next account load.

USD daily breakers (`USER_DAILY_SPEND_LIMIT_USD`, `DAILY_SPEND_LIMIT_USD`) are unchanged. Visitors still never see spend numbers.

### Secrets and vars

Set with `wrangler secret put` (never commit the values):

| Name | Purpose |
|------|---------|
| `STRIPE_SECRET_KEY` | Test secret (`sk_test_…`) or, preferably, a restricted key (`rk_test_…`) that can create Checkout Sessions and Customers and read Subscriptions |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`) for `POST /api/stripe/webhook` |
| `AUTH_GOOGLE_ID` | Google OAuth client id. **Not set in production today** — the UI says sign-in is off until it is |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `AUTH_SECRET` | Auth.js session secret |

Price IDs are in `wrangler.toml` (test mode, not secrets). Override with the same names in `.dev.vars` if a Price is rotated:

`STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_YEARLY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_STUDIO_MONTHLY`, `STRIPE_PRICE_STUDIO_YEARLY`, `STRIPE_PRICE_PACK_S`, `STRIPE_PRICE_PACK_M`, `STRIPE_PRICE_PACK_L`.

Lookup keys (`switchquote_starter_monthly`, …) are accepted on webhooks if the Price ID does not match. `automatic_tax` is off.

The Stripe Payment Links in the approved catalog are a **temporary hosted fallback**. They do not attach `user_id`, so this app will not credit an account from those links. In-app Checkout (`POST /api/checkout`) sets `client_reference_id` and metadata (`user_id`, `sku`) and is the path that grants credits.

### How an allowlisted account tests checkout

1. `npx wrangler d1 migrations apply switchquote --remote` (includes `0004_credit_ledger.sql`).
2. `wrangler secret put` the four auth/Stripe secrets above. Google OAuth must be configured or nobody can sign in (`google-not-configured` stays honest in the UI).
3. In the Stripe Dashboard (test mode), add the endpoint `https://switchquote.potter-faa.workers.dev/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
4. Sign in as an allowlisted Google account (`xiangqiling5204@gmail.com`), open `/pricing`, and start Checkout. Card `4242 4242 4242 4242` is the usual test card.
5. Credits appear after the webhook, not when the browser lands on `/app?checkout=success`. Refresh `/app` or `/api/me` and confirm `creditsLeft`.
6. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and put that `whsec_…` in `.dev.vars` as `STRIPE_WEBHOOK_SECRET`.

Fulfillment is idempotent on the Stripe event id and on ledger refs (`pack:{session}`, `sub:{subscription}:{YYYY-MM}`). Replaying a webhook does not double-credit.

## License

Private / all rights reserved unless otherwise noted by the repo owner.
