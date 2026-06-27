const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const MONDIAD_BASE = 'https://postback.pbmnd.com/track?uid=28794&clickid={CLICKID}&payout={PAYOUT}&goal={GOAL}';
const MONDIAD_GOALS = {
  registration: '578',
  deposit: '579',
  ftd: '579'
};

// Propeller Ads S2S postback URLs — separate goal IDs per event type
const PROPELLER_REGISTRATION = 'https://ad.propellerads.com/conversion.php?aid=3912571&pid=&tid=157268&visitor_id={CLICKID}&payout={PAYOUT}&goal=2';
const PROPELLER_FTD = 'https://ad.propellerads.com/conversion.php?aid=3912571&pid=&tid=157268&visitor_id={CLICKID}&payout={PAYOUT}';

const BRAND_CURRENCY = { easybet: 'ZAR' };
const VALID_EVENTS = new Set(['visit', 'registration', 'ftd', 'deposit']);
const LANDING_PAGE_WHITELIST = new Set(['welcome', 'spinwheel']);
const BOT_BRANDS = new Set(['XxnRKGm']);

function cleanNumericId(v) {
  return (v && /^[0-9]+$/.test(v)) ? v : null;
}

function cleanLandingPage(v) {
  return (v && LANDING_PAGE_WHITELIST.has(v)) ? v : null;
}

function fireMondiad(click_id, payout, goal) {
  const url = MONDIAD_BASE
    .replace('{CLICKID}', encodeURIComponent(click_id))
    .replace('{PAYOUT}', payout || '')
    .replace('{GOAL}', goal);
  fetch(url).catch(err => console.error('Mondiad postback error:', err));
}

function firePropeller(click_id, payout, event_type) {
  const template = event_type === 'registration' ? PROPELLER_REGISTRATION : PROPELLER_FTD;
  const url = template
    .replace('{CLICKID}', encodeURIComponent(click_id))
    .replace('{PAYOUT}', payout || '');
  fetch(url).catch(err => console.error('Propeller postback error:', err));
}

// Detect network from click ID format
// Mondiad click IDs look like: uuid_creativeId (e.g. d7711749-60eb-11f1-bb81-7cc2556b0912_309246)
// Propeller Ads click IDs are shorter alphanumeric strings without this pattern
function detectNetwork(click_id, network_param) {
  if (network_param) return network_param;
  if (!click_id) return 'mondiad';
  return (click_id.includes('-') && click_id.includes('_')) ? 'mondiad' : 'propeller';
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY env vars');
    return res.status(500).send('config error');
  }

  const url = new URL(req.url, 'https://bettrev-media.vercel.app');
  const p = Object.fromEntries(url.searchParams);

  const brand      = p.brand || 'easybet';
  const event_type = p.event || p.cet || 'unknown';

  // Drop bot traffic and invalid events
  if (BOT_BRANDS.has(brand))         return res.status(204).end();
  if (!VALID_EVENTS.has(event_type)) return res.status(400).send('invalid event');

  const click_id     = p.cid || p.t1 || null;
  const zone_id      = cleanNumericId(p.s1 || p.zoneid || null);
  const campaign_id  = cleanNumericId(p.campaign_id || p.campaignid || null);
  const landing_page = cleanLandingPage(p.lp || p.lpage || null);
  const payout       = parseFloat(p.payout) || 0;
  const currency     = BRAND_CURRENCY[brand] || p.currency || 'ZAR';
  const country      = p.country || null;
  const ip           = req.headers['x-forwarded-for'] || null;

  const dedup_key = click_id
    ? `${brand}:${event_type}:${click_id}`
    : `${brand}:${event_type}:${Date.now()}:${Math.random()}`;

  // Dedup check
  const existsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/conversions?dedup_key=eq.${encodeURIComponent(dedup_key)}&select=id&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );
  const existing = await existsRes.json();
  if (existing && existing.length > 0) {
    console.log(`Duplicate blocked: ${dedup_key}`);
    return res.status(200).send('OK');
  }

  // Look up original visit to detect network if not passed explicitly
  let network = p.network || null;
  if (!network && click_id) {
    const visitRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversions?click_id=eq.${encodeURIComponent(click_id)}&brand=eq.${brand}&event_type=eq.visit&select=network&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const visits = await visitRes.json();
    if (visits && visits.length > 0 && visits[0].network) {
      network = visits[0].network;
    }
  }

  // Final network detection fallback
  network = detectNetwork(click_id, network);

  // Insert conversion record
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
    network,
    dedup_key,
    raw_params: p
  };

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/conversions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(record)
  });

  if (!insertRes.ok) {
    const err = await insertRes.text();
    console.error('Supabase insert error:', err);
    return res.status(500).send('error');
  }

  // Fire network postbacks for conversion events
  if (click_id && (event_type === 'registration' || event_type === 'ftd' || event_type === 'deposit')) {
    if (network === 'propeller') {
      firePropeller(click_id, payout, event_type);
    } else {
      // Mondiad
      if (MONDIAD_GOALS[event_type]) {
        fireMondiad(click_id, payout, MONDIAD_GOALS[event_type]);
      }
    }
  }

  return res.status(200).send('OK');
};
