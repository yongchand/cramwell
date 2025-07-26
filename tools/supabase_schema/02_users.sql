create table if not exists users (
  id uuid primary key,
  email varchar not null unique,
  credit integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now()),
  last_login timestamp with time zone
); 