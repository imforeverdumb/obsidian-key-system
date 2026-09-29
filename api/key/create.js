// POST /api/key/create — issue a 24h key (unbound, HWID binds on first verify).
// Body: { hwid?: string, provider?: "linkvertise"|"workink"|string, checkpointToken?: string }
//
// Provider flow: site /get-key lets the user pick Linkvertise or Work.ink,
// completes it there, then calls this endpoint with { hwid, provider }.
// TODO (before going live):
//  1. Verify checkpointToken/callback per provider — reject if missing/invalid.
//  2. Rate-limit by IP (e.g. Vercel KV 5/hour) to stop key farming.
//
// Live URL: https://obsidian-key-system.vercel.app/api/key/create
const { KEY_TTL_SECONDS, generateKey, hashKey } = require("../../lib/keys");
const { storeSet } = require("../../lib/store");

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
  // TODO: validate body.checkpointToken per provider here before issuing.
  const provider = String(body.provider || "").slice(0, 32) || null;
  const hwidHint = String(body.hwid || "").slice(0, 128) || null;

  const key = generateKey();
  const keyHash = hashKey(key);
  const now = Date.now();
  const expiresAt = new Date(now + KEY_TTL_SECONDS * 1000).toISOString();

  await storeSet(
    `key:${keyHash}`,
    { hwid: null, createdAt: new Date(now).toISOString(), expiresAt, provider, hwidHint },
    KEY_TTL_SECONDS
  );

  return res.status(200).json({ ok: true, key, expiresAt });
};
