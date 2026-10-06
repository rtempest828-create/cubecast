# Manueller Testplan – M5c (Lua-Skripte)

Start: `npm run dev` → Bereich **Modell** → Figura-Avatar mit Skript laden (z. B. „Sternenfuchs“) → Bereich **Skript (Lua)**.

| # | Schritt | Erwartung |
|---|---|---|
| 1 | Avatar mit Skript laden, Bereich „Skript (Lua)“ | Status „Läuft.“, Instruktionen und Speicher werden angezeigt |
| 2 | Avatar ohne Skript (z. B. ohne `.lua`) | Hinweis „enthält keine Lua-Skripte“ |
| 3 | 3D-Ansicht beobachten | Was das Skript tut, passiert: z. B. Schweif wedelt, Ohren zucken, Sternenkranz dreht sich; Minecraft-Körper bleibt ausgeblendet |
| 4 | Aktionsrad: „Zwinkern“ / „Fröhlich“ klicken | Gesicht wechselt für ca. 3 Sekunden |
| 5 | Umschalter im Aktionsrad (z. B. „Sternenkranz“) | Zustand „an/aus“ wechselt, Teil ein-/ausgeblendet |
| 6 | Spielzustand „Laufen“ / „Sprinten“ | Schweif wedelt schneller (Sternenfuchs) |
| 7 | „Schlafen“ | Augen zu |
| 8 | „Treffer simulieren“ | kurzer „Autsch“-Ausdruck |
| 9 | Chat-Nachricht senden | Mund bewegt sich eine Weile („reden“) |
| 10 | Kamera an, Kopf drehen, blinzeln | Kopf folgt weiterhin; Blinzeln (bestätigte Ausdrucks-Rolle) schließt die Augen, auch wenn das Skript sie offen hält |
| 11 | Taste eines `keybinds` im Fenster drücken (falls Avatar welche hat) | Aktion des Skripts; in Eingabefeldern passiert nichts |
| 12 | „Skripte dieses Avatars ausführen“ aus | Status „Ausgeschaltet“, Avatar wie in M5b (Text-Erkennung für `vanilla_model`) |
| 13 | Wieder an | Skript startet neu |
| 14 | Avatar mit `print(...)` | Ausgabe erscheint unter „Ausgabe“ |
| 15 | Avatar mit Fehler im Skript (z. B. `nil + 1` in `events.tick`) | Meldung „Lua-Fehler“, Status „Gestoppt wegen eines Fehlers“ mit Datei und Zeile; App läuft weiter |
| 16 | Avatar mit `while true do end` | „Instruktionslimit“-Meldung, App friert nicht ein |
| 17 | Skript mit `config:save(...)`, App neu starten | `config:load(...)` liefert den Wert wieder |
| 18 | Beispiel-Fuchs laden | `wedeln` startet über das Skript (`animations.model.wedeln:play()`) |
| 19 | Debug-Modus (F12) | HUD zeigt „Lua: läuft (…k / …k Instr.)“ |
| 20 | Anderen Avatar laden | Altes Skript stoppt, neues startet |
