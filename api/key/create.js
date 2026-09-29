// POST /api/key/create — issue a 24h key (unbound, HWID binds on first verify).
// Body: { hwid: string, provider: "linkvertise"|"workink", session: string }
//
// SECURITY: a valid, unused checkpoint session is REQUIRED. Sessions are
// created by POST /api/checkpoint/start (index page) and consumed here
// single-use, bound to HWID + IP with a 20-min TTL. Visiting /get-key
// directly, replaying a session, or swapping HWID/IP all fail.
//
// TODO when provider API keys arrive:
//  - Work.ink: verify completion via their API before consuming the session.
//  - Linkvertise: verify callback/token before consuming the session.
// Until then sessions enforce ORDER (must come through index + provider);
// provider callbacks will additionally enforce COMPLETION.
//
// Live URL: https://obsidian-key-system.vercel.app/api/key/create
const { KEY_TTL_SECONDS, generateKey, hashKey } = require("../../lib/keys");
const { storeSet } = require("../../lib/store");
const cp = require("../../lib/checkpoint");

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-obsidian-secret");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST." });

  if (process.env.OBSIDIAN_API_SECRET) {
    if (req.headers["x-obsidian-secret"] !== process.env.OBSIDIAN_API_SECRET) {
      return res.status(401).json({ ok: false, error: "Bad secret." });
    }
  }

  const body = await readBody(req);
  const hwid = cp.normalizeHwid(body.hwid);
  const provider = String(body.provider || "").toLowerCase().slice(0, 32);
  const session = String(body.session || "").slice(0, 64);
  if (!hwid) return res.status(400).json({ ok: false, error: "Missing hwid." });
  if (!cp.PROVIDERS.includes(provider))
    return res.status(400).json({ ok: false, error: "Unknown provider." });
  if (!session)
    return res.status(403).json({ ok: false, error: "No checkpoint session. Start from the home page first." });

  const ip = cp.clientIp(req);
  if (await cp.overRateLimit(`rl:create:${ip}`, 10, 3600))
    return res.status(429).json({ ok: false, error: "Too many keys. Wait an hour." });

  // TODO: verify provider completion here (Work.ink / Linkvertise API) using
  // body.checkpointToken or a server-side callback record, BEFORE consuming.

  const check = await cp.consumeSession(session, { hwid, ip });
  if (!check.ok) return res.status(403).json({ ok: false, error: check.error });
  if (check.record.provider !== provider)
    return res.status(403).json({ ok: false, error: "Session provider mismatch." });

  const key = generateKey();
  const keyHash = hashKey(key);
  const now = Date.now();
  const expiresAt = new Date(now + KEY_TTL_SECONDS * 1000).toISOString();

  await storeSet(
    `key:${keyHash}`,
    { hwid: null, createdAt: new Date(now).toISOString(), expiresAt, provider, hwidHint: hwid },
    KEY_TTL_SECONDS
  );

  return res.status(200).json({ ok: true, key, expiresAt });
};
