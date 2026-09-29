// POST /api/key/verify — validate key + enforce 1-HWID lock.
// Body: { key: string, hwid: string }
// First valid verify binds the key to that HWID.
//
// Live URL: https://obsidian-key-system.vercel.app/api/key/verify
const { KEY_TTL_SECONDS, hashKey, normalizeHwid } = require("../../lib/keys");
const { storeGet, storeSet, storeDel } = require("../../lib/store");

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
  if (req.method !== "POST") return res.status(405).json({ valid: false, error: "Use POST." });

  if (process.env.OBSIDIAN_API_SECRET) {
    if (req.headers["x-obsidian-secret"] !== process.env.OBSIDIAN_API_SECRET) {
      return res.status(401).json({ valid: false, error: "Bad secret." });
    }
  }

  const body = await readBody(req);
  const key = String(body.key || "").trim();
  const hwid = normalizeHwid(body.hwid);
  if (!key || !hwid) return res.status(400).json({ valid: false, error: "Missing key/hwid." });

  const record = await storeGet(`key:${hashKey(key)}`);
  if (!record) return res.status(200).json({ valid: false, error: "Invalid or expired key." });

  if (record.expiresAt && Date.now() > Date.parse(record.expiresAt)) {
    await storeDel(`key:${hashKey(key)}`);
    return res.status(200).json({ valid: false, error: "Key expired." });
  }

  // Bind-on-first-use: lock to HWID.
  if (!record.hwid) {
    const ttl = Math.max(60, Math.floor((Date.parse(record.expiresAt) - Date.now()) / 1000) || KEY_TTL_SECONDS);
    const updated = { ...record, hwid };
    await storeSet(`key:${hashKey(key)}`, updated, ttl);
    return res.status(200).json({ valid: true, expiresAt: record.expiresAt, bound: true });
  }

  if (record.hwid !== hwid) {
    return res.status(200).json({ valid: false, error: "Key is locked to another PC." });
  }

  return res.status(200).json({ valid: true, expiresAt: record.expiresAt, bound: false });
};
