// KV wrapper: uses @vercel/kv when env is configured,
// otherwise falls back to in-memory Map (local dev only — ephemeral on serverless).
let kv = null;
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    kv = require("@vercel/kv").kv;
  }
} catch {
  kv = null;
}

const mem = new Map(); // key -> { value, expiresAtMs }

function hasKv() {
  return !!kv;
}

async function storeGet(storeKey) {
  if (kv) {
    try {
      return await kv.get(storeKey);
    } catch {
      return null;
    }
  }
  const entry = mem.get(storeKey);
  if (!entry) return null;
  if (entry.expiresAtMs && Date.now() > entry.expiresAtMs) {
    mem.delete(storeKey);
    return null;
  }
  return entry.value;
}

async function storeSet(storeKey, value, ttlSeconds) {
  if (kv) {
    if (ttlSeconds) await kv.set(storeKey, value, { ex: ttlSeconds });
    else await kv.set(storeKey, value);
    return;
  }
  mem.set(storeKey, {
    value,
    expiresAtMs: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
  });
}

async function storeDel(storeKey) {
  if (kv) {
    try {
      await kv.del(storeKey);
    } catch {}
    return;
  }
  mem.delete(storeKey);
}

module.exports = { hasKv, storeGet, storeSet, storeDel };
