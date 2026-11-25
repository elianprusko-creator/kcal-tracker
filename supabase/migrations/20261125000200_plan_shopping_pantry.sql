-- Küche Stufe 2–4: Wochenplan, Einkaufsliste, Vorrat; Aufwachen erkennen

-- Wochenplan: ein Eintrag pro geplantem Essen (Tag + Mahlzeit)
create table if not exists public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  meal text not null check (meal in ('fruehstueck', 'mittag', 'abend', 'snack')),
  recipe_id uuid references public.recipes(id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  portions numeric not null default 1 check (portions > 0 and portions <= 20),
  cook boolean not null default false,          -- an diesem Tag wird das Rezept gekocht (sonst: Reste davon)
  status text not null default 'geplant' check (status in ('geplant', 'gegessen', 'ausgelassen')),
  created_at timestamptz not null default now()
);
alter table public.meal_plan enable row level security;
drop policy if exists own_plan on public.meal_plan;
create policy own_plan on public.meal_plan for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists meal_plan_user_day on public.meal_plan (user_id, day);

-- Einkaufsliste
create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  grams numeric,
  amount text,
  category text not null default 'Sonstiges',
  source text not null default 'manuell' check (source in ('plan', 'vorrat', 'manuell')),
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.shopping_items enable row level security;
drop policy if exists own_shopping on public.shopping_items;
create policy own_shopping on public.shopping_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists shopping_user on public.shopping_items (user_id);

-- Vorrat: ungefähre Mengen; "staple" = Grundvorrat, der nie ausgehen soll
create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  grams numeric check (grams is null or grams >= 0),
  level text not null default 'voll' check (level in ('voll', 'wenig', 'leer')),
  staple boolean not null default false,
  used_g numeric not null default 0,            -- verbraucht seit since_day (für die Verbrauchsprognose)
  since_day date not null default current_date,
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.pantry_items enable row level security;
drop policy if exists own_pantry on public.pantry_items;
create policy own_pantry on public.pantry_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Aufwachen erkennen: persönlicher Schlüssel für Tasker/Automate (nur der Nutzer kennt ihn)
alter table public.reminder_settings add column if not exists wake_token text unique;
