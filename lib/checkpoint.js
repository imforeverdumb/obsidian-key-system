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
const MIN_SESSION_AGE_SECONDS = 30; // start -> create faster than this = automation, reject
const PROVIDERS = ["linkvertise", "workink"];

// Trust Vercel's own headers first. x-forwarded-for's FIRST entry is
// attacker-controlled (clients can inject it), so it must never win.
function clientIp(req) {
  const h = req.headers || {};
  const real = h["x-real-ip"];
  if (typeof real === "string" && real.length) return real.trim().slice(0, 64);
  const vvf = h["x-vercel-forwarded-for"];
  if (typeof vvf === "string" && vvf.length) return vvf.split(",")[0].trim().slice(0, 64);
  const sock = req.socket?.remoteAddress;
  if (sock) return String(sock).slice(0, 64);
  const fwd = h["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    return (parts[parts.length - 1] || "").slice(0, 64); // last = closest untrusted hop
  }
  return "";
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
    lvOk: false, // set true once Linkvertise anti-bypass hash verifies
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

async function markLvOk(token) {
  token = String(token || "").trim().slice(0, 64);
  if (!token) return false;
  const rec = await storeGet(`sess:${token}`);
  if (!rec || rec.used) return false;
  const ttl = Math.max(
    60,
    Math.floor((Date.parse(rec.expiresAt) - Date.now()) / 1000) || SESSION_TTL_SECONDS
  );
  await storeSet(`sess:${token}`, { ...rec, lvOk: true }, ttl);
  return true;
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
  MIN_SESSION_AGE_SECONDS,
  PROVIDERS,
  clientIp,
  normalizeHwid,
  createSession,
  getSession,
  markLvOk,
  consumeSession,
  overRateLimit,
};
