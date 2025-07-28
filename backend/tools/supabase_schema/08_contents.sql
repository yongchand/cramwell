create table if not exists contents (
  id uuid primary key,
  notebook_id uuid not null references notebooks(id),
  content_type content_type not null,
  content_data text not null,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
); 