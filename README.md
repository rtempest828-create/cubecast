# Minecraft VTuber

Windows-Desktop-App, die einen Minecraft-Skin oder Figura-Avatar als blockiges 3D-Modell
darstellt und per Webcam-Face-Tracking steuert – zum Streamen mit OBS oder für Discord.
Alles läuft lokal, ohne Konto und ohne Cloud.

> **Stand: Meilenstein M6** – Skin laden, Kopf/Augen/Mund/Mimik per Webcam, Debug-Modus mit Rollen,
> Körper-Mitbewegung und Leerlauf, Physik, Arm-Tracking, Mikrofon-Lip-Sync, Figura-Avatare mit
> Blockbench-Animationen und Lua-Skripten, OBS-Ausgabe mit transparentem Hintergrund, Ausgabefenster,
> Kamera-Presets, Profile, globale Tastenkürzel, Face-Editor und Windows-Installer.
> Als Nächstes: Chibi-Modus (M3b, siehe [docs/spec-M3b-chibi.md](docs/spec-M3b-chibi.md)).

## Installation

**Als Programm:** `Minecraft-VTuber-Setup-<Version>.exe` ausführen (Erstellung siehe „Installer bauen“).
Windows warnt eventuell, weil das Programm nicht signiert ist („Weitere Informationen“ → „Trotzdem ausführen“).

**Aus dem Quellcode:** Voraussetzungen Windows 10/11, [Node.js](https://nodejs.org/) 20 oder neuer.

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

Installer bauen (ergibt `dist/Minecraft-VTuber-Setup-<Version>.exe`):

```bash
npm run dist
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
- Hinweise zum Avatar (z. B. ausgeblendete Spielansichten) stehen aufklappbar unter dem geladenen Avatar.
- Zum Ausprobieren liegt ein Beispiel-Avatar mit Animationen bei (`examples/figura/Beispiel-Fuchs`,
  in der Liste als „Beispiel“).

### Animationen (Bereich „Animationen“)

- Zeigt alle Blockbench-Animationen des geladenen Figura-Avatars: abspielen, pausieren, von vorn, stoppen,
  Fortschrittsbalken; „Alle stoppen“.
- Unterstützt: Drehung, Verschiebung, Skalierung; Interpolation linear, Catmull-Rom, Bézier (mit Griffen)
  und Stufe; Sprünge (Vor-/Nachwert); Wiederholung Endlos / Einmal / Ende halten; Start- und
  Loop-Verzögerung; Stärke („Blend Weight“); „Override“ (ersetzt Tracking und Leerlauf der animierten Teile).
- Keyframe-Werte dürfen Ausdrücke sein (`math.sin(time * 4) * 10`). Wie in Figura gelten Lua-Regeln
  (Winkel im Bogenmaß); Molang-Schreibweisen wie `q.anim_time` werden ebenfalls verstanden.
- Pro Animation unter „Einstellungen“: **Autostart** beim Laden, eigener Wiederholungsmodus, **Tempo**,
  **Stärke** und ein **Auslöser**: Die Animation läuft, solange ein Tracking-Signal über einer Schwelle
  liegt (z. B. Schweif wedelt beim Lächeln), oder startet bei jedem Überschreiten neu (z. B. Hüpfer beim
  Mund-Öffnen). Wird pro Avatar gespeichert.
- Mehrere Animationen laufen gleichzeitig und addieren sich; Ohren und Schweif reagieren mit der Physik darauf.

### Lua-Skripte (Bereich „Skript (Lua)“)

- Die Lua-Skripte des Figura-Avatars laufen automatisch (20 Ticks pro Sekunde plus jedes Bild), in einer
  abgeschotteten Umgebung ohne Datei-, Netzwerk- oder Systemzugriff, mit Instruktions- und Speicherlimit.
  Bei einem Fehler stoppen die Skripte wie in Figura; „Neu starten“ startet sie erneut.
- **Aktionsrad:** Die Aktionen des Skripts erscheinen als Knöpfe (Klick, Rechtsklick, Mausrad).
- **Tasten** aus `keybinds` funktionieren, solange das App-Fenster aktiv ist.
- **Spielzustand:** Schleichen, Laufen, Sprinten, Schlafen und „Treffer simulieren“ spielen dem Skript
  Spielsituationen vor; Chat-Nachrichten gehen nur an das Skript (z. B. Mund bewegt sich beim „Reden“).
- `print`-Ausgaben, Warnungen und Fehler stehen unter „Ausgabe“, `config`-Daten werden pro Avatar gespeichert.
- Kopfdrehung aus dem Tracking addiert sich zu dem, was das Skript tut; blendet die Mimik eine
  Ausdrucks-Gruppe ein (z. B. „Augen zu“), hat das Vorrang vor dem Skript.
- Was genau unterstützt wird: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

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

**Face-Editor:** Unten im Bereich lassen sich die Varianten (Auge halb/zu, alle Mundformen) Zelle für
Zelle selbst zeichnen – Linksklick malt, Rechtsklick stellt das Original wieder her. Eigene Varianten
ersetzen die automatischen und werden pro Avatar gespeichert.

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
- Figura: Die App ist kein Minecraft. Welt, Items, Sounds, Partikel, Render-Tasks, Farben/Licht per Lua,
  `primary texture = SKIN`, Kamera-/HUD-Ansichten und `.moon`-Dateien werden nicht unterstützt;
  Lua läuft als 5.4 statt 5.2. Vollständige Liste: [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

- Ausgabe: Die OBS-Quelle bekommt das Bild als Daten über den lokalen Server; bei sehr vielen
  gleichzeitigen Ausgaben oder großen Figura-Texturen kann der Start der Quelle ein paar Sekunden dauern.
- Das Ausgabefenster kann auf Windows nicht mit der Maus in der Größe verändert werden (durchsichtige
  Fenster); Größe im Bereich „Ausgabe“ wählen.
- Der Installer ist nicht signiert (Windows-SmartScreen-Warnung beim ersten Start).

## Datenschutz und Sicherheit

- Fenster laufen in der Electron-Sandbox ohne Node-Zugriff.
- Eine Netzwerk-Sperre blockiert alle Anfragen aus der Oberfläche. Der Skin-Download läuft im
  Hauptprozess und darf nur `api.mojang.com`, `sessionserver.mojang.com` und `textures.minecraft.net` erreichen.
- Die gebaute App lädt ihre Dateien über das lokale Protokoll `app://bundle/` (nur aus dem eigenen
  Programmordner, Pfade außerhalb werden abgewiesen).
