-- Push-Erinnerungen (Essen, Wasser)

-- Geräte, die Push-Nachrichten empfangen (ein Eintrag pro Handy/Browser)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists own_push on public.push_subscriptions;
create policy own_push on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Einstellungen: Aufsteh-/Schlafzeit, Essenszeiten, Wasser-Rhythmus, Zeitzone
create table if not exists public.reminder_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  tz text not null default 'Europe/Berlin',
  updated_at timestamptz not null default now()
);
alter table public.reminder_settings enable row level security;
drop policy if exists own_reminders on public.reminder_settings;
create policy own_reminders on public.reminder_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Gesendete Erinnerungen, damit keine doppelt kommt (nur die Edge Function schreibt hier)
create table if not exists public.push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.push_log enable row level security;

-- Alle 5 Minuten prüfen, ob eine Erinnerung fällig ist
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname in ('remind', 'push_log_cleanup');
select cron.schedule('remind', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://tzqzgcnacpkzdyvahioo.supabase.co/functions/v1/remind',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
$$);
-- Protokoll nach 3 Tagen aufräumen
select cron.schedule('push_log_cleanup', '17 3 * * *', $$ delete from public.push_log where sent_at < now() - interval '3 days' $$);
