// api/postback.js
// Receives conversion postbacks from Easybet (and other brands)
// Deduplicates, stores to Supabase, and fires back to Mondiad

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://gpzovlgzuloevxvutenv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwem92bGd6dWxvZXZ4dnV0ZW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDE1NDAsImV4cCI6MjA5MDUxNzU0MH0.QJrn3arLWcnY4ACTFpGtbD9pRTIHcMmqr6w8S2OqPdE';

// Mondiad postback — fires when FTD is confirmed
// uid=28794 is your Mondiad ID
const MONDIAD_POSTBACK = 'https://postback.pbmnd.com/track?uid=28794&clickid={CLICKID}&payout={PAYOUT}';

// Brand currency map — add new brands here as you go
const BRAND_CURRENCY = {
  easybet: 'ZAR',
};

export default async function handler(req) {
  const url = new URL(req.url);
  const p = Object.fromEntries(url.searchParams);

  const brand       = p.brand || 'easybet';
  const event_type  = p.event || p.cet || 'unknown';
  const click_id    = p.cid || p.t1 || null;
  const zone_id     = p.s1 || p.zoneid || null;
  const campaign_id = p.campaign_id || p.campaignid || null;
  const landing_page = p.lp || p.lpage || null;
  const payout      = parseFloat(p.payout) || 0;
  const currency    = BRAND_CURRENCY[brand] || p.currency || 'ZAR';
  const country     = p.country || null;
  const ip          = req.headers.get('x-forwarded-for') || null;

  // ── DEDUPLICATION ──
  // Key: brand + event_type + click_id — same event on same click can't fire twice
  const dedup_key = click_id
    ? `${brand}:${event_type}:${click_id}`
    : `${brand}:${event_type}:${Date.now()}:${Math.random()}`;

  // Check if this exact event already exists
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
    return new Response('OK', { status: 200 }); // Return 200 so brand doesn't retry
  }

  // ── INSERT TO SUPABASE ──
  const record = {
    brand,
    event_type,
    click_id,
    zone_id,
    campaign_id,
    landing_page,
    payout,
    currency,
    country,
    ip,
    dedup_key,
    raw_params: p
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
    return new Response('error', { status: 500 });
  }

  // ── DUAL-FIRE TO MONDIAD (FTD only) ──
  // Only fire to Mondiad on FTD — that's the event Mondiad cares about for optimisation
  if (event_type === 'ftd' && click_id) {
    const mondiadUrl = MONDIAD_POSTBACK
      .replace('{CLICKID}', encodeURIComponent(click_id))
      .replace('{PAYOUT}', payout || '');

    fetch(mondiadUrl).catch(err => console.error('Mondiad postback error:', err));
  }

  return new Response('OK', { status: 200 });
}
