// api/visit.js
// Fires on every click through BeMob — records the visit AND redirects to the offer
// Use this as your BeMob destination URL instead of the raw Easybet link
// e.g. https://your-vercel.app/api/visit?brand=easybet&cid={clickId}&s1={trafficSourceId}&campaign_id={campaignId}&lp=spinwheel&dest=https://ebpartners.click/o/lWk0jB?lpage=L1QjNG


const SUPABASE_URL = 'https://gpzovlgzuloevxvutenv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwem92bGd6dWxvZXZ4dnV0ZW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDE1NDAsImV4cCI6MjA5MDUxNzU0MH0.QJrn3arLWcnY4ACTFpGtbD9pRTIHcMmqr6w8S2OqPdE';

export default async function handler(req, res) {
const url = new URL(req.url, `https://${req.headers['host']}`);
  const p = Object.fromEntries(url.searchParams);

  const click_id   = p.cid || p.clickid || null;
  const brand      = p.brand || 'easybet';
  const zone_id    = p.s1 || p.zoneid || null;
  const campaign_id = p.campaign_id || p.campaignid || null;
  const landing_page = p.lp || null;
  const country    = p.country || null;
  const ip         = req.headers.get('x-forwarded-for') || null;
  const dest       = p.dest || null;

  // Dedup key: brand + click_id + event_type
  const dedup_key = click_id ? `${brand}:visit:${click_id}` : null;

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

  // Fire and forget — don't block the redirect
  const supabaseInsert = fetch(`${SUPABASE_URL}/rest/v1/conversions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(record)
  }).catch(err => console.error('Visit insert error:', err));

  // Redirect immediately — don't wait for Supabase
  if (dest) {
    // Append t1 and s1 to the destination so Easybet gets the click ID
    const destUrl = new URL(decodeURIComponent(dest));
    if (click_id) destUrl.searchParams.set('t1', click_id);
    if (zone_id)  destUrl.searchParams.set('s1', zone_id);
    if (campaign_id) destUrl.searchParams.set('campaign_id', campaign_id);

    await supabaseInsert; // tiny wait — edge functions are fast
    return Response.redirect(destUrl.toString(), 302);
  }

  await supabaseInsert;
  return new Response('visit recorded', { status: 200 });
}
