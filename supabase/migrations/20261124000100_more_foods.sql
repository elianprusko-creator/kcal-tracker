-- Heißgetränke mit Tassengrößen (Werte pro 100 ml, mit Vollmilch)
insert into public.foods (name, alias, kcal, protein_g, carbs_g, fat_g, piece_g, portion_g, units, note) values
  ('Kakao', array['kakao mit milch', 'heiße schokolade', 'heisse schokolade', 'trinkschokolade'], 80, 3.4, 10, 3, null, 200, '{"tasse": 200, "große tasse": 300, "becher": 300}', 'Annahme: mit Vollmilch'),
  ('Cappuccino', array['cappucino'], 40, 2.1, 3.1, 2.1, null, 150, '{"tasse": 150, "große tasse": 250}', 'Annahme: mit Vollmilch'),
  ('Latte Macchiato', array['latte', 'caffè latte', 'caffe latte', 'milchkaffee'], 50, 2.7, 3.9, 2.7, null, 300, '{"glas": 300, "tasse": 250, "große tasse": 350}', 'Annahme: mit Vollmilch'),
  ('Tee', array['schwarztee', 'grüner tee', 'früchtetee', 'kräutertee'], 1, 0, 0.2, 0, null, 250, '{"tasse": 250, "große tasse": 350}', 'ohne Zucker')
on conflict (name) do nothing;
