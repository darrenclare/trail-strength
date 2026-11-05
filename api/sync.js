// POST /api/sync  { code, data }  ->  { data: merged }
// Stores one copy of the app's data per sync code in Upstash Redis, merging on every call.
const crypto = require('crypto');
const { mergeStores } = require('../merge.js');

const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!URL || !TOKEN) return res.status(500).json({ error: 'Database not configured' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const code = body && body.code, data = body && body.data;
  if (typeof code !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(code)) return res.status(400).json({ error: 'Bad sync code' });
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Bad data' });
  const key = 'trail-strength:' + crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
  try {
    const raw = await redis(['GET', key]);
    let stored = {};
    if (raw) { try { stored = JSON.parse(raw); } catch { stored = {}; } }
    const merged = mergeStores(stored, data);
    const json = JSON.stringify(merged);
    if (json.length > 900000) return res.status(413).json({ error: 'Data too large' });
    await redis(['SET', key, json]);
    return res.status(200).json({ data: merged, at: Date.now() });
  } catch (e) {
    return res.status(502).json({ error: 'Sync failed' });
  }
};
