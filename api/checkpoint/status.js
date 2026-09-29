// GET /api/checkpoint/status?session=xxx — is this session still redeemable?
// Used by /get-key to enable the Generate button. Does NOT consume.
//
// Live URL: https://obsidian-key-system.vercel.app/api/checkpoint/status?session=xxx
const cp = require("../../lib/checkpoint");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = String((req.query && req.query.session) || "").slice(0, 64);
  const rec = await cp.getSession(token);
  if (!rec || rec.used)
    return res.status(200).json({ ok: true, valid: false, error: "No active session." });
  if (rec.expiresAt && Date.now() > Date.parse(rec.expiresAt))
    return res.status(200).json({ ok: true, valid: false, error: "Session expired." });

  return res.status(200).json({
    ok: true,
    valid: true,
    provider: rec.provider,
    expiresAt: rec.expiresAt,
  });
};
