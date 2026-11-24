-- Gegarte Varianten (nach dem Garen gewogen: weniger Wasser, mehr kcal pro Gramm) und eindeutige Roh-Aliase
insert into public.foods (name, alias, kcal, protein_g, carbs_g, fat_g, piece_g, portion_g, units, note) values
  ('Hähnchenbrust gegart', array['hähnchenbrust gebraten', 'hähnchenbrust gegrillt', 'hähnchenbrust airfryer', 'haehnchenbrust gegart', 'hähnchen gegart', 'hähnchen gebraten'], 160, 31, 0, 3.5, null, 150, '{}', 'nach dem Garen gewogen, ohne Öl'),
  ('Putenbrust gegart', array['putenbrust gebraten', 'pute gebraten', 'putenbrust gegrillt'], 150, 31, 0, 2.5, null, 150, '{}', 'nach dem Garen gewogen, ohne Öl'),
  ('Rinderhack gebraten', array['rinderhack gegart', 'hackfleisch gebraten'], 270, 26, 0, 18, null, 120, '{}', 'nach dem Braten gewogen, Fett teils abgetropft')
on conflict (name) do nothing;

update public.foods set alias = array(select distinct unnest(alias || array['hähnchenbrust roh', 'haehnchenbrust roh', 'hähnchen roh']))
  where name = 'Hähnchenbrust';
update public.foods set alias = array(select distinct unnest(alias || array['putenbrust roh']))
  where name = 'Putenbrust';
