# Anleitung: Kcal & Protein Tracker

## Was ist was?

| Werkzeug | Wofür | Wo |
|---|---|---|
| **Git** | Speicherstände deines Codes auf deinem PC („Backup vor Reparatur“ usw. waren Git-Commits) | Ordner `.git` im Projekt, in VS Code links das Symbol „Quellcodeverwaltung“ |
| **GitHub** | Online-Kopie deines Git-Projekts und Hosting der App über GitHub Pages | github.com/elianprusko-creator/kcal-tracker, App: https://elianprusko-creator.github.io/kcal-tracker/ |
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

### Aktuelles Schema (Stand 24.11.2026)

- **profiles**: `user_id` (Schlüssel), `weight_kg`, `height_cm`, `age`, `sex` (`m`/`w`), `activity` (`sitzend`/`leicht`/`maessig`/`aktiv`/`extrem`), `goal` (`abnehmen`/`halten`/`zunehmen`), `kcal_goal`, `protein_goal`
- **entries**: `id`, `user_id`, `day`, `name`, `amount` (Text, z. B. „2 Stück (≈ 240 g)“), `grams` (Menge als Zahl, für die Umrechnung), `kcal`, `protein_g`, `carbs_g`, `fat_g`, `source` (`tabelle`/`off`/`ki`/`ki_suche`/`meal`/`manual`), `meal` (`fruehstueck`/`mittag`/`abend`/`snack`, leer = nach Uhrzeit), `created_at`
- **weights**: `user_id` + `day` (gemeinsamer Schlüssel, ein Wert pro Tag), `kg`
- **water**: `user_id` + `day` (gemeinsamer Schlüssel), `ml`
- **meals**: deine gemerkten Gerichte. Werte für 1 Portion, dazu `items` mit den Zutaten.
- **foods**: die **Nährwerttabelle** für alle (siehe unten)

`profiles`, `entries`, `weights`, `water` und `meals`: RLS an, Zugriff nur auf eigene Zeilen. `foods`: alle eingeloggten Nutzer dürfen lesen, ändern geht nur über das Dashboard.

### Nährwerttabelle `foods` erweitern

Dashboard → **Table Editor** → `foods` → **Insert row**. Alle Werte gelten **pro 100 g bzw. 100 ml**:

| Spalte | Bedeutung | Beispiel Kakao |
|---|---|---|
| `name` | Anzeigename | Kakao |
| `alias` | weitere Schreibweisen, kleingeschrieben | `{kakao mit milch,heiße schokolade}` |
| `kcal`, `protein_g`, `carbs_g`, `fat_g` | Nährwerte pro 100 g/ml | 80, 3.4, 10, 3 |
| `piece_g` | Gramm pro Stück (leer, wenn nicht zählbar) | leer |
| `portion_g` | Menge, wenn keine genannt wird | 200 |
| `units` | Mengen-Schnellwahl in Gramm | `{"tasse": 200, "große tasse": 300}` |
| `note` | Hinweis in der Vorschau | Annahme: mit Vollmilch |

Neue Einträge wirken sofort in der App. Die KI-Funktion übernimmt sie nach spätestens 10 Minuten. Die SQL-Dateien, mit denen die Tabellen angelegt wurden, liegen in `supabase/migrations/`.

## 4. KI (Edge Function) ändern

So wird eine Eingabe berechnet (spart KI-Aufrufe):
1. **Tabelle** (`foods` in der Datenbank): Einfache Eingaben wie „2 Bananen und 250 g Skyr“ werden ohne KI berechnet. Das passiert aber nur, wenn die Tabelle *jeden* Teil versteht. Sonst bekommt die KI den ganzen Satz mit Zusammenhang, z. B. „2 Scheiben Brot, dazwischen Erdnussbutter“.
2. **KI ohne Suche**: Alles andere zerlegt Gemini in einem günstigen Aufruf. Bekannte Lebensmittel bekommen trotzdem die Tabellenwerte.
3. **Open Food Facts**: Markenprodukte (z. B. „Milbona Skyr“) werden dort gesucht.
4. **KI mit Google-Suche**: nur für Markenprodukte und Restaurantgerichte, die nicht gefunden wurden.

In der Vorschau zeigt ein Etikett, woher die Werte stammen.

Dateien in `supabase/functions/estimate/`:
- `parse.ts`: Erkennung von Mengen und Einheiten (g, ml, Stück, Scheibe, EL, TL, Glas, Dose …)
- `index.ts`: Ablauf, KI-Prompts, Open Food Facts, Wiederholung bei Überlastung

Bei Überlastung versucht es die Funktion zweimal mit `GEMINI_MODEL` und weicht dann auf `GEMINI_FALLBACK_MODEL` aus (Standard: `gemini-flash-lite-latest`).

## 4b. Funktionen in der App (ohne KI)

