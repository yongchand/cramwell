create table if not exists upload_documents (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id),
  user_id uuid not null references users(id),
  created_at timestamp with time zone default timezone('utc', now())
); 