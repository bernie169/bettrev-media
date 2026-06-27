const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const BOT_BRANDS = new Set(['XxnRKGm']);

function cleanNumericId(v) {
  return (v && /^[0-9]+$/.test(v)) ? v : null;
}

function detectNetwork(click_id, network_param) {
  if (network_param === 'propeller') return 'propeller';
  if (network_param === 'mondiad') return 'mondiad';
  if (!click_id) return 'mondiad';
  return (click_id.includes('-') && click_id.includes('_')) ? 'mondiad' : 'propeller';
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).send('config error');
  }

  const url = new URL(req.url, 'https://bettrev-media.vercel.app');
  const p = Object.fromEntries(url.searchParams);
  const brand = p.brand || 'easybet';

  if (BOT_BRANDS.has(brand)) return res.status(204).end();

  const click_id    = p.cid || p.clickid || null;
  const zone_id     = cleanNumericId(p.s1 || p.zoneid || null);
  const campaign_id = cleanNumericId(p.campaign_id || p.campaignid || null);
  const country     = p.country || null;
  const ip          = req.headers['x-forwarded-for'] || null;
  const dest        = p.dest || null;
  const network     = detectNetwork(click_id, p.network || null);
  const dedup_key   = click_id ? `${brand}:visit:${click_id}` : null;

  // Build redirect URL
  let redirectUrl = null;
  if (dest) {
    try {
      const destUrl = new URL(decodeURIComponent(dest));
      if (click_id) {
        destUrl.searchParams.set(network === 'propeller' ? 'clickid' : 't1', click_id);
      }
      if (zone_id)     destUrl.searchParams.set('s1', zone_id);
      if (campaign_id) destUrl.searchParams.set('campaign_id', campaign_id);
      redirectUrl = destUrl.toString();
    } catch (err) {
      return res.status(400).send('invalid dest');
    }
  }

  // Write to Supabase with hard 1500ms timeout — never block the redirect
  const record = {
    brand, event_type: 'visit', click_id, zone_id, campaign_id,
    landing_page: null, payout: 0, currency: 'ZAR', country, ip,
    network, dedup_key, raw_params: p
  };

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 1500)
  );

  try {
    await Promise.race([
      fetch(`${SUPABASE_URL}/rest/v1/conversions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(record)
      }),
      timeout
    ]);
  } catch (err) {
    // Timeout or DB error — log but don't block redirect
    console.error('Visit insert skipped:', err.message);
  }

  if (redirectUrl) return res.redirect(302, redirectUrl);
  return res.status(200).send('visit recorded');
};
