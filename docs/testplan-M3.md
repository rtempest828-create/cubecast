# Manueller Testplan – M3 (Gesicht, Mimik, Emotionen, Debug-Modus)

Start: `npm run dev`. Für die Mimik-Tests vorher im Bereich **Tracking** die Kamera starten und
„Neutrale Pose setzen“ drücken (übernimmt jetzt auch die Mimik-Ruhewerte).

## Gesicht & Emotionen

| # | Schritt | Erwartung |
|---|---|---|
| 1 | Eigenen Skin laden, Bereich **Gesicht & Emotionen** öffnen | Raster zeigt das Gesicht, Augen (blau), Brauen (orange, falls vorhanden) und Mund (rot) sind umrandet |
| 2 | Hinweise unter dem Raster lesen | Bei Skins ohne Mund: „es wird einer ergänzt“ |
| 3 | Beide Augen schließen | Figur schließt beide Augen (Lid + Wimpernlinie), Vorschau ebenso |
| 4 | Nur das **linke** Auge schließen (Spiegeln an) | Auge der Figur auf **deiner** Bildschirmseite links schließt sich. Falls das falsche: „Links/Rechts der Mimik vertauschen“ an und erneut prüfen |
| 5 | Nach links/rechts schauen (Kopf ruhig) | Pupillen wandern innerhalb der Augen |
| 6 | Mund leicht / weit öffnen | Mund halb offen / offen |
| 7 | „O“ formen | runder Mund |
| 8 | Lächeln | Mundwinkel nach oben; Emotion „Fröhlich“ |
| 9 | Brauen hochziehen + Augen weit auf | Emotion „Überrascht“, Brauen (falls vorhanden) wandern hoch |
| 10 | Brauen zusammenziehen | Emotion „Wütend“, Brauen innen tiefer |
| 11 | Emotions-Knopf „Traurig“ klicken | Emotion bleibt fest, bis der Knopf erneut geklickt wird |
| 12 | Schwellwerte „Mund offen ab“ verschieben | Mund reagiert früher/später |
| 13 | Im Raster „Mund“ wählen, neues Rechteck ziehen | Mund-Animation sitzt an der neuen Stelle; „Von dir angepasst“ |
| 14 | „Automatisch erkennen“ | ursprüngliches Layout zurück |
| 15 | Overlay-Häkchen aus | Gesicht bleibt statisch, Kopf bewegt sich weiter |
| 16 | App neu starten, denselben Skin laden | Layout, Schwellwerte, Overlay-Einstellung sind wieder da |
| 17 | Skin mit Brille/Bart auf der Hut-Ebene laden | Hinweis „Gesichtsteile der Hut-Ebene … übernommen“, Brille/Bart weiterhin sichtbar |

## Debug-Modus (F12)

| # | Schritt | Erwartung |
|---|---|---|
| 18 | F12 drücken | Debug-Leiste rechts, Messwerte unten links in der 3D-Ansicht |
| 19 | Auf den Kopf der Figur klicken | „head“ ist ausgewählt und grün umrandet; Rollen-Editor zeigt „Kopf“ |
| 20 | Auf ein Auge / den Mund im Gesicht klicken | „Auge …“ bzw. „Mund“ ausgewählt, gelbes Rechteck auf dem Gesicht |
| 21 | Strg+Klick auf zweites Teil | Mehrfachauswahl, „2 Teile ausgewählt“ |
| 22 | Alt+Klick auf einen Würfel | einzelner Würfel ausgewählt |
| 23 | Ziehen mit der Maus | dreht weiterhin die Kamera, ändert die Auswahl nicht |
| 24 | Augen-Symbol (●) im Baum | Teil wird ausgeblendet / eingeblendet |
| 25 | „Solo“ mit ausgewähltem Arm | nur der Arm ist sichtbar; „Alle zeigen“ hebt auf |
| 26 | „Drahtgitter“ und „Drehpunkte“ | Gitterdarstellung bzw. Achsen an den Drehpunkten |
| 27 | Linken Arm wählen, Rolle „Mund“, Treiber Rotation Z, Ausgang 0…90 | Arm hebt sich beim Mundöffnen; Live-Wert zeigt Eingang → Ausgang |
| 28 | Treiber auf „Sichtbarkeit“ umstellen | Arm verschwindet, solange der Mund zu ist |
| 29 | „Zuordnung zurücksetzen“ | alle Rollen wieder Standard |
| 30 | Tab **Simulator**, „Manuell“, Regler `jawOpen` auf 0,8 | Mund öffnet sich ohne Webcam |
| 31 | `eyeBlinkLeft` = 1, `head.yaw` = 30, `gaze.x` = 1 | linkes Auge zu, Kopf gedreht, Pupillen zur Seite |
| 32 | „Gemischt“ mit laufender Webcam, nur `jawOpen` bewegen | alles andere folgt der Webcam, nur der Mund dem Regler (●); Klick auf ● gibt frei |
| 33 | Tab **Log** | leer bzw. Meldungen mit Uhrzeit (z. B. nach einer kaputten gespeicherten Zuordnung) |
| 34 | F12 erneut | Debug-Modus aus, Markierungen verschwinden |
