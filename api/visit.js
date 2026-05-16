const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const LANDING_PAGE_WHITELIST = new Set(['welcome', 'spinwheel']);
const BOT_BRANDS = new Set(['XxnRKGm']);

function cleanNumericId(v) {
  return (v && /^[0-9]+$/.test(v)) ? v : null;
}
function cleanLandingPage(v) {
  return (v && LANDING_PAGE_WHITELIST.has(v)) ? v : null;
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY env vars');
    return res.status(500).send('config error');
  }

  const url = new URL(req.url, 'https://bettrev-media.vercel.app');
  const p = Object.fromEntries(url.searchParams);

  const brand = p.brand || 'easybet';

  // Drop bot traffic silently
  if (BOT_BRANDS.has(brand)) {
    return res.status(204).end();
  }

  const click_id     = p.cid || p.clickid || null;
  const zone_id      = cleanNumericId(p.s1 || p.zoneid || null);
  const campaign_id  = cleanNumericId(p.campaign_id || p.campaignid || null);
  const landing_page = cleanLandingPage(p.lp || null);
  const country      = p.country || null;
  const ip           = req.headers['x-forwarded-for'] || null;
  const dest         = p.dest || null;
  const dedup_key    = click_id ? `${brand}:visit:${click_id}` : null;

  const record = {
    brand,
    event_type: 'visit',
    click_id,
    zone_id,
    campaign_id,
    landing_page,
    payout: 0,
    currency: 'ZAR',
    country,
    ip,
    dedup_key,
    raw_params: p
  };

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/conversions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(record)
    });
  } catch (err) {
    console.error('Visit insert error:', err);
  }

  if (dest) {
    try {
      const destUrl = new URL(decodeURIComponent(dest));
      if (click_id)    destUrl.searchParams.set('t1', click_id);
      if (zone_id)     destUrl.searchParams.set('s1', zone_id);
      if (campaign_id) destUrl.searchParams.set('campaign_id', campaign_id);
      return res.redirect(302, destUrl.toString());
    } catch (err) {
      console.error('Invalid dest URL:', dest, err);
      return res.status(400).send('invalid dest');
    }
  }

  return res.status(200).send('visit recorded');
};
