create table public.bar_import_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bar_id uuid not null references public.bars(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 160),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  status text not null default 'pending' check (status in ('pending', 'processing')),
  created_at timestamptz not null default now()
);

create index bar_import_uploads_created_idx on public.bar_import_uploads(created_at);
create index bar_import_uploads_owner_bar_idx on public.bar_import_uploads(owner_id, bar_id);

alter table public.bar_import_uploads enable row level security;
revoke all on public.bar_import_uploads from anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values(
  'bar-imports',
  'bar-imports',
  false,
  10485760,
  array['application/pdf','image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
