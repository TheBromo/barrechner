create extension if not exists citext;

create table public.bars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug citext not null unique check (slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'),
  label text not null check (char_length(label) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  current_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bar_drafts (
  bar_id uuid primary key references public.bars(id) on delete cascade,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.bar_revisions (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  version integer not null check (version > 0),
  config jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (bar_id, version)
);

alter table public.bars
  add constraint bars_current_revision_id_fkey
  foreign key (current_revision_id) references public.bar_revisions(id) on delete set null;

create table public.slug_redirects (
  old_slug citext primary key,
  bar_id uuid not null references public.bars(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bar_id uuid not null references public.bars(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  kind text not null check (kind in ('logo', 'category')),
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key text primary key,
  attempts integer not null,
  window_started_at timestamptz not null
);

create index bars_owner_status_idx on public.bars(owner_id, status);
create index revisions_bar_created_idx on public.bar_revisions(bar_id, created_at desc);
create index redirects_expiry_idx on public.slug_redirects(expires_at);
create index assets_bar_idx on public.assets(bar_id);

alter table public.bars enable row level security;
alter table public.bar_drafts enable row level security;
alter table public.bar_revisions enable row level security;
alter table public.slug_redirects enable row level security;
alter table public.assets enable row level security;
alter table public.rate_limits enable row level security;

create policy "owners read bars" on public.bars for select using (owner_id = auth.uid());
create policy "owners update bars" on public.bars for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners read drafts" on public.bar_drafts for select using (
  exists (select 1 from public.bars where bars.id = bar_drafts.bar_id and bars.owner_id = auth.uid())
);
create policy "owners update drafts" on public.bar_drafts for update using (
  exists (select 1 from public.bars where bars.id = bar_drafts.bar_id and bars.owner_id = auth.uid())
) with check (
  exists (select 1 from public.bars where bars.id = bar_drafts.bar_id and bars.owner_id = auth.uid())
);
create policy "owners read revisions" on public.bar_revisions for select using (
  exists (select 1 from public.bars where bars.id = bar_revisions.bar_id and bars.owner_id = auth.uid())
);
create policy "owners read redirects" on public.slug_redirects for select using (
  exists (select 1 from public.bars where bars.id = slug_redirects.bar_id and bars.owner_id = auth.uid())
);
create policy "owners read assets" on public.assets for select using (owner_id = auth.uid());

revoke all on public.bars, public.bar_drafts, public.bar_revisions, public.slug_redirects, public.assets, public.rate_limits from anon, authenticated;
grant select on public.bars, public.bar_drafts, public.bar_revisions, public.slug_redirects, public.assets to authenticated;

create or replace function public.is_reserved_slug(candidate text) returns boolean
language sql immutable set search_path = public
return lower(candidate) = any(array['admin','api','app','auth','dashboard','hilfe','status','support','www']);

create or replace function public.valid_bar_config(config jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare category jsonb; drink jsonb; variant jsonb; category_ids text[] := '{}'; drink_ids text[] := '{}'; variant_ids text[];
begin
  if jsonb_typeof(config) <> 'object'
    or config->>'schemaVersion' <> '1'
    or char_length(trim(coalesce(config->>'displayName', ''))) not between 1 and 80
    or not (coalesce(config->>'logoUrl', '') = '' or config->>'logoUrl' like '/%' or config->>'logoUrl' like 'https://%')
    or coalesce(config#>>'{theme,background}', '') !~ '^#[0-9a-fA-F]{6}$'
    or coalesce(config#>>'{theme,accent}', '') !~ '^#[0-9a-fA-F]{6}$'
    or jsonb_typeof(config->'categories') <> 'array'
    or jsonb_array_length(config->'categories') not between 1 and 30 then return false;
  end if;
  for category in select value from jsonb_array_elements(config->'categories') loop
    if coalesce(category->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$'
      or char_length(trim(coalesce(category->>'name',''))) not between 1 and 80
      or not (coalesce(category->>'image','') = '' or category->>'image' like '/%' or category->>'image' like 'https://%')
      or jsonb_typeof(category->'drinks') <> 'array'
      or jsonb_array_length(category->'drinks') > 100 then return false;
    end if;
    if category->>'id' = any(category_ids) then return false; end if;
    category_ids := array_append(category_ids, category->>'id');
    for drink in select value from jsonb_array_elements(category->'drinks') loop
      if coalesce(drink->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$'
        or char_length(trim(coalesce(drink->>'name',''))) not between 1 and 100
        or jsonb_typeof(drink->'variants') <> 'array'
        or jsonb_array_length(drink->'variants') not between 1 and 20 then return false;
      end if;
      if drink->>'id' = any(drink_ids) then return false; end if;
      drink_ids := array_append(drink_ids, drink->>'id');
      variant_ids := '{}';
      for variant in select value from jsonb_array_elements(drink->'variants') loop
        if coalesce(variant->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$'
          or char_length(trim(coalesce(variant->>'label',''))) not between 1 and 40
          or jsonb_typeof(variant->'price') <> 'number'
          or (variant->>'price')::numeric <> trunc((variant->>'price')::numeric)
          or (variant->>'price')::numeric not between 0 and 10000000 then return false;
        end if;
        if variant->>'id' = any(variant_ids) then return false; end if;
        variant_ids := array_append(variant_ids, variant->>'id');
      end loop;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.create_bar(p_slug text, p_label text, p_config jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  owner uuid := auth.uid();
  new_id uuid;
begin
  if owner is null then raise exception 'Nicht angemeldet'; end if;
  if not valid_bar_config(p_config) then raise exception 'Ungültige Barkonfiguration'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  if (select count(*) from bars where owner_id = owner and status = 'active') >= 5 then
    raise exception 'Maximal fünf aktive Bars sind erlaubt';
  end if;
  p_slug := lower(trim(p_slug));
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$' or is_reserved_slug(p_slug) then
    raise exception 'Ungültige oder reservierte Adresse';
  end if;
  if exists (select 1 from slug_redirects where old_slug = p_slug and expires_at > now()) then
    raise exception 'Diese Adresse ist vorübergehend reserviert';
  end if;
  insert into bars(owner_id, slug, label) values(owner, p_slug, trim(p_config->>'displayName')) returning id into new_id;
  insert into bar_drafts(bar_id, config) values(new_id, p_config);
  return new_id;
end;
$$;

create or replace function public.save_bar_draft(p_bar_id uuid, p_label text, p_config jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not valid_bar_config(p_config) then raise exception 'Ungültige Barkonfiguration'; end if;
  perform 1 from bars where id = p_bar_id and owner_id = auth.uid();
  if not found then raise exception 'Bar nicht gefunden'; end if;
  update bar_drafts set config = p_config, updated_at = now() where bar_id = p_bar_id;
  update bars set label = trim(p_config->>'displayName'), updated_at = now() where id = p_bar_id;
end;
$$;

create or replace function public.rename_bar(p_bar_id uuid, p_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare
  owner uuid := auth.uid();
  old_slug text;
begin
  select slug::text into old_slug from bars where id = p_bar_id and owner_id = owner and status = 'active' for update;
  if old_slug is null then raise exception 'Bar nicht gefunden'; end if;
  p_slug := lower(trim(p_slug));
  if p_slug = old_slug then return; end if;
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$' or is_reserved_slug(p_slug) then
    raise exception 'Ungültige oder reservierte Adresse';
  end if;
  if exists (select 1 from slug_redirects where old_slug = p_slug and expires_at > now()) then
    raise exception 'Diese Adresse ist vorübergehend reserviert';
  end if;
  insert into slug_redirects(old_slug, bar_id, expires_at)
    values(old_slug, p_bar_id, now() + interval '30 days')
    on conflict (old_slug) do update set bar_id = excluded.bar_id, expires_at = excluded.expires_at;
  update bars set slug = p_slug, updated_at = now() where id = p_bar_id;
end;
$$;

create or replace function public.publish_bar(p_bar_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  owner uuid := auth.uid();
  draft_config jsonb;
  next_version integer;
  revision_id uuid;
begin
  perform 1 from bars where id = p_bar_id and owner_id = owner and status = 'active' for update;
  if not found then raise exception 'Bar nicht gefunden oder archiviert'; end if;
  select config into draft_config from bar_drafts where bar_id = p_bar_id;
  if not valid_bar_config(draft_config) then raise exception 'Ungültige Barkonfiguration'; end if;
  select coalesce(max(version), 0) + 1 into next_version from bar_revisions where bar_id = p_bar_id;
  draft_config := jsonb_set(jsonb_set(draft_config, '{revision}', to_jsonb(next_version)), '{updatedAt}', to_jsonb(now()::text));
  insert into bar_revisions(bar_id, version, config, created_by)
    values(p_bar_id, next_version, draft_config, owner) returning id into revision_id;
  update bars set current_revision_id = revision_id, updated_at = now() where id = p_bar_id;
  update bar_drafts set config = draft_config, updated_at = now() where bar_id = p_bar_id;
  return next_version;
end;
$$;

create or replace function public.discard_bar_draft(p_bar_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  owner uuid := auth.uid();
  published_config jsonb;
begin
  select revisions.config into published_config
  from bars join bar_revisions revisions on revisions.id = bars.current_revision_id
  where bars.id = p_bar_id and bars.owner_id = owner;
  if published_config is null then raise exception 'Noch keine veröffentlichte Version vorhanden'; end if;
  update bar_drafts set config = published_config, updated_at = now() where bar_id = p_bar_id;
  update bars set label = published_config->>'displayName', updated_at = now() where id = p_bar_id;
end;
$$;

create or replace function public.archive_bar(p_bar_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update bars set status = 'archived', archived_at = now(), updated_at = now()
  where id = p_bar_id and owner_id = auth.uid() and status = 'active';
  if not found then raise exception 'Bar nicht gefunden'; end if;
end;
$$;

create or replace function public.restore_bar(p_bar_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare owner uuid := auth.uid();
begin
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  if (select count(*) from bars where owner_id = owner and status = 'active') >= 5 then
    raise exception 'Für die Wiederherstellung muss ein Platz frei sein';
  end if;
  update bars set status = 'active', archived_at = null, updated_at = now()
  where id = p_bar_id and owner_id = owner and status = 'archived';
  if not found then raise exception 'Archivierte Bar nicht gefunden'; end if;
end;
$$;

create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare current_row rate_limits%rowtype;
begin
  select * into current_row from rate_limits where key = p_key for update;
  if not found or current_row.window_started_at < now() - make_interval(secs => p_window_seconds) then
    insert into rate_limits(key, attempts, window_started_at) values(p_key, 1, now())
      on conflict (key) do update set attempts = 1, window_started_at = now();
    return true;
  end if;
  if current_row.attempts >= p_limit then return false; end if;
  update rate_limits set attempts = attempts + 1 where key = p_key;
  return true;
end;
$$;

create or replace function public.purge_expired_data()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from slug_redirects where expires_at <= now();
  delete from bars where status = 'archived' and archived_at <= now() - interval '30 days';
  delete from rate_limits where window_started_at <= now() - interval '1 day';
end;
$$;

revoke all on function public.create_bar(text,text,jsonb) from public;
revoke all on function public.save_bar_draft(uuid,text,jsonb) from public;
revoke all on function public.rename_bar(uuid,text) from public;
revoke all on function public.publish_bar(uuid) from public;
revoke all on function public.discard_bar_draft(uuid) from public;
revoke all on function public.archive_bar(uuid) from public;
revoke all on function public.restore_bar(uuid) from public;
revoke all on function public.consume_rate_limit(text,integer,integer) from public;
revoke all on function public.purge_expired_data() from public;
grant execute on function public.create_bar(text,text,jsonb) to authenticated;
grant execute on function public.save_bar_draft(uuid,text,jsonb) to authenticated;
grant execute on function public.rename_bar(uuid,text) to authenticated;
grant execute on function public.publish_bar(uuid) to authenticated;
grant execute on function public.discard_bar_draft(uuid) to authenticated;
grant execute on function public.archive_bar(uuid) to authenticated;
grant execute on function public.restore_bar(uuid) to authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;
grant execute on function public.purge_expired_data() to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('bar-assets', 'bar-assets', true, 4194304, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
