// POST /api/checkpoint/lv-verify — confirm a Linkvertise completion.
// Body: { session: string, hash: string }
//
// Linkvertise (with Anti-Bypassing enabled) appends ?hash=<64hex> to our
// /get-key target after the user finishes the ad step. The hash lives only
// ~10 seconds, so /get-key calls this IMMEDIATELY on arrival. We check the
// hash with Linkvertise and flag the session lvOk — /api/key/create then
// requires that flag for provider=linkvertise.
//
// Needs LINKVERTISE_TOKEN env (dashboard Settings -> Anti-Bypassing).
// Without it this returns ok:false/not-configured and create() stays in
// session-only mode for linkvertise (back-compat until you enable it).
//
// Live URL: https://obsidian-key-system.vercel.app/api/checkpoint/lv-verify
const cp = require("../../lib/checkpoint");
const { storeGet } = require("../../lib/store");

const LV_ENDPOINT = "https://publisher.linkvertise.com/api/v1/anti_bypassing";

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

  if (!process.env.LINKVERTISE_TOKEN) {
    return res.status(200).json({ ok: false, error: "not-configured" });
  }

  const body = await readBody(req);
  const session = String(body.session || "").slice(0, 64);
  const hash = String(body.hash || "").slice(0, 128);
  if (!session || !/^[0-9a-f]{32,128}$/i.test(hash)) {
    return res.status(400).json({ ok: false, error: "Missing session/hash." });
  }

  const rec = await storeGet(`sess:${session}`);
  if (!rec || rec.used) {
    return res.status(403).json({ ok: false, error: "No active session." });
  }

  try {
    const url = `${LV_ENDPOINT}?token=${encodeURIComponent(process.env.LINKVERTISE_TOKEN)}&hash=${encodeURIComponent(hash)}`;
    const r = await fetch(url, { method: "POST" });
    const text = (await r.text()).trim().toUpperCase();
    if (text.startsWith("TRUE")) {
      await cp.markLvOk(session);
      return res.status(200).json({ ok: true });
    }
    return res.status(403).json({ ok: false, error: "Linkvertise rejected this completion." });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Linkvertise check failed: " + e.message });
  }
};
