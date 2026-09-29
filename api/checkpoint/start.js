// POST /api/checkpoint/start — begin a checkpoint (called from index /).
// Body: { hwid: string, provider: "linkvertise" | "workink" }
// Returns: { ok, session, expiresAt }
//
// The browser must complete the provider step next; the session is single-use
// and checked by POST /api/key/create. Direct /get-key visits have no session
// and cannot mint keys.
//
// Live URL: https://obsidian-key-system.vercel.app/api/checkpoint/start
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST." });

  const body = await readBody(req);
  const hwid = cp.normalizeHwid(body.hwid);
  const provider = String(body.provider || "").toLowerCase().slice(0, 32);
  if (!hwid) return res.status(400).json({ ok: false, error: "Missing hwid." });
  if (!cp.PROVIDERS.includes(provider))
    return res.status(400).json({ ok: false, error: "Unknown provider." });

  const ip = cp.clientIp(req);
  if (await cp.overRateLimit(`rl:start:${ip}`, 10, 3600))
    return res.status(429).json({ ok: false, error: "Too many tries. Wait an hour." });
  if (await cp.overRateLimit(`rl:starthwid:${hwid}`, 5, 3600))
    return res.status(429).json({ ok: false, error: "Too many tries for this PC. Wait an hour." });

  const { token, record } = await cp.createSession({ hwid, provider, ip });
  return res.status(200).json({ ok: true, session: token, expiresAt: record.expiresAt });
};
