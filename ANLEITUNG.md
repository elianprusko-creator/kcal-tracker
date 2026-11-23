# Anleitung: Kcal & Protein Tracker

## Was ist was?

| Werkzeug | Wofür | Wo |
|---|---|---|
| **Git** | Speicherstände deines Codes auf deinem PC („Backup vor Reparatur“ usw. waren Git-Commits) | Ordner `.git` im Projekt, in VS Code links das Symbol „Quellcodeverwaltung“ |
| **GitHub** | Online-Kopie deines Git-Projekts, später Hosting über GitHub Pages | github.com (noch nicht eingerichtet) |
| **Supabase** | Backend: Datenbank, Login, Edge Function (KI), Secrets | supabase.com → Projekt „Calorie Tracker“ |

Kurz gesagt: **Git und GitHub verwalten den Code, Supabase speichert die Daten.** Du brauchst beides.

---

## 1. App lokal öffnen

`index.html` per Doppelklick im Browser öffnen. Das reicht, sie spricht direkt mit Supabase.

## 2. Supabase ist „pausiert“

Kostenlose Projekte schlafen nach etwa 7 Tagen ohne Nutzung ein. Dann:
Supabase-Dashboard → Projekt → **Restore project**. Nach ein paar Minuten steht dort „Healthy“.

## 3. Datenbank ändern

**Einfach (per Klick):** Dashboard → **Table Editor** → Tabelle wählen → „+ Insert column“.

**Per SQL:** Dashboard → **SQL Editor** → „New query“ → einfügen → **Run**.

Beispiel neue Spalte:
```sql
alter table entries add column meal text;  -- z. B. Frühstück, Mittag ...
```

Beispiel neue Tabelle (wichtig: RLS immer mit einschalten, sonst sehen alle alles):
```sql
create table favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kcal integer not null,
  protein_g numeric default 0
);
alter table favorites enable row level security;
create policy own_favorites on favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Danach im Code (`index.html`) die neue Spalte/Tabelle verwenden, z. B. `supabase.from('favorites').select('*')`.

### Aktuelles Schema (Stand 23.11.2026)

- **profiles**: `user_id` (Schlüssel), `weight_kg`, `height_cm`, `age`, `sex` (`m`/`w`), `activity` (`sitzend`/`leicht`/`maessig`/`aktiv`/`extrem`), `goal` (`abnehmen`/`halten`/`zunehmen`), `kcal_goal`, `protein_goal`
- **entries**: `id`, `user_id`, `day`, `name`, `amount` (Text, z. B. „2 Stück (≈ 240 g)“), `grams` (Menge als Zahl, für die Umrechnung), `kcal`, `protein_g`, `carbs_g`, `fat_g`, `source` (`tabelle`/`off`/`ki`/`ki_suche`/`manual`), `created_at`
- **weights**: `user_id` + `day` (gemeinsamer Schlüssel, ein Wert pro Tag), `kg`

Alle drei Tabellen: RLS an, Zugriff nur auf eigene Zeilen.

## 4. KI (Edge Function) ändern

So wird eine Eingabe berechnet (spart KI-Aufrufe):
1. **Tabelle** (`foods.ts`): Einfache Eingaben wie „2 Bananen und 250 g Skyr“ werden ohne KI berechnet. Das passiert aber nur, wenn die Tabelle *jeden* Teil versteht. Sonst bekommt die KI den ganzen Satz mit Zusammenhang, z. B. „2 Scheiben Brot, dazwischen Erdnussbutter“.
2. **KI ohne Suche**: Alles andere zerlegt Gemini in einem günstigen Aufruf. Bekannte Lebensmittel bekommen trotzdem die Tabellenwerte.
3. **Open Food Facts**: Markenprodukte (z. B. „Milbona Skyr“) werden dort gesucht.
4. **KI mit Google-Suche**: nur für Markenprodukte und Restaurantgerichte, die nicht gefunden wurden.

In der Vorschau zeigt ein Etikett, woher die Werte stammen.

Dateien in `supabase/functions/estimate/`:
- `foods.ts`: **Nährwerttabelle**. Neue Lebensmittel einfach unten ergänzen, z. B.
  ```ts
  { name: "Banane", alias: ["bananen"], kcal: 93, p: 1.1, c: 20, f: 0.2, piece: 120, portion: 120 },
  ```
  (Werte pro 100 g; `piece` = Gramm pro Stück; `portion` = Gramm, wenn keine Menge genannt wird; Aliase kleingeschrieben)
- `parse.ts`: Erkennung von Mengen und Einheiten (g, ml, Stück, Scheibe, EL, TL, Glas, Dose …)
- `index.ts`: Ablauf, KI-Prompts und Open Food Facts

Nach einer Änderung im VS-Code-Terminal (im Projektordner) hochladen:
```
npx supabase functions deploy estimate
```

**Secrets ändern** (z. B. anderes Gemini-Modell):
- Dashboard → Edge Functions → **Secrets**, oder
- `npx supabase secrets set GEMINI_MODEL=gemini-flash-latest`

**Fehler suchen:** Dashboard → Edge Functions → `estimate` → **Logs**.

**Schutz:** Die Function prüft am Anfang, ob ein eingeloggter Nutzer anfragt (Aufruf von `/auth/v1/user`). Ohne Login gibt es „401 Nicht angemeldet“. Dadurch kann niemand Fremdes dein Gemini-Kontingent verbrauchen. Zusätzlich steht `verify_jwt = true` in `supabase/config.toml`. Das allein reicht aber nicht, weil Supabase den publishable Key als gültigen anonymen Zugang behandelt.

## 5. Git: Speicherstand anlegen

**In VS Code:** links „Quellcodeverwaltung“ → Nachricht eintippen (z. B. „Tagesnavigation fertig“) → **Commit** (bei Nachfrage „Ja“ zum Stagen aller Änderungen).

**Oder im Terminal:**
```
git add -A
git commit -m "Kurze Beschreibung"
```

**Änderungen verwerfen** (zurück zum letzten Commit):
```
git restore index.html
```

**Verlauf ansehen:** `git log --oneline`

## 6. Später: GitHub Pages

1. Auf github.com ein neues Repository anlegen (z. B. `kcal-tracker`).
2. Im Terminal:
   ```
   git remote add origin https://github.com/DEINNAME/kcal-tracker.git
   git push -u origin master
   ```
3. Auf GitHub: Settings → Pages → Branch `master`, Ordner `/ (root)` → Save.
4. In Supabase: Authentication → URL Configuration → Site URL auf die GitHub-Pages-Adresse setzen.

Der publishable Key in `index.html` darf öffentlich sein. Der Gemini-Key bleibt nur in den Supabase-Secrets.
