-- Warteliste, Anmeldestopp und einfache Besucherzahlen der Website.

-- ---------- Einstellungen der App (öffentlich lesbar, nur Admins ändern) ----------
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
drop policy if exists config_read on public.app_config;
create policy config_read on public.app_config for select to anon, authenticated using (true);
drop policy if exists config_admin_update on public.app_config;
create policy config_admin_update on public.app_config for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- open: Registrierung erlaubt; max_users: höchstens so viele Konten (null = ohne Grenze)
insert into public.app_config (key, value) values ('signup', '{"open": false, "max_users": null}')
on conflict (key) do nothing;

-- Ist die Registrierung gerade offen? (Schalter UND Obergrenze)
create or replace function public.signup_open() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((value->>'open')::boolean, false)
     and (value->>'max_users' is null or (select count(*) from auth.users) < (value->>'max_users')::int)
  from public.app_config where key = 'signup';
$$;
grant execute on function public.signup_open() to anon, authenticated;

-- Durchsetzen auf dem Server: neue Konten über die Anmeldung nur, wenn offen.
-- (Konten, die ein Admin direkt in der Datenbank anlegt, sind nicht betroffen.)
create or replace function public.enforce_signup_open() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_user = 'supabase_auth_admin' and not coalesce(public.signup_open(), false) then
    raise exception 'signup_closed';
  end if;
  return new;
end $$;
drop trigger if exists enforce_signup_open on auth.users;
create trigger enforce_signup_open before insert on auth.users for each row execute function public.enforce_signup_open();

-- ---------- Warteliste ----------
create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  lang text not null default 'de' check (lang in ('de', 'en')),
  source text not null default 'web' check (source in ('web', 'app')),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create unique index if not exists waitlist_email_idx on public.waitlist (lower(email));
alter table public.waitlist enable row level security;
-- Niemand liest die Liste außer Admins; eingetragen wird nur über join_waitlist()
drop policy if exists admin_waitlist_read on public.waitlist;
create policy admin_waitlist_read on public.waitlist for select to authenticated using (public.is_admin());

create or replace function public.join_waitlist(p_email text, p_lang text default 'de', p_source text default 'web') returns void
language plpgsql security definer set search_path = public as $$
begin
  -- grober Spam-Schutz: höchstens 300 Einträge pro Stunde insgesamt
  if (select count(*) from public.waitlist where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'busy';
  end if;
  insert into public.waitlist (email, lang, source)
  values (trim(p_email), case when p_lang = 'en' then 'en' else 'de' end, case when p_source = 'app' then 'app' else 'web' end)
  on conflict (lower(email)) do nothing;   -- schon eingetragen: still ok (verrät nichts)
end $$;
grant execute on function public.join_waitlist(text, text, text) to anon, authenticated;

-- ---------- Besucherzahlen der Website: ohne Cookies, ohne IP, nur Zähler pro Tag ----------
create table if not exists public.site_stats (
  day date not null default current_date,
  event text not null check (event in ('view', 'cta', 'waitlist')),
  lang text not null default 'en',
  source text not null default '',   -- woher (nur die Domain, z. B. google.com), leer = direkt
  count int not null default 0,
  primary key (day, event, lang, source)
);
alter table public.site_stats enable row level security;
drop policy if exists admin_stats_read on public.site_stats;
create policy admin_stats_read on public.site_stats for select to authenticated using (public.is_admin());

create or replace function public.track(p_event text, p_lang text default 'en', p_source text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('view', 'cta', 'waitlist') then return; end if;
  insert into public.site_stats (day, event, lang, source, count)
  values (current_date, p_event, case when p_lang = 'de' then 'de' else 'en' end, left(coalesce(p_source, ''), 60), 1)
  on conflict (day, event, lang, source) do update set count = public.site_stats.count + 1;
end $$;
grant execute on function public.track(text, text, text) to anon, authenticated;

-- ---------- Überblick für Admins (in der App unter "Mehr") ----------
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'waitlist', (select count(*) from public.waitlist where notified_at is null),
    'signup', (select value from public.app_config where key = 'signup'),
    'signup_open', public.signup_open(),
    'views_today', (select coalesce(sum(count), 0) from public.site_stats where event = 'view' and day = current_date),
    'views_7d', (select coalesce(sum(count), 0) from public.site_stats where event = 'view' and day > current_date - 7),
    'cta_7d', (select coalesce(sum(count), 0) from public.site_stats where event = 'cta' and day > current_date - 7),
    'sources_7d', (select coalesce(jsonb_object_agg(src, n), '{}'::jsonb) from (
        select coalesce(nullif(source, ''), 'direkt') src, sum(count) n from public.site_stats
        where event = 'view' and day > current_date - 7 group by 1 order by 2 desc limit 5) s)
  );
end $$;
grant execute on function public.admin_overview() to authenticated;
