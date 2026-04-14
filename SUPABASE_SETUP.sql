-- BetTrev Tracker v3 — Full Setup
-- Run in Supabase SQL Editor
-- https://gpzovlgzuloevxvutenv.supabase.co → SQL Editor → New Query
-- Safe to run even if you ran previous versions

-- ── BRANDS TABLE ──
CREATE TABLE IF NOT EXISTS brands (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  color text DEFAULT '#e8ff47',
  currency text DEFAULT 'ZAR',
  active boolean DEFAULT true
);

-- ── CONVERSIONS TABLE ──
CREATE TABLE IF NOT EXISTS conversions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  brand text NOT NULL DEFAULT 'easybet',
  event_type text NOT NULL,        -- 'visit', 'registration', 'ftd', 'deposit'
  click_id text,                   -- BeMob click ID (t1)
  zone_id text,                    -- Mondiad zone (s1)
  campaign_id text,                -- Mondiad campaign ID
  landing_page text,               -- e.g. 'spinwheel', 'scratchcard'
  payout numeric DEFAULT 0,
  currency text DEFAULT 'ZAR',
  ip text,
  country text,
  dedup_key text UNIQUE,           -- prevents duplicate postbacks
  raw_params jsonb
);

-- ── INDEXES ──
CREATE INDEX IF NOT EXISTS idx_conv_brand       ON conversions(brand);
CREATE INDEX IF NOT EXISTS idx_conv_event_type  ON conversions(event_type);
CREATE INDEX IF NOT EXISTS idx_conv_created_at  ON conversions(created_at);
CREATE INDEX IF NOT EXISTS idx_conv_click_id    ON conversions(click_id);
CREATE INDEX IF NOT EXISTS idx_conv_campaign    ON conversions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_conv_dedup       ON conversions(dedup_key);

-- ── RLS ──
ALTER TABLE conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert"        ON conversions;
DROP POLICY IF EXISTS "Allow public select"        ON conversions;
DROP POLICY IF EXISTS "Allow public insert brands" ON brands;
DROP POLICY IF EXISTS "Allow public select brands" ON brands;
DROP POLICY IF EXISTS "Allow public update brands" ON brands;
DROP POLICY IF EXISTS "Allow public delete brands" ON brands;

CREATE POLICY "Allow public insert"        ON conversions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select"        ON conversions FOR SELECT USING (true);
CREATE POLICY "Allow public insert brands" ON brands FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select brands" ON brands FOR SELECT USING (true);
CREATE POLICY "Allow public update brands" ON brands FOR UPDATE USING (true);
CREATE POLICY "Allow public delete brands" ON brands FOR DELETE USING (true);

-- ── SEED EASYBET ──
INSERT INTO brands (name, slug, color, currency)
VALUES ('Easybet', 'easybet', '#e8ff47', 'ZAR')
ON CONFLICT (slug) DO NOTHING;
