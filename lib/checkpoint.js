// Checkpoint sessions: prove the user came through index (/) and a provider
// before /get-key can issue a key.
//
// Flow:
//   1. User picks provider on /  ->  POST /api/checkpoint/start { hwid, provider }
//      Server stores sess:{token} = { hwid, provider, ip, used:false } (20 min TTL).
//   2. Browser goes to Linkvertise/Work.ink. Those links must target
//      https://obsidian-key-system.vercel.app/get-key (static destination you set
//      once inside Linkvertise/Work.ink dashboards).
//   3. Provider sends user back to /get-key. Page reads the session (query ->
//      sessionStorage -> cookie) and calls POST /api/key/create { hwid, provider, session }.
//   4. create consumes the session (single-use). Deep-linking /get-key with no
//      session, reusing a session, or switching HWID/IP all get rejected.
//
// When you get provider API keys later, add real completion verification in
// create.js (stubs marked TODO) — sessions enforce ORDER, provider callbacks
// will enforce COMPLETION.
const crypto = require("crypto");
const { storeGet, storeSet, storeDel } = require("./store");

const SESSION_TTL_SECONDS = 20 * 60;
const PROVIDERS = ["linkvertise", "workink"];

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"] || req.headers["x-real-ip"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim().slice(0, 64);
  return (req.socket?.remoteAddress || "").slice(0, 64);
}

function normalizeHwid(hwid) {
  return String(hwid || "").trim().slice(0, 128);
}

async function createSession({ hwid, provider, ip }) {
  const token = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  const record = {
    hwid,
    provider,
    ip,
    used: false,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
  await storeSet(`sess:${token}`, record, SESSION_TTL_SECONDS);
  return { token, record };
}

async function getSession(token) {
  token = String(token || "").trim().slice(0, 64);
  if (!token) return null;
  return storeGet(`sess:${token}`);
}

// Single-use consume: validates token -> HWID -> IP, then deletes it.
async function consumeSession(token, { hwid, ip }) {
  const rec = await getSession(token);
  if (!rec) return { ok: false, error: "No checkpoint session. Start from the home page first." };
  if (rec.used) return { ok: false, error: "Session already redeemed." };
  if (rec.expiresAt && Date.now() > Date.parse(rec.expiresAt)) {
    await storeDel(`sess:${token}`);
    return { ok: false, error: "Session expired. Go through the step again." };
  }
  if (rec.hwid && rec.hwid !== hwid)
    return { ok: false, error: "Session belongs to a different HWID." };
  if (rec.ip && ip && rec.ip !== ip)
    return { ok: false, error: "Session IP mismatch. Use the same network." };
  await storeDel(`sess:${token}`);
  return { ok: true, record: rec };
}

// Fixed-window counter: returns true when over the limit.
async function overRateLimit(key, max, windowSeconds) {
  const cur = (await storeGet(key)) || 0;
  if (Number(cur) >= max) return true;
  await storeSet(key, Number(cur) + 1, windowSeconds);
  return false;
}

module.exports = {
  SESSION_TTL_SECONDS,
  PROVIDERS,
  clientIp,
  normalizeHwid,
  createSession,
  getSession,
  consumeSession,
  overRateLimit,
};
