-- Operational tables for abuse controls (R8). Kept in a separate schema so the
-- read-only agent role never sees them and the ops role can't touch movie data.

CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ops.requests (
  id          bigserial PRIMARY KEY,
  ip_hash     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  question    text,
  status      text        NOT NULL DEFAULT 'started',  -- started | ok | error | rejected
  cost_usd    numeric(10,5) NOT NULL DEFAULT 0,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms  integer
);

CREATE INDEX IF NOT EXISTS requests_ip_time_idx ON ops.requests (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_time_idx    ON ops.requests (created_at DESC);

COMMENT ON TABLE ops.requests IS 'One row per /api/ask call: drives the per-IP hourly limit and the daily spend cap.';
COMMENT ON COLUMN ops.requests.ip_hash IS 'SHA-256 of client IP + salt; raw IPs are never stored.';
