-- Feedback aus der App: Fehler melden und Verbesserungsvorschläge.
-- Nutzer können nur eigenes Feedback anlegen und lesen; auswerten im Supabase-Dashboard (Table Editor -> feedback).
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('bug', 'idee')),
  message text not null check (char_length(message) between 3 and 2000),
  contact_ok boolean not null default false,
  context jsonb not null default '{}'::jsonb check (pg_column_size(context) < 8000),
  status text not null default 'neu' check (status in ('neu', 'in_arbeit', 'erledigt', 'abgelehnt'))
);

alter table public.feedback enable row level security;
drop policy if exists own_feedback_insert on public.feedback;
create policy own_feedback_insert on public.feedback for insert to authenticated with check (user_id = auth.uid());
drop policy if exists own_feedback_read on public.feedback;
create policy own_feedback_read on public.feedback for select to authenticated using (user_id = auth.uid());

-- Schutz vor Versehen/Spam: höchstens 20 Meldungen pro Nutzer und Tag
create or replace function public.feedback_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Zu viele Meldungen heute. Bitte morgen wieder.';
  end if;
  return new;
end $$;
drop trigger if exists feedback_rate_limit on public.feedback;
create trigger feedback_rate_limit before insert on public.feedback for each row execute function public.feedback_rate_limit();

create index if not exists feedback_created_idx on public.feedback (created_at desc);
