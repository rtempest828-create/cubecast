# Minecraft VTuber

Windows-Desktop-App, die einen Minecraft-Skin (und später Figura-Avatare) als blockiges 3D-Modell
darstellt und per Webcam-Face-Tracking steuert – zum Streamen mit OBS oder für Discord.
Alles läuft lokal, ohne Konto und ohne Cloud.

> **Stand: Meilenstein M2** – Skin laden, als 3D-Modell anzeigen, Kopf per Webcam steuern.
> Gesicht/Mimik, Physik, Figura-Import und Streaming-Ausgabe folgen (siehe [docs/PLAN.md](docs/PLAN.md)).

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

## Bekannte Einschränkungen

- Halbtransparente Pixel der zweiten Ebene werden als „ganz sichtbar“ oder „ganz unsichtbar“
  dargestellt (Cutout), nicht als echte Halbtransparenz.
- Spieler mit Standard-Skin (Steve/Alex ohne eigenen Skin) können nicht per Name geladen werden,
  weil die Standard-Texturen nicht mitgeliefert werden dürfen.
- Die Slim-Erkennung ist eine Heuristik; Skins, deren ungenutzte Arm-Bereiche bemalt sind, werden
  als Classic erkannt.
- Viele Webcams können nur von einem Programm gleichzeitig genutzt werden. Wenn OBS die Kamera schon
  verwendet, entweder in OBS die Kamera-Quelle deaktivieren oder die Kamera nur hier nutzen.
- Augen, Mund und Mimik bewegen sich noch nicht (Meilenstein M3).

## Datenschutz und Sicherheit

- Fenster laufen in der Electron-Sandbox ohne Node-Zugriff.
- Eine Netzwerk-Sperre blockiert alle Anfragen aus der Oberfläche. Der Skin-Download läuft im
  Hauptprozess und darf nur `api.mojang.com`, `sessionserver.mojang.com` und `textures.minecraft.net` erreichen.
- Die gebaute App lädt ihre Dateien über das lokale Protokoll `app://bundle/` (nur aus dem eigenen
  Programmordner, Pfade außerhalb werden abgewiesen).
- Das MediaPipe-Modell wird mitgeliefert (`resources/mediapipe/`), es wird nichts nachgeladen.

## Einbindung in OBS

Folgt in Meilenstein M6 (Browser-Quelle `http://localhost:PORT` mit transparentem Hintergrund).

## Projektstruktur

```
src/core/      Plattformunabhängige Logik (PNG, Skin, Modell, später Tracking, Animation …)
src/render/    Three.js-Darstellung (von App und später OBS-Viewer genutzt)
src/renderer/  Oberfläche (Preact)
src/main/      Electron-Hauptprozess (Fenster, Dateien, Skin-Download, Netzwerk-Sperre)
src/preload/   Schmale, typisierte Brücke zwischen Oberfläche und Hauptprozess
src/shared/    IPC-Verträge und Übersetzungen
tests/         Unit-Tests und Testdaten
docs/          Plan und manuelle Testpläne
```
