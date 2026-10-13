-- Scenarios people save from the web app or an MCP client (Claude, ChatGPT).
-- A row holds the scenario's inputs (the same draft the calculator form edits);
-- results are recomputed when it's opened, so they follow engine and tax updates.

CREATE TABLE saved_scenarios (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL CHECK (user_id <> ''),  -- Clerk user id
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  draft       JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX saved_scenarios_user_recent ON saved_scenarios (user_id, updated_at DESC);
