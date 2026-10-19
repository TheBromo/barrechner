-- Supabase's default privileges grant EXECUTE on new functions in `public` directly to anon,
-- authenticated and service_role. `revoke ... from public` does not remove those grants, so the
-- internal helpers below were callable through PostgREST with the publishable key.
revoke execute on function public.consume_rate_limit(text,integer,integer) from anon, authenticated;
revoke execute on function public.purge_expired_data() from anon, authenticated;
revoke execute on function public.create_bar(text,text,jsonb) from anon;
revoke execute on function public.save_bar_draft(uuid,text,jsonb) from anon;
revoke execute on function public.rename_bar(uuid,text) from anon;
revoke execute on function public.publish_bar(uuid) from anon;
revoke execute on function public.discard_bar_draft(uuid) from anon;
revoke execute on function public.archive_bar(uuid) from anon;
revoke execute on function public.restore_bar(uuid) from anon;
revoke execute on function public.is_reserved_slug(text) from anon, authenticated;
revoke execute on function public.valid_bar_config(jsonb) from anon, authenticated;

-- Keep future functions private unless granted explicitly.
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- An owner may move a bar back to one of its own previous addresses; only other bars' redirects block a slug.
create or replace function public.rename_bar(p_bar_id uuid, p_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare
  owner uuid := auth.uid();
  previous_slug text;
begin
  select slug::text into previous_slug from bars where id = p_bar_id and owner_id = owner and status = 'active' for update;
  if previous_slug is null then raise exception 'Bar nicht gefunden'; end if;
  p_slug := lower(trim(p_slug));
  if p_slug = previous_slug then return; end if;
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$' or is_reserved_slug(p_slug) then
    raise exception 'Ungültige oder reservierte Adresse';
  end if;
  if exists (
    select 1 from slug_redirects
    where slug_redirects.old_slug = p_slug and expires_at > now() and bar_id <> p_bar_id
  ) then
    raise exception 'Diese Adresse ist vorübergehend reserviert';
  end if;
  delete from slug_redirects where slug_redirects.old_slug = p_slug;
  insert into slug_redirects(old_slug, bar_id, expires_at)
    values(previous_slug, p_bar_id, now() + interval '30 days')
    on conflict on constraint slug_redirects_pkey do update set bar_id = excluded.bar_id, expires_at = excluded.expires_at;
  update bars set slug = p_slug, updated_at = now() where id = p_bar_id;
end;
$$;

revoke all on function public.rename_bar(uuid,text) from public, anon;
grant execute on function public.rename_bar(uuid,text) to authenticated;
