create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks(id),
  document_type document_type not null,
  document_name varchar not null,
  document_path varchar not null,
  document_info jsonb,
  status boolean default true,
  file_size integer,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
); 