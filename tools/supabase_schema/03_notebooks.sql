create table if not exists notebooks (
  id uuid primary key,
  name varchar not null,
  description text,
  professor varchar,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
); 