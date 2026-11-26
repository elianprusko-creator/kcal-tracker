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
- [x] Datenschutzerklärung: Name + Kontakt-E-Mail eingetragen (ohne Wohnadresse)
- [ ] **Supabase: Auftragsverarbeitungsvertrag (DPA) im Dashboard anfordern** – die Datenschutzerklärung sagt schon, dass er besteht
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

## Offen – weitere Aufgaben
- [ ] Play-Entwicklerkonto (25 $), Identitätsprüfung
- [ ] TWA bauen (PWABuilder oder Bubblewrap), Keystore sicher aufbewahren, Play App Signing
- [ ] Geschlossener Test: mind. 12 Tester über 14 Tage
- [ ] Store-Eintrag: Icon 512, Feature-Grafik 1024×500, Screenshots, Beschreibung
- [ ] Formulare: Datensicherheit, Gesundheits-App-Erklärung, Altersfreigabe, Zielgruppe 18+
- [ ] Später bei Einnahmen: Impressum (§ 5 DDG), Google Play Billing

## Website
- [x] Landingpage `website/` (Englisch, Umschalter Deutsch), Screenshots aus einem Demo-Konto in `website/img/`
      Vorschau: https://elianprusko-creator.github.io/kcal-tracker/website/
- [ ] Beim Umzug auf Netlify: Landingpage auf `/`, App z. B. unter `/app/` (Supabase-Redirect-URLs anpassen)

## Feedback
- [x] „Fehler melden & Ideen“ unter „Mehr“ → Tabelle `feedback` (Supabase → Table Editor → feedback, Spalte `status` zum Abhaken)

## Ideen für später
- [ ] Anmelde-Stopp ab X Nutzern + Warteliste (Tabelle `waitlist`, Zähler im Dashboard, Freischalten per Klick)

## Netlify (Website unter /, App unter /app/)

1. netlify.com, mit GitHub anmelden (kostenloser Plan).
2. Add new site, Import an existing project, GitHub, Repo kcal-tracker waehlen. Einstellungen kommen aus netlify.toml, nichts aendern, Deploy.
3. Site configuration, Change site name, z. B. kcal-tracker (ergibt kcal-tracker.netlify.app).
4. Supabase Dashboard, Authentication, URL Configuration: Site URL auf https://NAME.netlify.app/app/ setzen und unter Redirect URLs https://NAME.netlify.app/app/** ergaenzen (GitHub-Adresse drin lassen).
5. Die App einmal von der neuen Adresse aus zum Startbildschirm hinzufuegen (Push neu einschalten, da neue Adresse).

Jeder Push auf master baut Netlify automatisch neu. GitHub Pages laeuft parallel weiter.

## Warteliste und Anmeldestopp

- Schalter und Obergrenze: in der App unter Mehr, Meldungen und Zahlen (nur Admin).
- Solange pausiert: Website zeigt Warteliste statt Starten, die App bietet beim Registrieren die Warteliste an, der Server lehnt neue Konten ab.
- Warteliste ansehen: Supabase Table Editor, waitlist. Nach dem Benachrichtigen notified_at setzen bzw. Eintraege loeschen (so steht es in der Datenschutzerklaerung).
- Besucherzahlen der Website: im Admin-Ueberblick (ohne Cookies, Tabelle site_stats).
