# Minecraft VTuber

Windows-Desktop-App, die einen Minecraft-Skin oder Figura-Avatar als blockiges 3D-Modell
darstellt und per Webcam-Face-Tracking steuert – zum Streamen mit OBS oder für Discord.
Alles läuft lokal, ohne Konto und ohne Cloud.

> **Stand: Meilenstein M5a** – Skin laden, Kopf/Augen/Mund/Mimik per Webcam, Debug-Modus mit Rollen,
> Körper-Mitbewegung und Leerlauf, Physik (mit Test-Zubehör), Arm-Tracking, Mikrofon-Lip-Sync,
> Figura-Avatare (`.bbmodel`) importieren. Blockbench-Animationen (M5b), Lua-Skripte (M5c) und
> Streaming-Ausgabe (M6) folgen (siehe [docs/PLAN.md](docs/PLAN.md)).

## Installation

Voraussetzungen: Windows 10/11, [Node.js](https://nodejs.org/) 20 oder neuer.

```bash
npm install
```

Falls npm meldet, dass Install-Skripte nicht ausgeführt wurden, das Electron-Programm einmalig laden:

```bash
node node_modules/electron/install.js
```

## Starten

Entwicklungsmodus (mit automatischem Neuladen):

```bash
npm run dev
```

Gebaute Version starten:

```bash
npm run build
npm start
```

Tests und Prüfungen:

```bash
npm test
npm run typecheck
npm run lint
```

## Bedienung

### Skin laden (Bereich „Modell“)

- **Drag & Drop:** Eine PNG-Datei irgendwo ins Fenster ziehen.
- **Datei wählen:** Auf das gestrichelte Feld klicken.
- **Spielername:** Namen eingeben und „Laden“ drücken. Der Skin wird über die Mojang-API geladen –
  das ist der **einzige** Netzwerkzugriff der App.

Unterstützt werden 64×64-Skins, das alte 64×32-Format (wird wie in Minecraft automatisch umgewandelt)
und HD-Skins (128×128, 256×256 …).

### Figura-Avatar (Bereich „Modell“)

- Beim Öffnen sucht die App Avatare in den Figura-Ordnern von offiziellem Launcher
  (`%APPDATA%\.minecraft\figura\avatars`), Modrinth App, CurseForge, Prism Launcher und MultiMC.
  Avatar wählen → **Laden**. Liegt er woanders: **Ordner wählen …**
- Die Dateien werden nur gelesen (nur `.json`, `.bbmodel`, `.lua`, `.png`; keine Verknüpfungen,
  höchstens 2000 Dateien / 64 MB). Einstellungen werden getrennt gespeichert.
- Gruppen mit Figura-„Parent-Types“ (`Head`, `Body`, `LeftArm`, `RightLeg`, `Cape` …) folgen sofort
  Kopf-Tracking, Körperneigung und Armen. Gruppen für Spielansichten (`Skull`, `Gui`, `Hud`, `Camera`,
  Item-Pivots) werden ausgeblendet.
- Ohren, Schwänze, Haare/Zöpfe und Ausdrucks-Varianten (`AugenZu`, `EyesHappy`, `MundOffen` …) werden
  anhand der Namen erkannt und als Rollen **vorgeschlagen**. „Alle Vorschläge bestätigen“ übernimmt sie
  auf einmal; danach schwingen Ohren und Schwanz mit der Physik, und die Ausdrucks-Varianten werden
  bei passender Mimik eingeblendet (Augen zu beim Blinzeln, Mund offen beim Sprechen, froh beim Lächeln …).
  Einzelne Vorschläge lassen sich im Debug-Modus (F12) ändern.
- **Minecraft-Körper:** Welche Vanilla-Teile sichtbar sind, liest die App vorerst aus Aufrufen wie
  `vanilla_model.PLAYER:setVisible(false)` im Skript. Mit „Eigene Auswahl“ lässt sich das überschreiben.
- Lua-Skripte werden erst ab M5c ausgeführt, Blockbench-Animationen ab M5b. Hinweise dazu stehen
  aufklappbar unter dem geladenen Avatar.

### Modelltyp

- **Automatisch:** Beim Download per Spielername gilt die Angabe von Mojang. Bei Dateien wird anhand
  der Pixel erkannt, ob die Arme 3 px (Slim/Alex) oder 4 px (Classic/Steve) breit sind.
- Falls die Erkennung danebenliegt, Classic oder Slim manuell wählen.

### Ansicht

- Linke Maustaste: drehen · Rechte Maustaste: verschieben · Mausrad: zoomen
- „Zweite Ebene anzeigen“ blendet Hut, Jacke, Ärmel und Hosenbeine ein/aus.
- Die Darstellung ist auf 60 FPS begrenzt, damit bei 144/240-Hz-Monitoren GPU-Leistung für Spiele übrig bleibt.

### Face-Tracking (Bereich „Tracking“)

1. Kamera auswählen und **„Kamera starten“** drücken. Beim ersten Start fragt Windows ggf. nach dem Kamerazugriff.
2. Gerade hinsetzen, auf den Bildschirm schauen und **„Neutrale Pose setzen“** drücken.
3. Die Figur folgt jetzt deinen Kopfbewegungen (Drehen, Nicken, Neigen).

| Einstellung | Wirkung | Standard |
|---|---|---|
| Glättung | Höher = ruhiger, aber etwas träger (One-Euro-Filter) | 50 % |
| Reaktion bei schnellen Bewegungen | Höher = schnelle Bewegungen kommen ohne Verzögerung an | 50 % |
| Bewegungsstärke | 100 % = Figur bewegt den Kopf genauso weit wie du | 100 % |
| Spiegeln | Figur verhält sich wie ein Spiegelbild | an |

Unter **Live-Werte** siehst du Bildraten, Latenz, Kopfwinkel und alle 52 Blendshapes.
Verliert das Tracking dein Gesicht, kehrt der Kopf nach 0,4 s sanft zur Mitte zurück.
Kamera und Regler werden gespeichert.

Das Tracking läuft in einem eigenen Thread (Web Worker) auf der GPU, falls möglich, sonst auf der CPU.
Das Kamerabild verlässt den PC nicht.

„Neutrale Pose setzen“ übernimmt auch die **Ruhewerte der Mimik**. Das hilft z. B., wenn ein
Headset-Mikrofon den Mundwinkel teilweise verdeckt. Den Mikrofonarm am besten seitlich am Mund
vorbeiführen, nicht direkt davor.

### Gesicht & Emotionen

Minecraft-Gesichter sind ein statisches 8 × 8-Bild. Die App legt deshalb ein **Gesichts-Overlay**
knapp vor den Kopf und setzt das Gesicht in jedem Frame neu zusammen:

- **Augen:** offen / halb / zu, Pupillen folgen dem Blick
- **Mund:** zu / halb offen / offen / „O“ / Lächeln / traurig
- **Brauen:** heben und senken sich (wenn der Skin Brauen hat)
- **Emotionen:** fröhlich, traurig, wütend, überrascht – automatisch erkannt oder per Knopf festgehalten

Augen, Brauen und Mund werden automatisch erkannt (auch mehrzeilige „Anime-Augen“ und Gesichtsteile
auf der Hut-Ebene). Liegt die Erkennung daneben: Merkmal wählen und im Raster ein neues Rechteck ziehen.
Schwellwerte für Augen und Mund sind einstellbar. Ohne Häkchen bei „Augen und Mund bewegen“ bleibt das
Gesicht statisch und nur der Kopf bewegt sich.

### Körper & Physik

| Bereich | Funktion |
|---|---|
| Körper | Oberkörper neigt sich mit deiner Kopfposition (zur Seite/nach vorne) um die Hüfte, Schultern drehen leicht mit. Dazu Atmen, leichtes Schwanken und Minecrafts Arm-Wippen im Leerlauf. Alles einzeln regelbar. |
| Physik | Feder-/Pendel-Simulation für alle Teile mit der Rolle Ohr, Schwanz, Haare oder Flügel (Rollen im Debug-Modus vergeben). Pro Teil Stärke, Dämpfung und Achsen; Ketten (mehrgliedrige Schwänze) schwingen peitschenartig nach. |
| Test-Zubehör | Eingebaute Fuchsohren, dreiteiliger Fuchsschwanz und ein blockiges Headset – zum Ausprobieren, bis Figura-Avatare importiert werden können. |
| Arm-Tracking | Optional: MediaPipe Pose (im selben Hintergrund-Thread) – die Arme zeigen von der Schulter zum Handgelenk, auch beim Winken. Schultern und Hände müssen im Bild sein. Ohne erkannte Arme: weicher Übergang ins Arm-Wippen. |
| Lip-Sync | Optional: Mikrofon ergänzt die Mundbewegung über die Lautstärke; dunkle Vokale (O/U) machen den Mund rund. Startet nur per Knopf, das Audio wird nur gemessen, nicht aufgezeichnet. |

Zum **Hand-Tracking**: Minecraft-Arme haben keine Hände oder Finger, daher bringt ein eigenes
Hand-Modell kaum sichtbaren Nutzen (aber zusätzliche Rechenlast). Winken und Armbewegungen kommen
vollständig aus dem Körper-Modell. Falls später Figura-Avatare mit eigenen Händen/Fingern kommen,
lässt es sich nachrüsten.

### Debug-Modus (F12)

| Bereich | Funktion |
|---|---|
| Teile & Rollen | Baum aller Teile und Würfel; Klick in der 3D-Ansicht wählt das Teil (Strg = mehrere, Alt = einzelner Würfel), Klick aufs Gesicht wählt Auge/Pupille/Braue/Mund. Ein-/Ausblenden, Solo, Drahtgitter, Drehpunkte. |
| Rollen | Jedem Teil eine Rolle geben (Kopf, Augen, Pupillen, Brauen, Mund, Lippen, Nase, Ohren, Schwanz, Haare, Flügel, Zubehör oder eigene). Vorschläge der Auto-Erkennung (anhand von Namen wie `LeftEar`, `tail`) müssen bestätigt werden. |
| Treiber | Pro Rolle beliebig viele: Rotation, Position, Skalierung, Sichtbarkeit, UV-Verschiebung, Bildwechsel, Kopf-Tracking, Mund-Logik, Physik (ab M4). Einstellbar: Signal (Blendshape, Kopfwinkel, Blick …), Achse, Eingangs-/Ausgangsbereich, Invertieren, Empfindlichkeit, Glättung, Schwellwerte. Live-Anzeige der Werte. |
| Simulator | Regler für alle Signale. Quelle **Webcam**, **Manuell** oder **Gemischt** (bewegte Regler überschreiben ihren Kanal). |
| Log | Warnungen und Fehler mit Uhrzeit. |

Die Zuordnung wird **pro Avatar** automatisch als JSON gespeichert
(`%APPDATA%\minecraft-vtuber\avatars\`), die Skin-/Avatar-Dateien selbst werden nie verändert.

## Bekannte Einschränkungen

- Halbtransparente Pixel der zweiten Ebene werden als „ganz sichtbar“ oder „ganz unsichtbar“
  dargestellt (Cutout), nicht als echte Halbtransparenz.
- Spieler mit Standard-Skin (Steve/Alex ohne eigenen Skin) können nicht per Name geladen werden,
  weil die Standard-Texturen nicht mitgeliefert werden dürfen.
- Die Slim-Erkennung ist eine Heuristik; Skins, deren ungenutzte Arm-Bereiche bemalt sind, werden
  als Classic erkannt.
- Viele Webcams können nur von einem Programm gleichzeitig genutzt werden. Wenn OBS die Kamera schon
  verwendet, entweder in OBS die Kamera-Quelle deaktivieren oder die Kamera nur hier nutzen.
- Die Gesichtserkennung ist eine Heuristik auf 8 × 8 Pixeln. Wimpern und Brauen direkt über dem Auge
  sind dabei nicht immer eindeutig – im Zweifel im Raster korrigieren.
- Die automatisch erzeugten Mund- und Augenvarianten sind bewusst schlicht; eigene Varianten
  zeichnen kommt mit dem Face-Editor (M6).
- Ob MediaPipe „links“ aus Sicht der Person oder des Bildes meldet, kann je nach Version variieren –
  dafür gibt es „Links/Rechts der Mimik vertauschen“.
- Arm-Tracking zeigt nur die Richtung Schulter → Handgelenk; Minecraft-Arme können nicht abknicken.
- Lip-Sync schätzt nur Lautstärke und „rund/offen“, keine einzelnen Laute.
- Figura (bis M5c): Lua-Skripte laufen noch nicht. Was ein Skript selbst macht (Schweif wedeln,
  Emotes per Aktionsrad, Augen per Skript umschalten), übernehmen bis dahin Rollen, Physik und Tracking.
- Figura: Teile mit der Skin-Textur des Spielers (`primary texture = SKIN`), Kamera-/HUD-Ansichten,
  Sounds und `.moon`-Dateien werden nicht unterstützt.

## Datenschutz und Sicherheit

- Fenster laufen in der Electron-Sandbox ohne Node-Zugriff.
- Eine Netzwerk-Sperre blockiert alle Anfragen aus der Oberfläche. Der Skin-Download läuft im
  Hauptprozess und darf nur `api.mojang.com`, `sessionserver.mojang.com` und `textures.minecraft.net` erreichen.
- Die gebaute App lädt ihre Dateien über das lokale Protokoll `app://bundle/` (nur aus dem eigenen
  Programmordner, Pfade außerhalb werden abgewiesen).
- Das MediaPipe-Modell wird mitgeliefert (`resources/mediapipe/`), es wird nichts nachgeladen.
- Figura-Ordner liest nur der Hauptprozess. Die Oberfläche kennt nur Schlüssel gefundener bzw. per
  Dialog gewählter Ordner und kann keine beliebigen Pfade anfordern.

## Einbindung in OBS

Folgt in Meilenstein M6 (Browser-Quelle `http://localhost:PORT` mit transparentem Hintergrund).

## Projektstruktur

```
src/core/      Plattformunabhängige Logik (PNG, Skin, Modell, Blockbench/Figura, Tracking, Rollen, Physik …)
src/render/    Three.js-Darstellung (von App und später OBS-Viewer genutzt)
src/renderer/  Oberfläche (Preact)
src/main/      Electron-Hauptprozess (Fenster, Dateien, Figura-Import, Skin-Download, Netzwerk-Sperre)
src/preload/   Schmale, typisierte Brücke zwischen Oberfläche und Hauptprozess
src/shared/    IPC-Verträge und Übersetzungen
tests/         Unit-Tests und Testdaten
docs/          Plan und manuelle Testpläne
```
