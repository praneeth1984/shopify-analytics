CREATE TABLE IF NOT EXISTS feedback (
  id           TEXT    PRIMARY KEY,
  type         TEXT    NOT NULL CHECK(type IN ('bug_report', 'feature_request')),
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  page         TEXT,
  severity     TEXT    CHECK(severity IN ('minor', 'blocks', 'data_wrong')),
  frequency    TEXT    CHECK(frequency IN ('daily', 'weekly', 'monthly', 'occasionally')),
  shop_domain  TEXT    NOT NULL,
  plan         TEXT    NOT NULL CHECK(plan IN ('free', 'pro')),
  status       TEXT    NOT NULL DEFAULT 'open'
                       CHECK(status IN ('open', 'reviewing', 'planned', 'shipped', 'wont_fix')),
  upvotes      INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT    NOT NULL,
  shipped_at   TEXT
);

CREATE TABLE IF NOT EXISTS upvotes (
  feedback_id  TEXT NOT NULL REFERENCES feedback(id),
  shop_domain  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (feedback_id, shop_domain)
);

CREATE INDEX IF NOT EXISTS idx_feedback_status  ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type    ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_shop    ON feedback(shop_domain);
CREATE INDEX IF NOT EXISTS idx_upvotes_feedback ON upvotes(feedback_id);
