CREATE TABLE IF NOT EXISTS raw_transcript_events (
  dedupe_key VARCHAR PRIMARY KEY,
  source_path VARCHAR NOT NULL,
  source_line BIGINT,
  session_id VARCHAR,
  cwd VARCHAR,
  event_type VARCHAR NOT NULL,
  event_subtype VARCHAR,
  event_timestamp TIMESTAMP,
  payload_json JSON NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_middleware_sdk_messages (
  dedupe_key VARCHAR PRIMARY KEY,
  source_path VARCHAR NOT NULL,
  source_line BIGINT,
  session_id VARCHAR,
  event_type VARCHAR NOT NULL,
  event_subtype VARCHAR,
  event_timestamp TIMESTAMP,
  payload_json JSON NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_hook_events (
  dedupe_key VARCHAR PRIMARY KEY,
  source_path VARCHAR NOT NULL,
  source_line BIGINT,
  session_id VARCHAR,
  hook_event_name VARCHAR,
  event_timestamp TIMESTAMP,
  payload_json JSON NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_permission_events (
  dedupe_key VARCHAR PRIMARY KEY,
  source_path VARCHAR NOT NULL,
  source_line BIGINT,
  session_id VARCHAR,
  cwd VARCHAR,
  tool_name VARCHAR,
  decision VARCHAR,
  event_timestamp TIMESTAMP,
  payload_json JSON NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_otel_logs (
  dedupe_key VARCHAR PRIMARY KEY,
  source_path VARCHAR NOT NULL,
  source_line BIGINT,
  session_id VARCHAR,
  trace_id VARCHAR,
  span_id VARCHAR,
  event_name VARCHAR,
  event_timestamp TIMESTAMP,
  payload_json JSON NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_otel_spans (
  dedupe_key VARCHAR PRIMARY KEY,
  source_path VARCHAR NOT NULL,
  source_line BIGINT,
  session_id VARCHAR,
  trace_id VARCHAR,
  span_id VARCHAR,
  parent_span_id VARCHAR,
  span_name VARCHAR,
  start_timestamp TIMESTAMP,
  end_timestamp TIMESTAMP,
  payload_json JSON NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_metadata (
  key VARCHAR PRIMARY KEY,
  value VARCHAR NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

