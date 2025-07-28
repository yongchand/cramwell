drop table if exists chat_sessions cascade;

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  active boolean not null default true,
  notebook_id uuid not null references notebooks(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc', now())
); 