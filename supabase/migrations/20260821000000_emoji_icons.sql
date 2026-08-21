create or replace function public.valid_bar_config(config jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare category jsonb; drink jsonb; variant jsonb; category_ids text[] := '{}'; drink_ids text[] := '{}'; variant_ids text[];
begin
  if jsonb_typeof(config) <> 'object'
    or config->>'schemaVersion' <> '1'
    or char_length(trim(coalesce(config->>'displayName', ''))) not between 1 and 80
    or not (coalesce(config->>'logoUrl', '') = '' or config->>'logoUrl' like '/%' or config->>'logoUrl' like 'https://%')
    or (config ? 'logoEmoji' and jsonb_typeof(config->'logoEmoji') <> 'string')
    or char_length(coalesce(config->>'logoEmoji', '')) > 16
    or (coalesce(config->>'logoUrl', '') <> '' and coalesce(config->>'logoEmoji', '') <> '')
    or coalesce(config#>>'{theme,background}', '') !~ '^#[0-9a-fA-F]{6}$'
    or coalesce(config#>>'{theme,accent}', '') !~ '^#[0-9a-fA-F]{6}$'
    or jsonb_typeof(config->'categories') <> 'array'
    or jsonb_array_length(config->'categories') not between 1 and 30 then return false;
  end if;
  for category in select value from jsonb_array_elements(config->'categories') loop
    if coalesce(category->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$'
      or char_length(trim(coalesce(category->>'name',''))) not between 1 and 80
      or not (coalesce(category->>'image','') = '' or category->>'image' like '/%' or category->>'image' like 'https://%')
      or (category ? 'emoji' and jsonb_typeof(category->'emoji') <> 'string')
      or char_length(coalesce(category->>'emoji', '')) > 16
      or (coalesce(category->>'image', '') <> '' and coalesce(category->>'emoji', '') <> '')
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