- **Vorschläge beim Tippen:** zuerst deine gemerkten Gerichte, dann was du schon eingetragen hast (je öfter, desto weiter oben), dann die Tabelle. Antippen öffnet die Vorschau mit Mengen-Schnellwahl. Pfeiltasten und Enter gehen auch. Längere Sätze (mehr als 3 Wörter) zeigen keine Vorschläge, dort einfach senden.
- **Als Gericht merken:** Nach einer Berechnung unten in der Vorschau einen Namen eingeben und auf „Merken“ tippen. Beim nächsten Mal reicht der Name. Verwalten unter „Meine Gerichte“ am Ende der Seite.
- **Barcode:** Strichcode-Knopf neben der Kamera. Live-Kamera, Foto vom Barcode oder Nummer eintippen. Die Werte kommen von Open Food Facts. Die Live-Kamera funktioniert nur über `https://` (also GitHub Pages) oder lokal am PC.
- **Schnell eintragen:** Leiste unter dem Tagesring mit deinen häufigsten Einträgen. Ein Tipp trägt sie mit der zuletzt genutzten Menge ein, danach kurz „Rückgängig“ möglich.
- **Mahlzeiten:** Einträge sind nach Frühstück, Mittag, Abend und Snacks gruppiert. Neue Einträge landen automatisch nach Uhrzeit (4–11 Uhr Frühstück, 11–15 Mittag, 17–22 Abend, sonst Snack). In der Vorschau und beim Bearbeiten (✎) lässt sich die Mahlzeit ändern.
- **Wie gestern:** Unter den Einträgen erscheinen Knöpfe für Mahlzeiten vom Vortag, die heute noch fehlen. Ein Tipp übernimmt die ganze Mahlzeit.
- **Wasser:** Unter dem Tagesring, +250 ml pro Tipp. Ziel = 35 ml pro kg Körpergewicht.
- **Gewicht:** Eigene Karte mit Verlauf (bis 90 Tage) und 7-Tage-Schnitt. Beim Eintragen werden Kalorien- und Eiweißziel automatisch neu berechnet, mit denselben Einstellungen wie beim Einrichten (⚙).
- **Statistik:** 7 oder 30 Tage, Durchschnitt, Tage im Kalorien- bzw. Eiweißziel und Serien (🔥 Tage in Folge eingetragen, 💪 Tage in Folge Eiweißziel). „Im Ziel“ heißt beim Abnehmen höchstens 5 % über dem Ziel, beim Zunehmen höchstens 5 % darunter, beim Halten ±10 %.
- **Export:** Ganz unten „Daten exportieren“. „Alle Einträge“ oder „Tagesübersicht“ (mit Gewicht und Wasser) als CSV für Excel.
- **Offline:** Die App startet auch ohne Netz (`sw.js` speichert sie auf dem Handy). Ohne Netz gespeicherte Einträge und Wasser werden gemerkt („⏳ wartet auf Upload“, oben „offline“) und automatisch hochgeladen, sobald wieder Netz da ist. Ändern bestehender Einträge, Gewicht und KI gehen nur online.

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

## 6. GitHub Pages + Homescreen

1. Auf github.com einloggen bzw. ein Konto anlegen → oben rechts **+** → **New repository** → Name z. B. `kcal-tracker`, **Public** (Pages ist für private Repos kostenpflichtig) → **Create repository**. Keine README anhaken.
2. Im VS-Code-Terminal im Projektordner (beim ersten Push öffnet sich ein Browserfenster zum Anmelden):
   ```
   git remote add origin https://github.com/DEINNAME/kcal-tracker.git
   git push -u origin master
   ```
3. Auf GitHub im Repository: **Settings** → **Pages** → Source „Deploy from a branch“ → Branch `master`, Ordner `/ (root)` → **Save**. Nach 1–2 Minuten ist die App unter `https://DEINNAME.github.io/kcal-tracker/` erreichbar.
4. In Supabase: **Authentication** → **URL Configuration** → **Site URL** auf diese Adresse setzen (wichtig für Bestätigungs-E-Mails).
5. **Homescreen:**
   - iPhone: Adresse in Safari öffnen → Teilen → „Zum Home-Bildschirm“.
   - Android: in Chrome öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

   Die App öffnet sich dann ohne Browserleiste und mit eigenem Icon (`icon.svg`, `icon-192.png`, `icon-512.png`, `manifest.webmanifest`).

**Updates:** Nach jeder Änderung `git add -A`, `git commit -m "…"`, `git push`. GitHub Pages aktualisiert sich nach etwa einer Minute. Die App selbst lädt der Offline-Speicher immer zuerst frisch aus dem Netz. Wenn du `sw.js` änderst, dort die Versionsnummer (`kcal-v1` → `kcal-v2`) erhöhen.

Der publishable Key in `index.html` darf öffentlich sein, weil RLS die Daten schützt. Der Gemini-Key bleibt nur in den Supabase-Secrets.
