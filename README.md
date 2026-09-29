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
   - `ADMIN_KEYS` (comma-separated master keys: skip KV/HWID checks, ~never expire.
     Set in Vercel dashboard ONLY — never commit real keys, this repo is public.)
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

Direct `/get-key` visits, replays, instant start→create scripts (<30s), HWID/IP swaps all fail.
Rate limits: 10 starts + 10 creates per IP/hour, 5 starts per HWID/hour.
Keys are 60-bit random (not enumerable). KV is REQUIRED — without it serverless
instances don't share sessions/keys/rate-limits (see pentest notes).

## Provider setup

- `public/index.html` holds `LINKVERTISE_URL` and `WORKINK_URL`.
- Inside each dashboard set destination/target to `https://obsidian-key-system.vercel.app/get-key`.
- **Linkvertise completion proof**: dashboard Settings → enable **Anti-Bypassing** → copy the
  auth token → Vercel env `LINKVERTISE_TOKEN` → redeploy. From then on linkvertise keys
  require a confirmed `?hash=` (verified server-side, single-use, ~10s window).
  Without the env var, linkvertise stays session-gated (order enforced, completion not proven).
- **Work.ink**: no public completion-verification API exists, so it stays session-gated.
  If they publish one, wire it into `api/checkpoint/lv-verify.js`-style flow.

## TODOs before live

- [x] KV connected? Check `/api/health` → must say "connected", NOT "memory-fallback".
- [ ] `LINKVERTISE_TOKEN` set + Anti-Bypassing enabled in dashboard.
- [ ] Reset policy in `reset.js` (admin secret or cooldown).
- [ ] Custom domain if you want it instead of `*.vercel.app`.
