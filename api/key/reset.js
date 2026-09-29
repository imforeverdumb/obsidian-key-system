// POST /api/key/reset — manual HWID reset (stub for now).
// Body: { key: string, hwid: string }
// TODO: require admin secret or per-key cooldown (e.g. 1 reset / 7 days).
//
// Live URL: https://obsidian-key-system.vercel.app/api/key/reset
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  return res.status(501).json({
    ok: false,
    error: "Not wired yet. Decide reset policy (admin-only vs cooldown) first.",
  });
};
