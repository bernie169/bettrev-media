import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const {
    brand = 'easybet',
    cid,          // click ID from any network
    s1,           // zone ID
    campaign_id,
    lp,           // landing page identifier
    dest,         // destination URL
    network,      // 'propeller' or 'mondiad' — passed explicitly or detected
  } = req.query;

  // Detect network from click ID format
  // Mondiad click IDs look like: uuid_creativeId (e.g. d7711749-60eb-11f1-bb81-7cc2556b0912_309246)
  // Propeller Ads click IDs are typically shorter alphanumeric strings
  const detectedNetwork = network || (cid && cid.includes('-') && cid.includes('_') ? 'mondiad' : 'propeller');

  // Record the visit in Supabase
  const dedup = cid ? `${brand}:visit:${cid}` : null;

  await supabase.from('conversions').insert({
    brand,
    event_type: 'visit',
    click_id: cid || null,
    zone_id: s1 || null,
    campaign_id: campaign_id || null,
    landing_page: lp || null,
    network: detectedNetwork,
    ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || null,
    dedup_key: dedup,
    raw_params: req.query,
  });

  // Build destination URL with click ID appended correctly per network
  let destination = dest || `https://www.easybet.co.za`;

  if (cid) {
    const separator = destination.includes('?') ? '&' : '?';
    if (detectedNetwork === 'propeller') {
      // Propeller Ads uses clickid parameter
      destination = `${destination}${separator}clickid=${cid}`;
    } else {
      // Mondiad uses t1 parameter
      destination = `${destination}${separator}t1=${cid}`;
    }
  }

  if (campaign_id) {
    destination = `${destination}&campaign_id=${campaign_id}`;
  }

  return res.redirect(302, destination);
}
