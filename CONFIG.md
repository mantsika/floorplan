# Configuration checklist

The app **cannot upload to R2 or use D1** until Cloudflare is set up. R2 and D1 are **not** `.env` variables — they are Worker bindings.

## What lives where

| Resource | How it's configured | You provide |
|----------|---------------------|-------------|
| **R2** bucket `floorplan` | `wrangler.jsonc` → `r2_buckets` binding `BUCKET` | `npx wrangler r2 bucket create floorplan` |
| **D1** database `floorplan-db` | `wrangler.jsonc` → `d1_databases` binding `DB` | `npx wrangler d1 create floorplan-db` then paste `database_id` into `wrangler.jsonc` |
| **Gemini AI** | Worker secret | `npx wrangler secret put GEMINI_API_KEY` |
| **Frontend API URL** | `VITE_API_URL` in `.env.production` or GitHub secret | Worker URL after deploy, e.g. `https://floorplan-api.<account>.workers.dev` |
| **Cloudflare auth** | GitHub Actions secrets or `wrangler login` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

## R2 folder layout (bucket name: `floorplan`)

| User | Path in bucket |
|------|----------------|
| Guest (temp) | `temp/{guestId}/` |
| Signed up | `{username}/` |
| Test user | `test/` |

## One-time setup

```bash
npx wrangler login

# 1. Create R2 bucket
npx wrangler r2 bucket create floorplan

# 2. Create D1 — copy database_id into wrangler.jsonc
npx wrangler d1 create floorplan-db

# 3. Set Gemini secret on the Worker (must start with AIzaSy)
npx wrangler secret put GEMINI_API_KEY

# 4. Deploy API + run migrations
npm run deploy:api

# 5. Build Pages with Worker URL
echo 'VITE_API_URL=https://floorplan-api.YOUR_SUBDOMAIN.workers.dev' > .env.production
npm run deploy:pages
```

## GitHub Actions secrets

Add these at **github.com/mantsika/floorplan → Settings → Secrets**:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers + R2 + D1 + Pages edit |
| `CLOUDFLARE_ACCOUNT_ID` | From Cloudflare dashboard sidebar |
| `GEMINI_API_KEY` | `AIzaSy...` from https://aistudio.google.com/apikey |
| `VITE_API_URL` | `https://floorplan-api.<account>.workers.dev` |

## Why uploads don't work locally right now

Your `.env.local` likely has only `GEMINI_API_KEY`. Without **`VITE_API_URL`**, the frontend cannot reach the Worker, so:

- `isCloudApiEnabled()` returns `false`
- Images stay as browser previews (not sent to R2)
- AI calls hit local Express (`npm run dev`) or fail if that's not running

To fix for local testing against Cloudflare:

```bash
# .env.local
VITE_API_URL=https://floorplan-api.YOUR_SUBDOMAIN.workers.dev
```

Or for offline Worker dev:

```bash
cp .dev.vars.example .dev.vars   # add your AIzaSy key
npm run dev:api                  # Worker on :8787

# .env.local
VITE_API_URL=http://localhost:8787
```

## Verify deployment

```bash
curl https://floorplan-api.YOUR_SUBDOMAIN.workers.dev/api/health
```

Expected: `{ "status": "ok", "d1Connected": true, "geminiKeyFormatValid": true }`
