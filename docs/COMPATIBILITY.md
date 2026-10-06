# Figura-Kompatibilität

Stand: Meilenstein M5c. Ziel ist die Figura-API 0.1.x. Die App ist kein Minecraft – alles, was
eine Spielwelt braucht, wird nachgebildet oder ignoriert. Geprüft mit drei echten Avataren
(Sternenfuchs, Neonkatze, Wolfsritterin) und der Lua-Testsuite (`tests/unit/lua.test.ts`).

Legende: ✅ unterstützt · 🟡 teilweise / angenähert · ❌ nicht unterstützt (ohne Wirkung, einmalige Warnung im Log)

## Avatar-Dateien

| Funktion | Stand | Hinweis |
|---|---|---|
| Ordner mit `avatar.json`, `.bbmodel`, `.lua`, `.png` | ✅ | Suche in Launcher-Ordnern oder per Ordnerdialog; Dateien werden nie verändert |
| `.moon`-Dateien (hochgeladene Avatare) | ❌ | Bitte den Ordner verwenden |
| Mehrere Modelle, Unterordner (`models.ordner.modell`) | ✅ | |
| `autoScripts` in `avatar.json` | ✅ | |
| Gruppen, Würfel (Box- und Per-Face-UV, UV-Drehung, Würfeldrehung), Meshes | ✅ | |
| Eingebettete und externe Texturen, Leucht-Textur `_e` | ✅ | |
| Parent-Types `Head`, `Body`, Arme, Beine, `Cape`, Elytren | ✅ | folgen Tracking, Körperneigung, Arm-Tracking |
| Parent-Type `World` | 🟡 | bleibt einfach stehen |
| `Skull`, `Gui`, `Hud`, `Portrait`, `Camera`, Item-/Papagei-Pivots | ❌ | ausgeblendet (diese Ansichten gibt es hier nicht) |

## Blockbench-Animationen

| Funktion | Stand | Hinweis |
|---|---|---|
| Drehung, Verschiebung, Skalierung | ✅ | |
| Interpolation linear, Catmull-Rom, Bézier, Stufe; Vor-/Nachwerte | ✅ | |
| Loop / Once / Hold, Start- und Loop-Verzögerung, Blend Weight, Override | ✅ | Verzögerungen als Ausdruck → 0 |
| Keyframe-Ausdrücke | 🟡 | eigener Auswerter mit Lua-Regeln: Zahlen, Rechenzeichen, Vergleiche, `and/or/not`, `?:`, `math.*`, `time`/`q.anim_time`. Lua-Methoden (`player:getPos()`) und eigene Variablen werden als 0 gerechnet |
| Timeline-Skripte | ✅ | laufen als Lua-Code beim Erreichen des Zeitpunkts |
| Sound- und Partikel-Keyframes | ❌ | |

## Lua-Umgebung

| Funktion | Stand | Hinweis |
|---|---|---|
| Lua-Version | 🟡 | Lua 5.4 (Figura: LuaJ 5.2). Ergänzt: `unpack`, `bit32`, `math.pow/log10/ldexp/frexp/cosh/sinh/tanh`. Unterschied: `tostring(4/2)` ergibt `2.0` statt `2` |
| `math.lerp/clamp/round/map/sign/shortAngle/lerpAngle`, `math.playerScale/worldScale` | ✅ | |
| `type()` mit Figura-Typen (`Vector3`, `ModelPart` …) | ✅ | |
| `require` (relativ, `/` oder `.`), `listFiles` | ✅ | |
| `print`, `log`, `printTable`, `printJson`, `toJson`, `parseJson` | ✅ | Ausgabe im Bereich „Skript“ |
| Sandbox | ✅ | kein `io`, `os` (außer Zeit), `debug`, `package`, `dofile`, `loadfile`, `string.dump`; `load` nur für Text |
| Instruktionslimit | ✅ | Start 5 Mio., Tick 1 Mio., Bild 1 Mio., Ereignisse 0,5 Mio.; auch `pcall` kann es nicht abfangen. Bei Überschreitung oder Fehler stoppen die Skripte (wie in Figura) |
| Speicherlimit | ✅ | 64 MB |

## APIs

