const crypto = require("crypto");

const KEY_TTL_SECONDS = 24 * 60 * 60; // 24h keys
const KEY_PREFIX = "OBS";

function generateKey() {
  // e.g. OBS-3F8KQ2-9D7M4A (unambiguous alphabet, no 0/O/1/I)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rand = (n) => {
    const buf = crypto.randomBytes(n);
    let s = "";
    for (let i = 0; i < n; i++) s += alphabet[buf[i] % alphabet.length];
    return s;
  };
  return `${KEY_PREFIX}-${rand(6)}-${rand(6)}`;
}

function hashKey(key) {
  return crypto.createHash("sha256").update(String(key).trim().toUpperCase()).digest("hex");
}

function normalizeHwid(hwid) {
  return String(hwid || "").trim().slice(0, 128);
}

module.exports = { KEY_TTL_SECONDS, generateKey, hashKey, normalizeHwid };
