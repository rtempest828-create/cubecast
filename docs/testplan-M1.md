# Manueller Testplan – M1 (Skin laden und anzeigen)

Start: `npm run dev`

| # | Schritt | Erwartung |
|---|---|---|
| 1 | App starten | Fenster mit dunklem Theme, Platzhalter-Figur in der 3D-Ansicht, keine Fehlermeldung |
| 2 | Mit der Maus in der 3D-Ansicht ziehen / scrollen | Figur dreht sich, Zoom funktioniert, Pixel bleiben scharf (nicht verschwommen) |
| 3 | Eigenen 64×64-Skin ins Fenster ziehen | Hinweis „Loslassen …“ erscheint, danach „Skin geladen.“, Figur zeigt den Skin |
| 4 | Figur von allen Seiten ansehen | Gesicht vorne aufrecht, Hinterkopf hinten, Arme/Beine richtig zugeordnet, keine Lücken |
| 5 | Slim-Skin (Alex-Format) laden | „Automatisch (erkannt: Slim)“, Arme sind 3 px breit |
| 6 | Modelltyp manuell umschalten | Arme wechseln sofort zwischen 3 px und 4 px |
| 7 | „Zweite Ebene anzeigen“ abwählen | Hut, Jacke, Ärmel und Hosenbeine verschwinden |
| 8 | Spielername `Notch` laden | Alter 64×32-Skin wird geladen, Hinweis „Altes 64×32-Format“, linkes Bein/Arm gespiegelt |
| 9 | Spielername `zxqv_kein_spielr` | Meldung „Diesen Spieler gibt es nicht.“ |
| 10 | Netzwerk trennen, Spielername laden | Meldung „Keine Verbindung zu den Mojang-Servern.“, App läuft weiter |
| 11 | Eine `.jpg`-Datei oder Textdatei hineinziehen | Meldung „Bitte eine PNG-Datei verwenden.“ |
| 12 | Ein PNG mit falscher Größe (z. B. 100×100) laden | Meldung mit „Ungültige Skin-Größe 100 × 100 px …“ |
| 13 | Eine umbenannte Nicht-PNG-Datei (`test.png`) laden | Meldung „Die Datei ist kein gültiges PNG-Bild (signature).“ |
| 14 | Datei-Dialog öffnen und abbrechen | Keine Meldung, alter Skin bleibt |
