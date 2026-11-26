-- Meldungen direkt in der App lesen: Admins sehen alle Meldungen und können den Status ändern.
-- Neue Meldungen schickt die Function "remind" (Cron alle 5 Minuten) als Push an die Admins.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
drop policy if exists own_admin_read on public.app_admins;
create policy own_admin_read on public.app_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

drop policy if exists admin_feedback_read on public.feedback;
create policy admin_feedback_read on public.feedback for select to authenticated using (public.is_admin());
drop policy if exists admin_feedback_update on public.feedback;
create policy admin_feedback_update on public.feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Admins dürfen nur den Status ändern, nicht den Inhalt
revoke update on public.feedback from authenticated;
grant update (status) on public.feedback to authenticated;

-- Wann die Meldung per Push an die Admins ging (null = noch offen)
alter table public.feedback add column if not exists notified_at timestamptz;
create index if not exists feedback_unnotified_idx on public.feedback (created_at) where notified_at is null;

-- Elian
insert into public.app_admins (user_id) values ('66328283-e4c6-42c7-92b3-623ce45db166') on conflict do nothing;
