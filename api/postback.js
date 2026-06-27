import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Propeller Ads S2S postback URLs — separate goal IDs per event type
const PROPELLER_POSTBACK_REGISTRATION = 'https://ad.propellerads.com/conversion.php?aid=3912571&pid=&tid=157268&visitor_id={clickid}&payout={payout}&goal=2';
const PROPELLER_POSTBACK_FTD = 'https://ad.propellerads.com/conversion.php?aid=3912571&pid=&tid=157268&visitor_id={clickid}&payout={payout}';

// Mondiad postback URL
const MONDIAD_POSTBACK = 'https://postback.pbmnd.com/pb?uid=28794&cid={clickid}&payout={payout}';

export default async function handler(req, res) {
  const {
    brand = 'easybet',
    event = 'ftd',   // visit, registration, ftd, deposit
    cid,              // click ID
    amount = '0',
    currency = 'ZAR',
    s1,               // zone ID
    campaign_id,
    lp,
  } = req.query;

  if (!cid) {
    return res.status(400).send('Missing cid');
  }

  // Deduplication check
  const dedup = `${brand}:${event}:${cid}`;
  const { data: existing } = await supabase
    .from('conversions')
    .select('id')
    .eq('dedup_key', dedup)
    .maybeSingle();

  if (existing) {
    console.log(`Duplicate postback ignored: ${dedup}`);
    return res.status(200).send('OK');
  }

  // Look up the original visit to determine which network this click came from
  const { data: visitRecord } = await supabase
    .from('conversions')
    .select('network, zone_id, campaign_id')
    .eq('click_id', cid)
    .eq('brand', brand)
    .eq('event_type', 'visit')
    .maybeSingle();

  // Detect network from click ID format if no visit record found
  const network = visitRecord?.network ||
    (cid.includes('-') && cid.includes('_') ? 'mondiad' : 'propeller');

  const payout = parseFloat(amount) || 0;

  // Record conversion in Supabase
  await supabase.from('conversions').insert({
    brand,
    event_type: event,
    click_id: cid,
    zone_id: s1 || visitRecord?.zone_id || null,
    campaign_id: campaign_id || visitRecord?.campaign_id || null,
    landing_page: lp || null,
    payout,
    currency,
    network,
    ip: req.headers['x-forwarded-for']?.split(',')[0] || null,
    dedup_key: dedup,
    raw_params: req.query,
  });

  // Fire network postback for registration, FTD and deposit events
  if (event === 'registration' || event === 'ftd' || event === 'deposit') {
    let postbackUrl;

    if (network === 'propeller') {
      // Use correct goal ID per event type
      if (event === 'registration') {
        postbackUrl = PROPELLER_POSTBACK_REGISTRATION;
      } else {
        // FTD and deposit both use the FTD goal
        postbackUrl = PROPELLER_POSTBACK_FTD;
      }
      postbackUrl = postbackUrl
        .replace('{clickid}', encodeURIComponent(cid))
        .replace('{payout}', payout);
    } else {
      // Mondiad — only fires on FTD
      if (event === 'ftd') {
        postbackUrl = MONDIAD_POSTBACK
          .replace('{clickid}', encodeURIComponent(cid))
          .replace('{payout}', payout);
      }
    }

    if (postbackUrl) {
      try {
        const pbRes = await fetch(postbackUrl);
        console.log(`${network} postback fired for ${event}: ${cid} — status ${pbRes.status}`);
      } catch (err) {
        console.error(`${network} postback failed for ${event}: ${cid}`, err.message);
      }
    }
  }

  return res.status(200).send('OK');
}
