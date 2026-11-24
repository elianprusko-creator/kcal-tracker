-- Küche: Rezepte & Reste (Funktion, die man in der App erst einschaltet)

-- Einstellungen pro Nutzer, z. B. {"kitchen": {"on": true, "keepDays": 3, ...}}
create table if not exists public.user_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
drop policy if exists own_prefs on public.user_prefs;
create policy own_prefs on public.user_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Rezepte: Zutaten mit Nährwerten (je Zeile für die angegebene Menge), ergibt "servings" Portionen
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  servings numeric not null default 4 check (servings > 0 and servings <= 50),
  ingredients jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recipes enable row level security;
drop policy if exists own_recipes on public.recipes;
create policy own_recipes on public.recipes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists recipes_user on public.recipes (user_id);

-- Reste: gekochte Portionen im Kühlschrank (Nährwerte pro Portion)
create table if not exists public.leftovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  name text not null,
  portions_total numeric not null check (portions_total > 0),
  portions_left numeric not null check (portions_left >= 0),
  portion_g numeric,
  kcal numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  cooked_on date not null default current_date,
  keep_days integer not null default 3 check (keep_days between 1 and 30),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.leftovers enable row level security;
drop policy if exists own_leftovers on public.leftovers;
create policy own_leftovers on public.leftovers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists leftovers_open on public.leftovers (user_id) where done_at is null;
