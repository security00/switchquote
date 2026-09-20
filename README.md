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
migrations/          # D1 SQL
open-next.config.ts
wrangler.toml        # Worker + D1 + assets bindings
```

## License

Private / all rights reserved unless otherwise noted by the repo owner.
