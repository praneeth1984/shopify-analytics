-- Analytics tables for D1-backed reports (Sprint 4).
-- All shop-scoped tables have shop_domain as first PK segment and a CHECK
-- constraint so malformed domains are caught at the DB layer.
-- WITHOUT ROWID optimises the composite-PK lookups these reports do.

CREATE TABLE IF NOT EXISTS order_tax (
  shop_domain   TEXT    NOT NULL CHECK(shop_domain LIKE '%.myshopify.com'),
  order_id      TEXT    NOT NULL,
  tax_title     TEXT    NOT NULL DEFAULT '__no_tax__',
  rate          REAL    NOT NULL DEFAULT 0,
  amount_minor  INTEGER NOT NULL DEFAULT 0,  -- minor units (e.g. cents for USD)
  currency      TEXT    NOT NULL DEFAULT 'USD',
  country_code  TEXT,
  province_code TEXT,
  order_date    TEXT    NOT NULL,            -- ISO date YYYY-MM-DD
  cancelled     INTEGER NOT NULL DEFAULT 0, -- 0 = active, 1 = cancelled
  PRIMARY KEY (shop_domain, order_id, tax_title)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS order_utm (
  shop_domain   TEXT    NOT NULL CHECK(shop_domain LIKE '%.myshopify.com'),
  order_id      TEXT    NOT NULL,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  referrer      TEXT,
  channel       TEXT    NOT NULL DEFAULT 'direct',  -- direct|organic|paid|email|social|referral
  order_date    TEXT    NOT NULL,
  revenue_minor INTEGER NOT NULL DEFAULT 0,
  currency      TEXT    NOT NULL DEFAULT 'USD',
  PRIMARY KEY (shop_domain, order_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS product_collection (
  shop_domain      TEXT NOT NULL CHECK(shop_domain LIKE '%.myshopify.com'),
  product_id       TEXT NOT NULL,
  collection_id    TEXT NOT NULL,
  collection_title TEXT NOT NULL,
  PRIMARY KEY (shop_domain, product_id, collection_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS order_product (
  shop_domain   TEXT    NOT NULL CHECK(shop_domain LIKE '%.myshopify.com'),
  order_id      TEXT    NOT NULL,
  product_id    TEXT    NOT NULL,
  variant_id    TEXT    NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  revenue_minor INTEGER NOT NULL DEFAULT 0,
  currency      TEXT    NOT NULL DEFAULT 'USD',
  order_date    TEXT    NOT NULL,
  cancelled     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_domain, order_id, variant_id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS backfill_state (
  shop_domain  TEXT NOT NULL CHECK(shop_domain LIKE '%.myshopify.com'),
  job          TEXT NOT NULL,  -- 'order_tax' | 'order_utm' | 'product_collection'
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK(status IN ('pending','running','done','failed')),
  cursor       TEXT,           -- pagination cursor for resumable backfills
  started_at   TEXT,
  completed_at TEXT,
  error        TEXT,
  PRIMARY KEY (shop_domain, job)
) WITHOUT ROWID;

-- Indexes for the common query patterns these reports use
CREATE INDEX IF NOT EXISTS idx_order_tax_date     ON order_tax(shop_domain, order_date);
CREATE INDEX IF NOT EXISTS idx_order_tax_country  ON order_tax(shop_domain, country_code);
CREATE INDEX IF NOT EXISTS idx_order_utm_date     ON order_utm(shop_domain, order_date);
CREATE INDEX IF NOT EXISTS idx_order_utm_channel  ON order_utm(shop_domain, channel);
CREATE INDEX IF NOT EXISTS idx_order_product_date ON order_product(shop_domain, order_date);
CREATE INDEX IF NOT EXISTS idx_product_coll       ON product_collection(shop_domain, collection_id);
