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
- [ ] Eigene Domain (nötig für `/.well-known/assetlinks.json` der TWA; GitHub-Projektseite reicht nicht)
- [ ] KI-Modell: freiwillig mit eigenem Schlüssel (jetzt) / Premium mit bezahltem Server-Schlüssel / ohne KI

## Offen – Aufgaben
- [ ] In `datenschutz.html` die gelb markierten Platzhalter ausfüllen (Name, Anschrift, E-Mail)
- [ ] Supabase: Auftragsverarbeitungsvertrag (DPA) im Dashboard anfordern
- [ ] Supabase: eigenes SMTP (z. B. Resend/Brevo), der Standard-Mailer schafft nur wenige Mails pro Stunde
- [ ] Play-Entwicklerkonto (25 $), Identitätsprüfung
- [ ] TWA bauen (PWABuilder oder Bubblewrap), Keystore sicher aufbewahren, Play App Signing
- [ ] Geschlossener Test: mind. 12 Tester über 14 Tage
- [ ] Store-Eintrag: Icon 512, Feature-Grafik 1024×500, Screenshots, Beschreibung
- [ ] Formulare: Datensicherheit, Gesundheits-App-Erklärung, Altersfreigabe, Zielgruppe 18+
- [ ] Später bei Einnahmen: Impressum (§ 5 DDG), Google Play Billing
