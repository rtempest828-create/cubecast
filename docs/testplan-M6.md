# Manueller Testplan – M6 (Ausgabe, Profile, Tastenkürzel, Face-Editor, Installer)

Start: `npm run dev` bzw. gebaute/installierte App.

## OBS und Ausgabefenster (Bereich „Ausgabe“)

| # | Schritt | Erwartung |
|---|---|---|
| 1 | Bereich „Ausgabe“ öffnen | Adresse `http://127.0.0.1:47800/` (oder nächster freier Port), „Verbundene Ausgaben: 0“ |
| 2 | „Kopieren“, in OBS Browser-Quelle (1080 × 1080) anlegen | Figur erscheint mit durchsichtigem Hintergrund; Zähler steigt auf 1 |
| 3 | Kamera an, Kopf bewegen, sprechen, blinzeln | OBS-Bild folgt flüssig (Kopf, Augen, Mund, Physik, Animationen, Lua) |
| 4 | Hintergrund „Greenscreen“ / „Eigene Farbe“ | OBS-Bild wechselt sofort |
| 5 | Kamera Ganzkörper / Oberkörper / Nahaufnahme, Zoom, Blickwinkel | Ausschnitt passt sich an |
| 6 | 3D-Ansicht in der App drehen, „Aktuelle 3D-Ansicht übernehmen“ | OBS zeigt genau diese Ansicht („Eigene Ansicht“) |
| 7 | Anderen Skin / Figura-Avatar laden | OBS zeigt das neue Modell |
| 8 | OBS-Quelle neu laden während die App läuft | Bild ist sofort wieder da |
| 9 | App schließen | OBS zeigt „Warte auf Minecraft VTuber …“; nach Neustart der App wieder das Bild |
| 10 | Adresse in einem normalen Browser auf einem anderen PC im Netzwerk aufrufen | nicht erreichbar |
| 11 | „Fenster öffnen“ (720 × 720) | Rahmenloses, durchsichtiges Fenster mit der Figur; mit der Maus verschiebbar |
| 12 | „Immer im Vordergrund“ + „Größe übernehmen“ | Fenster bleibt über anderen Fenstern, neue Größe |
| 13 | Discord: Bildschirm übertragen → Ausgabefenster (Greenscreen) | Figur sichtbar |
| 14 | „Fenster schließen“ | Fenster zu |

## Profile und Tastenkürzel (Bereich „Einstellungen“)

| # | Schritt | Erwartung |
|---|---|---|
| 15 | Skin + Figura-Avatar laden, Ausgabe einstellen, „Speichern als“ „Stream“ | Meldung „gespeichert“, Profil in der Liste |
| 16 | Anderen Skin laden, Profil „Stream“ laden | Skin, Avatar und Einstellungen wie gespeichert |
| 17 | „Dieses Profil beim Start laden“, App neu starten | Profil wird automatisch geladen |
| 18 | Profil löschen | verschwindet aus der Liste |
| 19 | Tastenkürzel „Emotion: Fröhlich“ = Strg+Alt+1, Minecraft (oder anderes Programm) in den Vordergrund, Kürzel drücken | Figur lächelt; nochmal drücken → wieder automatisch |
| 20 | Kürzel für Animation / Aktionsrad / Ausgabefenster / Profil | Aktion wird ausgeführt, auch im Hintergrund |
| 21 | Kürzel wählen, das schon belegt ist (z. B. von OBS) | Hinweis „belegt“ |

## Face-Editor (Bereich „Gesicht & Emotionen“)

| # | Schritt | Erwartung |
|---|---|---|
| 22 | Variante „Mund offen“, Zellen anmalen | 3D-Gesicht nutzt beim Mund-Öffnen die gemalte Form (auch in OBS) |
| 23 | Rechtsklick auf eine Zelle | Zelle wieder wie im Original |
| 24 | „Automatische Variante verwenden“ | automatische Form zurück |
| 25 | App neu starten, gleichen Avatar laden | eigene Varianten sind noch da |

## Installer

| # | Schritt | Erwartung |
|---|---|---|
| 26 | `npm run dist` | `dist/Minecraft-VTuber-Setup-0.1.0.exe` entsteht |
| 27 | Installieren (Ordner wählbar), Startmenü-Verknüpfung starten | App startet, Beispiel-Avatar in der Figura-Liste, Kamera/Tracking funktionieren |
| 28 | Deinstallieren über Windows-Einstellungen | App entfernt; Einstellungen in `%APPDATA%\minecraft-vtuber` bleiben |
