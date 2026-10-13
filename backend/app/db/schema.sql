-- Scenario storage schema. init_db() applies it on every startup, so every
-- statement must be idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS scenarios (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id    TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name             TEXT        NOT NULL,

  -- Full ScenarioInput — needed to re-run the optimizer on load (~2 KB)
  inputs           JSONB       NOT NULL,

  -- OptimizationResult minus conversion_curve and reasoning_trace (~20 KB)
  result_snapshot  JSONB       NOT NULL,

  -- Denormalized columns for card display without parsing JSONB
  filing_status    TEXT,
  num_years        INT,
  estimated_savings NUMERIC,
  ira_balance      NUMERIC,

  CONSTRAINT clerk_user_id_not_empty CHECK (clerk_user_id <> '')
);

-- Index for "list my scenarios, newest first" — the only list query
CREATE INDEX IF NOT EXISTS scenarios_user_date
  ON scenarios (clerk_user_id, created_at DESC);

-- The MCP tools' `scenario` for scenarios saved from a chat (Claude, ChatGPT), so a
-- later chat can pick it up exactly. NULL for scenarios saved on the website.
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS scenario JSONB;
