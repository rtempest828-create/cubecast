# Projektplan

Freigegebener Plan (Schritt 1). Änderungen am Plan werden hier nachgetragen.

## Tech-Stack

| Bereich | Wahl |
|---|---|
| App-Hülle | Electron + electron-vite |
| Sprache | TypeScript (`strict`, `noUncheckedIndexedAccess`) |
| 3D | Three.js (`NearestFilter`, keine Mipmaps) |
| Tracking | `@mediapipe/tasks-vision` im Web Worker, Modelle lokal gebündelt |
| Lua | wasmoon (Lua 5.4/WASM) + Kompatibilitäts-Prelude für Figuras LuaJ (5.2) |
| UI | Preact + Signals |
| OBS-Server | Node `http` + `ws`, nur `127.0.0.1` |
| Tests | Vitest |
| Packaging | electron-builder (M6) |

PNG-Decoder, Molang/Keyframe-Ausdrücke, NBT (`.moon`), One-Euro-Filter und Physik sind eigener Code ohne Abhängigkeiten.

## Architektur

```
Tracking-Worker → Signal-Quelle (Webcam | Simulator | gemischt) → Kalibrierung → Filter
   → Pose-Pipeline pro Frame:
       1 Vanilla-Pose (Kopf, Körper, Idle, Arme)
       2 Lua (TICK 20 Hz, RENDER, POST_RENDER)
       3 Blockbench-Animationen (additiv, gewichtet)
       4 Rollen-Treiber (Blinzeln, Mund, Pupillen, Brauen …)
       5 Physik (Ohren, Schwanz, Haare)
       6 Gesichts-Variante
   → AvatarState → Three.js-Szene (App) und WebSocket → OBS-Viewer
```

- `src/core/` ist frei von Three.js und DOM und vollständig unit-testbar.
- Vanilla-, `.bbmodel`- und Overlay-Teile liegen in **einem** Teilebaum (`AvatarModel`).
- Der OBS-Viewer spiegelt nur den `AvatarState`; Lua und Tracking laufen ausschließlich in der App.
- Koordinatensystem: Einheit = Skin-Pixel, Y oben, Figur schaut nach +Z, rechte Körperseite bei −X.
- Bezeichner auf Englisch, Kommentare und UI-Texte auf Deutsch (`src/shared/i18n`).

## Meilensteine

| # | Inhalt |
|---|---|
| M0 | Projektgerüst, Netzwerk-Sperre, i18n, Tests, Git |
| M1 | Skin laden (Datei, Drag & Drop, Spielername), 64×32/HD, Steve/Alex, beide Ebenen |
| M2 | Webcam, Tracking-Worker, Kopfrotation, One-Euro-Filter, Kalibrierung, Debug-Werte |
| M3 | Gesichts-Overlay + Varianten, Augen/Mund/Brauen/Emotionen, **Debug-Modus (F12)** mit Baum, Raycast-Auswahl, Rollen, Tracking-Simulator |
| M3b | **Chibi-Modus:** nicht-destruktive Kind-/Chibi-Version des Avatars (Proportionen, Gesicht, Zubehör), Umschalten, pro Avatar gespeichert, Feinanpassung pro Rolle/Teil im Debug-Modus. Spezifikation nach Interview mit dem Nutzer. Auf Wunsch des Nutzers nach M6 gebaut; deckt Vanilla, Test-Zubehör, Figura-Teile, Animationen und Lua mit ab (erledigt). |
| M4 | Körper-Idle, Physik, optional Arm-/Hand-Tracking, optional Audio-Lip-Sync |
| M5a | `.bbmodel`-Parser, Figura-Ordner, Parent-Types, Cosmetic-Zuordnung (+ `.moon` falls nötig) |
| M5b | Blockbench-Animationen (alle Kanäle/Interpolationen, Ausdrücke, Loop-Modi, Blending), Animations-Panel |
| M5c-1 | Lua-Kern: Sandbox, `require`, `models`, `animations`, `vanilla_model`, Events, Warnungen |
| M5c-2 | `keybinds`, `action_wheel`, Mock-Objekte, `config`, Pings lokal, Stubs, `COMPATIBILITY.md` |
| M6 | OBS-Quelle, Transparenz, Ausgabefenster, Kamera-Presets, Profile, globale Hotkeys, Face-Editor, Packaging |

Nach jedem Meilenstein: Tests, manueller Testplan in `docs/`, Startanleitung, Commit.

## Offene Punkte

- **Avatar-Format:** Ordner-Avatare (`avatar.json` + `.bbmodel` + `.lua`) werden zuerst unterstützt.
  `.moon`-Import (Figuras NBT-Format) folgt in M5a, falls benötigt.
- **Figura-Version:** Ziel ist die aktuelle 0.1.x-API; wird mit Beispiel-Avataren abgeglichen.
- **Beispiel-Avatare** bitte nach `tests/fixtures/user-avatars/` legen (nicht im Git).

## Bekannte Grenzen der Figura-Emulation (Einschätzung)

- **Voll:** Geometrie inkl. Meshes, Parent-Types, Blockbench-Animationen, `animations`, ModelPart-Transformationen,
  `vanilla_model`, Basis-Events, `keybinds`, `action_wheel`, `vec`/`matrices`, `config`, Pings (lokal), eigene Sounds.
- Details zum tatsächlichen Stand: [COMPATIBILITY.md](COMPATIBILITY.md).
- **Teilweise:** Lua-Dialekt-Unterschiede (5.2 vs. 5.4), Keyframe-Ausdrücke (Figura wertet sie als Lua aus),
  `player`/`world`/`host` nur als Attrappen (z. B. JimmyAnims zeigt standardmäßig Idle), Render-Types außer
  EMISSIVE/TRANSLUCENT nur angenähert, Text-Tasks mit Ersatzschrift, Instruktionslimits vereinfacht.
- **Nicht geplant:** Item-/Block-Rendering (Minecraft-Assets), Welt-Interaktion, Figura-Backend, Shader,
  GUI/HUD/Skull-Parent-Types.
