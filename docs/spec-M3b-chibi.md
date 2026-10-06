# Spezifikation M3b – Chibi-Modus

Stand: Interview vom 2026-10-06. Wartet auf OK.

## Grundsatz

Chibi ist eine **nicht-destruktive Ebene** über dem Avatar: Aus dem fertigen Modell (Vanilla-Skin,
Test-Zubehör, Figura-Teile) wird beim Einschalten ein abgeleitetes Modell gebaut. Skin- und
Figura-Dateien werden nie verändert; die Einstellungen liegen im Avatar-Profil (JSON, zusammen mit
der Rollen-Zuordnung). Tracking, Physik, Rollen, Debug-Modus und später Animationen/Lua arbeiten mit
dem Chibi-Modell genauso wie mit dem Original (gleiche Teil-IDs).

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Umsetzung | **B zuerst:** Geometrie skalieren und Texturen der verkleinerten Skin-Teile pixeltreu auf ganze Pixel neu rechnen (Nearest-Neighbor, keine Unschärfe). **A** (nur skalieren) und **A+** (pixeltreu kürzen: mittlere Zeilen weglassen, Rand bleibt) als umschaltbare „Texturstrategie“ eingebaut. **C** (eigenes Modell) bleibt offen. |
| Kopf und Gesicht | Kopf wird größer, Gesicht bleibt **1:1** (8×8-Textur, Overlay und Mimik-Varianten unverändert, nur größer). Kopf-Pixel sind dadurch größer als Körper-Pixel. Eigene Chibi-Gesichter später mit dem Face-Editor (M6). |
| Proportionen | Presets **Kind**, **Chibi**, **Super-Deformed** plus Regler für Kopfgröße, Körpergröße, Armlänge, Beinlänge. Standard beim ersten Einschalten: **Chibi**. |
| Zubehör / Figura-Teile | Skalieren mit dem Teil, an dem sie hängen (Ohren mit Kopf, Schwanz mit Körper). Im Debug-Modus pro Teil/Rolle zusätzlich Faktor, Versatz und Drehpunkt einstellbar, live sichtbar. |
| Bewegung | **Unverändert** (gleiche Tracking-Ausschläge, Physik-Einstellungen, Leerlauf). |
| Animationen / Lua (M5b/M5c) | Verschiebungen werden mit dem Faktor des jeweiligen Teils umgerechnet, Drehungen bleiben. Lua bekommt eine Abfrage, ob Chibi aktiv ist. |
| Umschalten | UI-Schalter + Hotkey (**Strg+K** in der App; global ab M6). Hartes Umschalten, keine Morph-Animation, keine Vergleichsansicht. |
| Speichern | **Eine** Chibi-Einstellung pro Avatar. |
| Kamera | Beim Umschalten automatisch so nachführen, dass die Figur gleich groß im Bild steht; eigene Kameraposition pro Modus wird gemerkt. |

## Startwerte der Presets (Faktoren gegenüber normal)

| Preset | Kopf | Körperhöhe | Arme | Beine |
|---|---|---|---|---|
| Kind | 1,2 | 0,8 | 0,8 | 0,75 |
| Chibi | 1,5 | 0,6 | 0,6 | 0,5 |
| Super-Deformed | 2,0 | 0,5 | 0,5 | 0,35 |

Breiten schrumpfen etwas weniger als Längen, damit die Figur nicht „dünn“ wirkt. Teile bleiben
verbunden: Füße auf dem Boden, Körper auf den Beinen, Kopf und Schultern am Körper. Mit B werden
Längen auf ganze Pixel gerundet (z. B. Bein 12 → 6 px).

## Gespeicherte Daten (Erweiterung des Avatar-Profils)

```json
"chibi": {
  "enabled": true,
  "preset": "chibi",
  "head": 1.5, "body": 0.6, "arms": 0.6, "legs": 0.5,
  "textureMode": "resample",          // "resample" (B) | "scale" (A) | "crop" (A+)
  "parts": { "<Teil-ID>": { "scale": [1,1,1], "offset": [0,0,0], "pivot": [0,0,0] } },
  "camera": { ... }
}
```

## Oberfläche

- Bereich „Modell“: Karte **Chibi-Modus** mit Schalter, Presets, vier Reglern, Texturstrategie,
  „Zurücksetzen“.
- Debug-Modus (F12) → Teile & Rollen: Abschnitt „Chibi“ beim gewählten Teil (Faktor, Versatz,
  Drehpunkt), wirkt sofort.

## Tests und Doku

Unit-Tests für Proportionen/Verbindung der Teile, Pixel-Rundung, UV-Neuberechnung (B, A+),
Zubehör-Skalierung mit dem Elternteil, Einzel-Anpassungen, Laden kaputter Profile. README-Abschnitt
mit Bildvergleich Normal/Chibi, manueller Testplan `docs/testplan-M3b.md`.

## Was schwierig wird (ehrlich)

1. **Texturen neu rechnen (B) und die Außenschicht:** Beim Verkleinern fallen Pixelzeilen weg
   (12 → 6 heißt: jede zweite). Dünne Linien wie Gürtel, Knöpfe oder Schuhkanten können dabei ganz
   verschwinden oder unregelmäßig wirken. Innen- und Außenschicht (Jacke, Ärmel, Hosen) werden mit
   derselben Zuordnung gerechnet, damit sie deckungsgleich bleiben. Wenn das Ergebnis nicht gefällt,
   ist A+ (Ränder bleiben, Mitte fällt weg) der direkte Vergleich.
2. **Unterschiedliche Pixelgrößen:** Weil das Gesicht 1:1 bleibt, hat der Kopf größere Pixel als der
   Körper. Bei Figura-Teilen wird nur die Geometrie skaliert (ihre Texturen teilen sich Atlanten mit
   frei gesetzten UVs, ein pixeltreues Neurechnen pro Fläche ist dort nicht zuverlässig). Figura-Teile
   haben im Chibi-Modus also ebenfalls andere Pixelgrößen als der verkleinerte Skin.
3. **Figura-Teile mit festen Drehpunkten:** Was unter `Head`, `Body` usw. hängt, wandert automatisch
   mit. Teile direkt an der Wurzel oder in `World`-Gruppen (z. B. ein Schwert auf dem Rücken ohne
   Parent-Type) wissen nicht, wohin sie gehören – die müssen ggf. im Debug-Modus versetzt werden.
4. **Lua-Skripte mit fest eingebauten Positionen (M5c):** `setPos`/`setPivot` mit festen Werten,
   Skripte, die selbst Abstände rechnen, oder Render-Tasks (Text/Items an festen Punkten) können
   verrutschen. Verschiebungen pro Teil werden umgerechnet, absolute Weltpositionen nicht.
5. **Arm-Tracking und kurze Arme:** Kurze Arme mit großem Kopf können beim Heben in den Kopf ragen;
   Bewegungen wirken bei Super-Deformed weniger ausdrucksstark.
6. **Kamera-Automatik vs. eigene Kamera:** Die Automatik passt nur beim Umschalten an; wer danach die
   Kamera verstellt, überschreibt die gemerkte Position des jeweiligen Modus.
