# Manueller Testplan – M4 (Körper, Physik, Arm-Tracking, Lip-Sync)

Start: `npm run dev` → Bereich **Körper & Physik**. Für Tracking-Tests vorher im Bereich
**Tracking** die Kamera starten und „Neutrale Pose setzen“ drücken.

## Körper

| # | Schritt | Erwartung |
|---|---|---|
| 1 | Ruhig sitzen, nichts tun | Figur atmet leicht (Schultern/Kopf heben sich minimal), schwankt sanft, Arme wippen wie in Minecraft |
| 2 | Mit dem Oberkörper zur Seite lehnen | Figur neigt den Oberkörper um die Hüfte mit, Beine bleiben stehen, Kopf schaut weiter in deine Richtung |
| 3 | Nach vorne zur Kamera lehnen | Figur neigt sich leicht nach vorne |
| 4 | Kopf weit drehen | Schultern drehen leicht mit |
| 5 | „Mitbewegung“ auf 0 % | Oberkörper bleibt starr, nur der Kopf bewegt sich |
| 6 | Atmen / Schwanken auf 0 %, Arm-Wippen aus | Figur steht völlig ruhig |

## Physik und Test-Zubehör

| # | Schritt | Erwartung |
|---|---|---|
| 7 | Fuchsohren, Fuchsschwanz, Headset einschalten | Ohren auf dem Kopf, Schwanz hinten am Körper, Headset mit Mikrofon vor dem rechten Mundwinkel der Figur |
| 8 | Kopf schnell zur Seite neigen und zurück | Ohren schwingen nach und beruhigen sich |
| 9 | Seitlich lehnen und zurück | Schwanz schwingt nach, die Spitze peitscht etwas nach |
| 10 | Nichts tun | Schwanz wedelt ganz leicht |
| 11 | Stärke eines Ohrs auf 100 %, Dämpfung auf 0 % | Ohr schwingt deutlich länger |
| 12 | Achse X beim Schwanz abwählen | Schwanz schwingt nur noch seitlich |
| 13 | „Physik für Ohren …“ aus | alle Teile starr |
| 14 | Debug-Modus (F12) → Teile & Rollen | Zubehör-Teile tauchen im Baum mit Rollen (Linkes Ohr, Schwanz, Zubehör) auf |
| 15 | App neu starten, gleichen Skin laden | Zubehör und Physik-Einstellungen sind wieder da |

## Arm-Tracking

| # | Schritt | Erwartung |
|---|---|---|
| 16 | „Arme folgen dem Kamerabild“ an, Kamera starten | Status „Körper-Modell wird geladen …“, dann „Bereit.“ |
| 17 | Kamera so stellen, dass Schultern und Hände sichtbar sind, Arm seitlich heben | Status „Arme werden erkannt.“, Figur hebt den Arm auf derselben Bildschirmseite (Spiegeln an) |
| 18 | Winken | Arm der Figur folgt dem Winken |
| 19 | Arme aus dem Bild nehmen | nach kurzer Zeit weicher Übergang zurück ins Arm-Wippen |
| 20 | Live-Werte im Bereich Tracking | Bildrate Tracking bleibt nahe der Kamera-FPS |

## Lip-Sync

| # | Schritt | Erwartung |
|---|---|---|
| 21 | Mikrofon wählen, „Mikrofon starten“ | Pegel-Balken reagiert auf Sprache, Windows zeigt das Mikrofon-Symbol |
| 22 | Sprechen (Kamera aus oder Mund verdeckt) | Mund der Figur bewegt sich mit der Lautstärke |
| 23 | „Ooo“ / „Uuu“ sagen | runder Mund |
| 24 | Tippen / Lüfter, aber still sein | Mund bleibt zu; sonst Rauschsperre erhöhen |
| 25 | „Mikrofon stoppen“ | Pegel fällt auf 0, Mikrofon-Symbol verschwindet |
| 26 | App neu starten | Mikrofon startet **nicht** von selbst; Verstärkung/Rauschsperre sind gespeichert |