| API | Stand | Hinweis |
|---|---|---|
| `models` / ModelPart: `setPos/Rot/Scale`, `setOffsetRot/OffsetScale`, `setVisible`, `getName/Type/Parent/Children`, Kurzformen (`:rot()` …), `setUV`/`setUVPixels` | ✅ | Werte wie in Blockbench (Pixel, Grad); `getRot()` startet mit der Blockbench-Drehung |
| ModelPart auf Würfeln | 🟡 | Sichtbarkeit und UV ja, Drehen/Verschieben einzelner Würfel nein |
| `setPivot`, `setOffsetPivot` | 🟡 | Wert wird gespeichert, verschiebt aber nicht den Drehpunkt |
| `setColor`, `setOpacity`, `setLight`, `setOverlay`, Render-Types, `setPrimaryTexture("SKIN")` | ❌ | gespeichert, nicht dargestellt |
| `setPreRender` / `setPostRender` | ✅ | |
| Render-Tasks (`newText`, `newItem`, `newBlock`, `newSprite`) | ❌ | |
| `copy`, `moveTo`, `newPart`, Matrizen | ❌ | Attrappen |
| `vanilla_model` (`PLAYER`, `ALL`, `INNER_LAYER`, `OUTER_LAYER`, einzelne Teile) | ✅ | Sichtbarkeit; `setRot/setPos` 🟡; Rüstung, Items, Umhang, Elytren gibt es nicht (ohne Wirkung) |
| `events`: `ENTITY_INIT`, `TICK` (20/s), `WORLD_TICK`, `RENDER`, `POST_RENDER`, `WORLD_RENDER`, `POST_WORLD_RENDER`, `KEY_PRESS`, `CHAT_SEND_MESSAGE`, `CHAT_RECEIVE_MESSAGE` | ✅ | `register`, `remove`, `clear`, `getRegisteredCount`, `function events.tick()` |
| Weitere Events (`MOUSE_*`, `USE_ITEM`, `DAMAGE` …) | ❌ | werden registriert, aber nie ausgelöst |
| `pings` | ✅ | laufen lokal sofort (kein Server) |
| `animations` | ✅ | `play/stop/pause/restart/setPlaying`, `isPlaying`, `getPlayState`, `setSpeed/Loop/Blend/Time/Override`, `getLength`; `setLength`, `setOffset`, Verzögerungen, `newCode` ❌ |
| `keybinds` (`newKeybind`, `fromVanilla`, `press`/`release`) | ✅ | solange das App-Fenster aktiv ist (globale Tasten ab M6) |
| `action_wheel` (Seiten, Aktionen, Titel, Item-Name, Farbe, Umschalter, Links-/Rechtsklick, Scrollen) | ✅ | als Knöpfe im Bereich „Skript“; Item-Symbole und Texturen ❌ |
| `config` (`setName`, `save`, `load`) | ✅ | pro Avatar gespeichert, auch Vektoren |
| `vec`, `vectors` (Rechnen, Swizzles, `length`, `normalize`, `dot`, `cross`, Farbumrechnung …) | ✅ | |
| `matrices` | ❌ | Einheitsmatrix-Attrappe |
| `player` / `user` | 🟡 | Kopfdrehung aus dem Tracking; Schleichen, Laufen, Sprinten, Schlafen, Treffer per Schalter im Bereich „Skript“; Position, Items, Welt-Daten fest |
| `host` | 🟡 | `isHost()` = wahr; Titel/Aktionsleiste ins Log; Chat senden und Zwischenablage gesperrt |
| `world`, `client`, `renderer`, `nameplate`, `avatar` | 🟡 | sinnvolle feste Werte; Setter ohne Wirkung |
| `sounds`, `particles`, `textures` (bearbeiten), `json`, `data`, `raycast`, `net`, `file` | ❌ | |

## Zusammenspiel mit der App

- Lua läuft nach den Rollen und dem Körper und vor Animationen und Physik. Drehungen, Verschiebungen
  und Skalierungen addieren sich zum Tracking (wie Figura zur Vanilla-Bewegung).
- Sichtbarkeit: Lua ersetzt die Sichtbarkeit aus dem Modell. Blendet ein Rollen-Treiber ein Teil
  gerade ein (z. B. „Augen zu“ beim Blinzeln), hat er Vorrang vor einem Lua-Ausblenden.
- Mit „Eigene Auswahl“ beim Minecraft-Körper wird die Vanilla-Sichtbarkeit aus Lua ignoriert.
- Ausschalten: Bereich „Skript“ → „Skripte dieses Avatars ausführen“.
