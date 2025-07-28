create table if not exists user_notebooks (
  id uuid primary key,
  user_id uuid not null references users(id),
  notebook_id uuid not null references notebooks(id),
  active boolean default true,
  created_at timestamp with time zone default timezone('utc', now())
); 