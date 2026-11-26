# Play Store – Checkliste

## Erledigt (25.11.2026)
- [x] Konto löschen in der App („Mehr“ → „Info & Konto“) + Edge Function `delete-account` (getestet)
- [x] Konto löschen im Web ohne App: `konto-loeschen.html` (Link für die Play Console)
- [x] Datenschutzerklärung (Entwurf): `datenschutz.html`, inkl. Quellen/Lizenzen (Open Food Facts ODbL)
- [x] Hinweis „kein Medizinprodukt“ in der App
- [x] RLS geprüft: alle Nutzertabellen nur eigene Zeilen, `foods` nur lesbar; alles `on delete cascade`
- [x] Bibliotheken lokal (`vendor/`) statt CDN
- [x] Supabase-Region: EU (Irland)
- [x] Registrierung: Häkchen für 18+ und Einwilligung (Gesundheitsdaten), wird mit Zeitpunkt im Nutzerkonto gespeichert

## Offen – Entscheidungen
- [x] Keine eigene Domain. Kostenlos geht es so: zweites Repo `elianprusko-creator.github.io` anlegen,
      darin nur `.well-known/assetlinks.json` + leere `.nojekyll`. Die App bleibt unter `/kcal-tracker/`.
- [ ] KI-Modell: freiwillig mit eigenem Schlüssel (jetzt) / Premium mit bezahltem Server-Schlüssel / ohne KI

## Offen – Aufgaben
- [ ] In `datenschutz.html` die gelb markierten Platzhalter ausfüllen (Name, Anschrift, E-Mail)
- [ ] Supabase: Auftragsverarbeitungsvertrag (DPA) im Dashboard anfordern
- [ ] Supabase: eigenes SMTP über ein eigenes Gmail-Konto der App (siehe unten)

## E-Mail-Versand einrichten (Gmail, kostenlos, ca. 500 Mails/Tag)
Ohne eigene Domain verlangen Resend und Co. eine Domain bzw. landen im Spam, daher Gmail direkt.
1. Neues Gmail-Konto nur für die App anlegen (z. B. `kcal.tracker.app@gmail.com`), nicht das private.
2. Dort Bestätigung in zwei Schritten einschalten, dann unter myaccount.google.com/apppasswords
   ein App-Passwort erstellen (16 Zeichen).
3. Supabase-Dashboard → Authentication → Emails → SMTP Settings → „Enable custom SMTP“:
   - Sender email: die neue Gmail-Adresse · Sender name: `Kcal Tracker`
   - Host `smtp.gmail.com` · Port `587` · Username: die Gmail-Adresse · Password: das App-Passwort
4. Authentication → Rate Limits: „emails sent per hour“ auf z. B. 30 lassen/setzen.
5. Authentication → Emails → Templates: Betreff und Inhalt aus `supabase/templates/` einfügen:
   - Confirm signup: Betreff `Bestätige deine E-Mail / Confirm your email – Kcal Tracker` → `confirmation.html`
   - Reset password: Betreff `Neues Passwort / New password – Kcal Tracker` → `recovery.html`
   - Change email: Betreff `Neue E-Mail bestätigen / Confirm new email – Kcal Tracker` → `email_change.html`
6. Authentication → Sign In / Providers → Email: „Confirm email“ einschalten (falls aus).
7. Testen: in der App „Passwort vergessen?“ mit einer eigenen Adresse.
- [ ] Play-Entwicklerkonto (25 $), Identitätsprüfung
- [ ] TWA bauen (PWABuilder oder Bubblewrap), Keystore sicher aufbewahren, Play App Signing
- [ ] Geschlossener Test: mind. 12 Tester über 14 Tage
- [ ] Store-Eintrag: Icon 512, Feature-Grafik 1024×500, Screenshots, Beschreibung
- [ ] Formulare: Datensicherheit, Gesundheits-App-Erklärung, Altersfreigabe, Zielgruppe 18+
- [ ] Später bei Einnahmen: Impressum (§ 5 DDG), Google Play Billing
