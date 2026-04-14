const SUPABASE_URL = 'https://gpzovlgzuloevxvutenv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwem92bGd6dWxvZXZ4dnV0ZW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDE1NDAsImV4cCI6MjA5MDUxNzU0MH0.QJrn3arLWcnY4ACTFpGtbD9pRTIHcMmqr6w8S2OqPdE';

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://bettrev-media.vercel.app');
  const p = Object.fromEntries(url.searchParams);

  const click_id    = p.cid || p.clickid || null;
  const brand       = p.brand || 'easybet';
  const zone_id     = p.s1 || p.zoneid || null;
  const campaign_id = p.campaign_id || p.campaignid || null;
  const landing_page = p.lp || null;
  const country     = p.country || null;
  const ip          = req.headers['x-forwarded-for'] || null;
  const dest        = p.dest || null;
  const dedup_key   = click_id ? `${brand}:visit:${click_id}` : null;

  const record = {
    brand, event_type: 'visit', click_id, zone_id, campaign_id,
    landing_page, payout: 0, currency: 'ZAR', country, ip, dedup_key, raw_params: p
  };

try {
    await fetch(`${SUPABASE_URL}/rest/v1/conversions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(record)
    });
  } catch (err) {
    console.error('Visit insert error:', err);
  }

  if (dest) {
    const destUrl = new URL(decodeURIComponent(dest));
    if (click_id) destUrl.searchParams.set('t1', click_id);
    if (zone_id) destUrl.searchParams.set('s1', zone_id);
    if (campaign_id) destUrl.searchParams.set('campaign_id', campaign_id);
    return res.redirect(302, destUrl.toString());
  }

  return res.status(200).send('visit recorded');
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(record)
  }).catch(err => console.error('Visit insert error:', err));

  if (dest) {
    const destUrl = new URL(decodeURIComponent(dest));
    if (click_id) destUrl.searchParams.set('t1', click_id);
    if (zone_id) destUrl.searchParams.set('s1', zone_id);
    if (campaign_id) destUrl.searchParams.set('campaign_id', campaign_id);
    return res.redirect(302, destUrl.toString());
  }

  return res.status(200).send('visit recorded');
}