- Das MediaPipe-Modell wird mitgeliefert (`resources/mediapipe/`), es wird nichts nachgeladen.
- Lua-Skripte laufen in einer WebAssembly-Sandbox (wasmoon) ohne `io`, `os`, `debug`, `package` und
  Dateizugriff, mit Instruktions- und Speicherlimit; Chat senden und Zwischenablage sind gesperrt.
- Der Ausgabe-Server lauscht nur auf 127.0.0.1, prüft Host und Herkunft jeder Anfrage und nimmt keine
  Daten an; er liefert nur die Ausgabeseite und den Datenstrom.
- Figura-Ordner liest nur der Hauptprozess. Die Oberfläche kennt nur Schlüssel gefundener bzw. per
  Dialog gewählter Ordner und kann keine beliebigen Pfade anfordern.

## Einbindung in OBS und Discord (Bereich „Ausgabe“)

**OBS (empfohlen):** Im Bereich „Ausgabe“ die Adresse kopieren (Standard `http://127.0.0.1:47800/`),
in OBS *Quellen → + → Browser* anlegen, Adresse einfügen, Breite/Höhe z. B. 1080 × 1080. Der Hintergrund
ist durchsichtig. Die Seite zeigt genau das, was die App zeigt (Tracking und Skripte laufen in der App).

- **Hintergrund:** durchsichtig, Greenscreen oder eigene Farbe
- **Kamera:** Ganzkörper, Oberkörper, Nahaufnahme oder „Aktuelle 3D-Ansicht übernehmen“; dazu Zoom und Blickwinkel
- **Ausgabefenster:** rahmenloses, durchsichtiges Fenster (Größe wählbar, optional immer im Vordergrund) –
  für Fensteraufnahme oder Discord-Bildschirmübertragung (dort am besten Greenscreen). Verschieben mit der Maus.
- Die Ausgabe ist nur auf diesem PC erreichbar (127.0.0.1); andere Webseiten können sie nicht auslesen.

## Profile und Tastenkürzel (Bereich „Einstellungen“)

- **Profile** speichern Skin, Figura-Avatar sowie Tracking-, Körper- und Ausgabe-Einstellungen unter
  einem Namen (z. B. „Stream“, „Discord“). Ein Profil kann beim Start automatisch geladen werden.
- **Globale Tastenkürzel** wirken auch, wenn Minecraft im Vordergrund ist: Emotion festhalten,
  Animation starten/stoppen, Aktion aus dem Figura-Aktionsrad, Skript-Taste, Ausgabefenster, neutrale
  Pose, Profil laden. Tipp: Strg/Alt/Umschalt-Kombinationen oder F13–F24, damit im Spiel nichts fehlt.

## Projektstruktur

```
src/core/      Plattformunabhängige Logik (PNG, Skin, Modell, Blockbench/Figura, Tracking, Rollen, Physik …)
src/render/    Three.js-Darstellung (von App und später OBS-Viewer genutzt)
src/renderer/  Oberfläche (Preact) und Ausgabeseite für OBS (viewer.html)
src/main/      Electron-Hauptprozess (Fenster, Dateien, Figura-Import, Skin-Download, Netzwerk-Sperre,
               Ausgabe-Server, Profile, globale Tastenkürzel)
src/preload/   Schmale, typisierte Brücke zwischen Oberfläche und Hauptprozess
src/shared/    IPC-Verträge und Übersetzungen
tests/         Unit-Tests und Testdaten
docs/          Plan und manuelle Testpläne
```
