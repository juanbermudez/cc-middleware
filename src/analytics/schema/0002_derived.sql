CREATE TABLE IF NOT EXISTS fact_interactions (
  interaction_id VARCHAR PRIMARY KEY,
  root_session_id VARCHAR NOT NULL,
  session_id VARCHAR NOT NULL,
  transcript_kind VARCHAR NOT NULL,
  trace_kind VARCHAR NOT NULL,
  source_kind VARCHAR NOT NULL,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  event_count BIGINT NOT NULL,
  error_count BIGINT NOT NULL,
  keyword_mentions BIGINT NOT NULL,
  tool_use_count BIGINT NOT NULL,
  input_tokens BIGINT NOT NULL,
  output_tokens BIGINT NOT NULL,
  cache_read_tokens BIGINT NOT NULL,
  cache_creation_tokens BIGINT NOT NULL,
  estimated_cost_usd DOUBLE NOT NULL,
  context_estimate_tokens_peak BIGINT NOT NULL,
  summary VARCHAR
);

CREATE TABLE IF NOT EXISTS fact_requests (
  request_id VARCHAR PRIMARY KEY,
  interaction_id VARCHAR NOT NULL,
  root_session_id VARCHAR NOT NULL,
  session_id VARCHAR NOT NULL,
  transcript_kind VARCHAR NOT NULL,
  request_timestamp TIMESTAMP,
  model VARCHAR,
  stop_reason VARCHAR,
  assistant_uuid VARCHAR,
  input_tokens BIGINT NOT NULL,
  output_tokens BIGINT NOT NULL,
  cache_read_tokens BIGINT NOT NULL,
  cache_creation_tokens BIGINT NOT NULL,
  estimated_cost_usd DOUBLE NOT NULL,
  context_estimate_tokens BIGINT NOT NULL,
  source_dedupe_key VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_tool_calls (
  tool_call_id VARCHAR PRIMARY KEY,
  interaction_id VARCHAR NOT NULL,
  root_session_id VARCHAR NOT NULL,
  session_id VARCHAR NOT NULL,
  transcript_kind VARCHAR NOT NULL,
  tool_use_id VARCHAR,
  tool_name VARCHAR,
  source_assistant_uuid VARCHAR,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  is_error BOOLEAN NOT NULL,
  error_message VARCHAR,
  source_dedupe_key VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_errors (
  error_id VARCHAR PRIMARY KEY,
  interaction_id VARCHAR,
  root_session_id VARCHAR,
  session_id VARCHAR,
  transcript_kind VARCHAR,
  error_kind VARCHAR NOT NULL,
  tool_name VARCHAR,
  error_code VARCHAR,
  message VARCHAR NOT NULL,
  error_timestamp TIMESTAMP,
  source_dedupe_key VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_subagent_runs (
  subagent_run_id VARCHAR PRIMARY KEY,
  root_session_id VARCHAR NOT NULL,
  session_id VARCHAR NOT NULL,
  agent_id VARCHAR,
  slug VARCHAR,
  team_name VARCHAR,
  teammate_name VARCHAR,
  source_tool_assistant_uuid VARCHAR,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  event_count BIGINT NOT NULL,
  request_count BIGINT NOT NULL,
  error_count BIGINT NOT NULL,
  tool_use_count BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_compactions (
  compaction_id VARCHAR PRIMARY KEY,
  interaction_id VARCHAR NOT NULL,
  root_session_id VARCHAR NOT NULL,
  session_id VARCHAR NOT NULL,
  compacted_at TIMESTAMP,
  message_count BIGINT,
  source_dedupe_key VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_keyword_mentions (
  mention_id VARCHAR PRIMARY KEY,
  interaction_id VARCHAR NOT NULL,
  root_session_id VARCHAR NOT NULL,
  session_id VARCHAR NOT NULL,
  transcript_kind VARCHAR NOT NULL,
  speaker VARCHAR NOT NULL,
  category VARCHAR NOT NULL,
  term VARCHAR NOT NULL,
  matched_text VARCHAR NOT NULL,
  severity INTEGER NOT NULL,
  mention_timestamp TIMESTAMP,
  source_dedupe_key VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_permission_decisions (
  decision_id VARCHAR PRIMARY KEY,
  session_id VARCHAR,
  cwd VARCHAR,
  tool_name VARCHAR,
  decision VARCHAR NOT NULL,
  decision_timestamp TIMESTAMP,
  source_dedupe_key VARCHAR NOT NULL,
  message VARCHAR
);

CREATE TABLE IF NOT EXISTS rollup_metrics_hourly (
  bucket_start TIMESTAMP NOT NULL,
  source_kind VARCHAR NOT NULL,
  trace_kind VARCHAR NOT NULL,
  traces BIGINT NOT NULL,
  events BIGINT NOT NULL,
  errors BIGINT NOT NULL,
  keyword_mentions BIGINT NOT NULL,
  tool_use_count BIGINT NOT NULL,
  input_tokens BIGINT NOT NULL,
  output_tokens BIGINT NOT NULL,
  cache_read_tokens BIGINT NOT NULL,
  cache_creation_tokens BIGINT NOT NULL,
  estimated_cost_usd DOUBLE NOT NULL,
  context_estimate_tokens_peak BIGINT NOT NULL,
  PRIMARY KEY (bucket_start, source_kind, trace_kind)
);

CREATE TABLE IF NOT EXISTS rollup_metrics_daily (
  bucket_start TIMESTAMP NOT NULL,
  source_kind VARCHAR NOT NULL,
  trace_kind VARCHAR NOT NULL,
  traces BIGINT NOT NULL,
  events BIGINT NOT NULL,
  errors BIGINT NOT NULL,
  keyword_mentions BIGINT NOT NULL,
  tool_use_count BIGINT NOT NULL,
  input_tokens BIGINT NOT NULL,
  output_tokens BIGINT NOT NULL,
  cache_read_tokens BIGINT NOT NULL,
  cache_creation_tokens BIGINT NOT NULL,
  estimated_cost_usd DOUBLE NOT NULL,
  context_estimate_tokens_peak BIGINT NOT NULL,
  PRIMARY KEY (bucket_start, source_kind, trace_kind)
);
