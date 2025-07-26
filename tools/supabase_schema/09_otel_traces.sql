create table if not exists otel_traces (
  id uuid primary key,
  trace_id text not null,
  span_id text not null,
  parent_span_id text,
  operation_name text not null,
  start_time bigint not null,
  duration integer not null,
  status_code text,
  service_name text
); 