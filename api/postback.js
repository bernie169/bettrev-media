const SUPABASE_URL = 'https://gpzovlgzuloevxvutenv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwem92bGd6dWxvZXZ4dnV0ZW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDE1NDAsImV4cCI6MjA5MDUxNzU0MH0.QJrn3arLWcnY4ACTFpGtbD9pRTIHcMmqr6w8S2OqPdE';

const MONDIAD_POSTBACK = 'https://postback.pbmnd.com/track?uid=28794&clickid={CLICKID}&payout={PAYOUT}';

const BRAND_CURRENCY = { easybet: 'ZAR' };

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://bettrev-media.vercel.app');
  const p = Object.fromEntries(url.searchParams);

  const brand        = p.brand || 'easybet';
  const event_type   = p.event || p.cet || 'unknown';
  const click_id     = p.cid || p.t1 || null;
  const zone_id      = p.s1 || p.zoneid || null;
  const campaign_id  = p.campaign_id || p.campaignid || null;
  const landing_page = p.lp || p.lpage || null;
  const payout       = parseFloat(p.payout) || 0;
  const currency     = BRAND_CURRENCY[brand] || p.currency || 'ZAR';
  const country      = p.country || null;
  const ip           = req.headers['x-forwarded-for'] || null;

  const dedup_key = click_id
    ? `${brand}:${event_type}:${click_id}`
    : `${brand}:${event_type}:${Date.now()}:${Math.random()}`;

  // Check for duplicate
  const existsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/conversions?dedup_key=eq.${encodeURIComponent(dedup_key)}&select=id&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );
  const existing = await existsRes.json();
  if (existing && existing.length > 0) {
    console.log(`Duplicate blocked: ${dedup_key}`);
    return res.status(200).send('OK');
  }

  // Insert to Supabase
  const record = {
    brand, event_type, click_id, zone_id, campaign_id,
    landing_page, payout, currency, country, ip, dedup_key, raw_params: p
  };

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/conversions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(record)
  });

  if (!insertRes.ok) {
    const err = await insertRes.text();
    console.error('Supabase insert error:', err);
    return res.status(500).send('error');
  }

  // Fire to Mondiad on FTD only
  if (event_type === 'ftd' && click_id) {
    const mondiadUrl = MONDIAD_POSTBACK
      .replace('{CLICKID}', encodeURIComponent(click_id))
      .replace('{PAYOUT}', payout || '');
    fetch(mondiadUrl).catch(err => console.error('Mondiad postback error:', err));
  }

  return res.status(200).send('OK');
}
