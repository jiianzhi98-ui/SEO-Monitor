-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sites table
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('large', 'medium', 'small')),
  crawl_type TEXT NOT NULL CHECK (crawl_type IN ('sitemap', 'html', 'rss')),
  list_url TEXT,
  title_selector TEXT,
  date_selector TEXT,
  crawl_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (crawl_frequency IN ('daily', 'every3days', 'weekly')),
  enable_version_clean BOOLEAN NOT NULL DEFAULT FALSE,
  version_suffixes TEXT[] DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain);
CREATE INDEX IF NOT EXISTS idx_sites_is_enabled ON sites(is_enabled);
CREATE INDEX IF NOT EXISTS idx_sites_category ON sites(category);

-- Raw keywords table (auto-delete after 30 days)
CREATE TABLE IF NOT EXISTS raw_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword TEXT NOT NULL,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  source_url TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_keywords_site_id ON raw_keywords(site_id);
CREATE INDEX IF NOT EXISTS idx_raw_keywords_discovered_at ON raw_keywords(discovered_at);
CREATE INDEX IF NOT EXISTS idx_raw_keywords_keyword ON raw_keywords(keyword);

-- Function to auto-delete raw_keywords older than 30 days
CREATE OR REPLACE FUNCTION delete_old_raw_keywords()
RETURNS void AS $$
BEGIN
  DELETE FROM raw_keywords WHERE discovered_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Daily stats table (permanent)
CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  new_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(site_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_site_id ON daily_stats(site_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_stat_date ON daily_stats(stat_date);

-- Index snapshots table (permanent)
CREATE TABLE IF NOT EXISTS index_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  index_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(site_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_index_snapshots_site_id ON index_snapshots(site_id);
CREATE INDEX IF NOT EXISTS idx_index_snapshots_snapshot_date ON index_snapshots(snapshot_date);

-- Hot keywords table (auto-delete after 90 days)
CREATE TABLE IF NOT EXISTS hot_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword TEXT NOT NULL,
  site_count INTEGER NOT NULL DEFAULT 0,
  site_list TEXT[] DEFAULT '{}',
  suggestions TEXT[] DEFAULT '{}',
  suggestion_count INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'queue' CHECK (priority IN ('urgent', 'today', 'queue')),
  period_start DATE NOT NULL DEFAULT CURRENT_DATE,
  period_end DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hot_keywords_keyword ON hot_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_hot_keywords_priority ON hot_keywords(priority);
CREATE INDEX IF NOT EXISTS idx_hot_keywords_period_start ON hot_keywords(period_start);
CREATE INDEX IF NOT EXISTS idx_hot_keywords_site_count ON hot_keywords(site_count DESC);

-- Function to auto-delete hot_keywords older than 90 days
CREATE OR REPLACE FUNCTION delete_old_hot_keywords()
RETURNS void AS $$
BEGIN
  DELETE FROM hot_keywords WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Weight history table (permanent)
CREATE TABLE IF NOT EXISTS weight_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  pc_weight INTEGER NOT NULL DEFAULT 0,
  mobile_weight INTEGER NOT NULL DEFAULT 0,
  UNIQUE(site_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_weight_history_site_id ON weight_history(site_id);
CREATE INDEX IF NOT EXISTS idx_weight_history_record_date ON weight_history(record_date);

-- Optional: create a scheduled job using pg_cron (if available)
-- SELECT cron.schedule('0 2 * * *', $$SELECT delete_old_raw_keywords()$$);
-- SELECT cron.schedule('0 3 * * *', $$SELECT delete_old_hot_keywords()$$);
