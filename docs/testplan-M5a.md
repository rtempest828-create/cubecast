# Manueller Testplan – M5a (Figura-Avatare importieren)

Start: `npm run dev` → Bereich **Modell**, Karte **Figura-Avatar**. Für Tracking-Tests im Bereich
**Tracking** die Kamera starten (oder im Debug-Modus F12 → Simulator → „Manuell“).

## Finden und Laden

| # | Schritt | Erwartung |
|---|---|---|
| 1 | Bereich „Modell“ öffnen | Liste „Gefundene Avatare“ zeigt die Avatare aus dem Figura-Ordner (z. B. „Sternenfuchs (Modrinth – Fabric 1.21.11)“) |
| 2 | Avatar wählen → „Laden“ | Meldung „Figura-Avatar … geladen“, Modell erscheint in der 3D-Ansicht; Name (in Avatar-Farbe), Autoren, Fundort, Anzahl Modelle/Teile/Skripte, Beschreibung |
| 3 | „Ordner wählen …“ → einen Ordner ohne `.bbmodel` | Fehlermeldung „In diesem Ordner liegt kein Figura-Avatar“ |
| 4 | „Ordner wählen …“ → Avatar-Ordner | Avatar wird geladen, Fundort „Eigener Ordner“ |
| 5 | „Hinweise“ aufklappen | Hinweise zu Lua-Skripten (ab M5c) und ggf. zu ausgeblendeten Gruppen/fehlenden Texturen |
| 6 | Avatar-Dateien vorher/nachher vergleichen (Änderungsdatum) | Unverändert |

## Aussehen

| # | Schritt | Erwartung |
|---|---|---|
| 7 | Modell drehen und von allen Seiten ansehen | Gleiches Aussehen wie in Blockbench/Minecraft: Texturen nicht gespiegelt oder verdreht, Ober-/Unterseiten richtig, gedrehte Würfel (Ohren) korrekt |
| 8 | Avatar mit `vanilla_model.PLAYER:setVisible(false)` | Normaler Minecraft-Körper unsichtbar, „Wie im Skript“ angehakt, alle Vanilla-Häkchen leer |
| 9 | „Wie im Skript“ abwählen, „Kopf“ anhaken | Vanilla-Kopf mit Skin erscheint zusätzlich |
| 10 | App neu starten, gleichen Avatar laden | Eigene Vanilla-Auswahl ist wieder da |
| 11 | Avatar mit `_e.png`-Textur (falls vorhanden) | Diese Pixel leuchten auch im Schatten |
| 12 | Ausgeblendete Ausdrucks-Gruppen (z. B. „AugenZu“, „MundOffen“) | Anfangs unsichtbar |

## Bewegung und Rollen

| # | Schritt | Erwartung |
|---|---|---|
| 13 | Kopf drehen/neigen | Figura-„Head“ dreht sich mit allem darin (Ohren, Haare, Ausdrücke) |
| 14 | Zur Seite lehnen | Körper, Arme und Kopf neigen sich mit, Beine bleiben stehen |
| 15 | Hinweis „N Rollen-Vorschläge warten auf Bestätigung“ | Wird angezeigt, Anzahl plausibel (Ohren, Schweifglieder, Ausdrücke) |
| 16 | F12 → Teile & Rollen | Head/Body/Arme/Beine haben feste Rollen, Ohren/Schweif/Ausdrücke sind Vorschläge |
| 17 | „Alle Vorschläge bestätigen“ | Meldung „N Vorschläge bestätigt“, Hinweis verschwindet, HUD zeigt „Physik: N Teile“ |
| 18 | Kopf schnell bewegen | Ohren und Schweif schwingen nach (Schweifglieder als Kette) |
| 19 | Blinzeln (Simulator: eyeBlinkLeft/Right = 1) | Variante „AugenZu“ wird eingeblendet, beim Öffnen wieder aus |
| 20 | Mund öffnen / lächeln / ein Auge zukneifen | „MundOffen“ / „MundFroh“ bzw. „AugenFroh“ / „AugenZwinker“ erscheinen |
| 21 | „Entladen“ | Wieder der normale Skin mit seiner eigenen Zuordnung |
| 22 | Avatar erneut laden | Bestätigte Rollen sind gespeichert (keine neuen Vorschläge) |
