-- Mahlzeit pro Eintrag (leer = wird aus der Uhrzeit abgeleitet)
alter table public.entries add column if not exists meal text;
alter table public.entries drop constraint if exists entries_meal_check;
alter table public.entries add constraint entries_meal_check
  check (meal is null or meal in ('fruehstueck', 'mittag', 'abend', 'snack'));

-- Schneller laden: Einträge eines Nutzers nach Tag
create index if not exists entries_user_day on public.entries (user_id, day);

-- Wasser: ein Wert pro Tag
create table if not exists public.water (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null default current_date,
  ml integer not null default 0 check (ml >= 0 and ml <= 20000),
  primary key (user_id, day)
);
alter table public.water enable row level security;
drop policy if exists own_water on public.water;
create policy own_water on public.water for all using (user_id = auth.uid()) with check (user_id = auth.uid());
