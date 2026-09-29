# Obsidian Key System — deploys to https://obsidian-key-system.vercel.app

Scaffold only (planning stage). Endpoints are stubbed with TODOs for checkpoint + rate limits.

## Structure

```
keysystem/
  api/health.js       GET  /api/health
  api/key/create.js   POST /api/key/create  { hwid?, provider?, checkpointToken? } -> { key, expiresAt }
  api/key/verify.js   POST /api/key/verify  { key, hwid } -> { valid, expiresAt }
  api/key/reset.js    POST /api/key/reset   (501 stub)
  lib/keys.js         key gen (OBS-XXXXXX-XXXXXX) + sha256 + 24h TTL
  lib/store.js        @vercel/kv wrapper, memory fallback for local dev
  public/index.html   landing (links to /get-key)
  public/get-key.html /get-key — provider picker (Linkvertise / Work.ink)
```

## Push to GitHub + Vercel

Option A — same repo, Vercel project rooted at `keysystem/` (recommended):
1. `git add keysystem && git commit -m "keysystem scaffold" && git push`
2. Vercel → Add New Project → import your repo → set **Root Directory = `keysystem`**
3. Framework Preset: **Other**. No build command, output = `public`.
4. Add env vars (Storage → Create KV database, or manually):
   - `KV_REST_API_URL`, `KV_REST_API_TOKEN`
   - optional `OBSIDIAN_API_SECRET` (if set, client must send `x-obsidian-secret`)
5. Deploy → live at `https://obsidian-key-system.vercel.app`
6. Test: `GET /api/health`, then POST to `/api/key/create` and `/api/key/verify`.

Option B — separate repo just for keysystem:
1. Copy `keysystem/` contents to a new repo root, push, import in Vercel with no root override.

## Flow (order enforced)

1. App opens `/?hwid=XXX`. User picks Linkvertise/Work.ink.
2. `/` calls `POST /api/checkpoint/start { hwid, provider }` → single-use session (20 min, HWID+IP bound), then redirects to the provider.
3. Provider (target = `https://obsidian-key-system.vercel.app/get-key`) sends user back.
4. `/get-key` checks `GET /api/checkpoint/status?session=` → enables Generate → `POST /api/key/create { hwid, provider, session }` consumes the session, issues 24h key.
5. App verifies via `POST /api/key/verify { key, hwid }` (binds HWID first use).

Direct `/get-key` visits, replays, HWID/IP swaps all fail. Rate limits: 10 starts + 10 creates per IP/hour.

## Provider links (you provide later)

- Edit `public/index.html`: set `LINKVERTISE_URL` and `WORKINK_URL`.
- Inside each dashboard set its destination/target to `https://obsidian-key-system.vercel.app/get-key`.
- When API keys arrive, add completion verification in `api/key/create.js` (TODO markers).

## TODOs before live

- [ ] Real completion proof per provider in `create.js` (Work.ink/Linkvertise API).
- [ ] Reset policy in `reset.js` (admin secret or cooldown).
- [ ] Custom domain if you want it instead of `*.vercel.app`.
