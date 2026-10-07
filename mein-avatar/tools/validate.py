#!/usr/bin/env python3
"""
Prüft den Avatar-Ordner, bevor er nach .minecraft/figura/avatars kopiert wird.

Aufruf (im Ordner mein-avatar):  python3 tools/validate.py
Rückgabe: 0 = alles in Ordnung (Warnungen möglich), 1 = Fehler gefunden.

Geprüft wird:
  - avatar.json und model.bbmodel sind gültiges JSON mit den nötigen Feldern
  - skin.png und extras.png sind exakt 256x256 und RGBA
  - Projekt-UV 64x64, Texturen mit uv_width/uv_height 64 (UV-Skalierung x4)
  - die eingebetteten Texturen in model.bbmodel entsprechen den PNG-Dateien
  - alle UVs liegen innerhalb der Textur; Box-UV-Flächen passen zu uv_offset und Größe
  - keine überlappenden UV-Flächen zwischen Würfeln (gewollte Ausnahmen: keine)
  - Pflichtgruppen für Figura (Head, Body, Arme, Beine) und keine versehentlichen Parent-Types
  - Lua-Skript: Syntax (wenn "lupa" installiert ist) und keine Lua-5.3+-Operatoren (Figura = Lua 5.2)
  - geschätzte Avatar-Größe unter dem Figura-Limit, Anzahl gezeichneter Flächen
"""

from __future__ import annotations

import base64
import gzip
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FIGURA_LIMIT = 100 * 1024          # Standard-Uploadlimit von Figura (100 KB); Server können abweichen
PARENT_TYPES = ("Head", "Body", "LeftArm", "RightArm", "LeftLeg", "RightLeg", "Cape", "LeftElytra", "RightElytra",
                "LeftElytron", "RightElytron", "World", "Skull", "Portrait", "Hud", "HUD", "Gui", "GUI", "Camera",
                "Arrow", "Trident", "Item", "LeftItemPivot", "RightItemPivot", "LeftSpyglassPivot",
                "RightSpyglassPivot", "HelmetItemPivot", "LeftParrotPivot", "RightParrotPivot")
REQUIRED_GROUPS = ("Head", "Body", "RightArm", "LeftArm", "RightLeg", "LeftLeg")

errors: list[str] = []
warnings: list[str] = []
infos: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        err(f"{path.name} fehlt")
    except json.JSONDecodeError as e:
        err(f"{path.name} ist kein gültiges JSON: {e}")
    return None


def bb_box_face_uvs(u, v, w, h, d):
    return {
        "east": [u, v + d, u + d, v + d + h],
        "west": [u + d + w, v + d, u + 2 * d + w, v + d + h],
        "up": [u + d + w, v + d, u + d, v],
        "down": [u + d + 2 * w, v, u + d + w, v + d],
        "south": [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
        "north": [u + d, v + d, u + d + w, v + d + h],
    }


def check_avatar_json() -> None:
    data = load_json(ROOT / "avatar.json")
    if data is None:
        return
    if not isinstance(data, dict):
        err("avatar.json muss ein JSON-Objekt sein")
        return
    if not data.get("name"):
        warn("avatar.json: kein \"name\" – Figura zeigt dann den Ordnernamen")
    authors = data.get("authors", data.get("author"))
    if authors is None:
        warn("avatar.json: keine Autoren angegeben")


def check_textures(model: dict) -> dict[int, Image.Image]:
    out = {}
    res = model.get("resolution", {})
    if (res.get("width"), res.get("height")) != (64, 64):
        err(f"Projekt-UV-Auflösung ist {res}, erwartet 64x64")
    for i, t in enumerate(model.get("textures", [])):
        name = t.get("name", f"textur{i}")
        path = ROOT / t.get("relative_path", name)
        if not path.exists():
            err(f"Textur {name}: Datei {path.name} fehlt neben dem Modell")
            continue
        img = Image.open(path)
        if img.size != (256, 256):
            err(f"{path.name} ist {img.size[0]}x{img.size[1]}, erwartet exakt 256x256")
        if img.mode != "RGBA":
            err(f"{path.name} hat Farbmodus {img.mode}, erwartet RGBA")
        if (t.get("width"), t.get("height")) != img.size:
            err(f"model.bbmodel: Textur {name} meldet {t.get('width')}x{t.get('height')}, Datei ist {img.size}")
        if (t.get("uv_width"), t.get("uv_height")) != (64, 64):
            err(f"model.bbmodel: Textur {name} hat uv_width/uv_height {t.get('uv_width')}x{t.get('uv_height')}, erwartet 64x64")
        scale = img.size[0] / t.get("uv_width", 64)
        if scale != 4:
            err(f"Textur {name}: UV-Skalierung {scale}, erwartet 4 (256 / 64)")
        src = t.get("source", "")
        if src.startswith("data:image/png;base64,"):
            embedded = base64.b64decode(src.split(",", 1)[1])
            if embedded != path.read_bytes():
                warn(f"{path.name} wurde nach dem Erzeugen des Modells geändert – Figura nimmt die Datei, "
                     "Blockbench zeigt die eingebettete Kopie. tools/generate_model.py erneut ausführen.")
        else:
            warn(f"Textur {name} ist nicht eingebettet (Blockbench sucht dann den Pfad)")
        out[i] = img.convert("RGBA")
        infos.append(f"{path.name}: {img.size[0]}x{img.size[1]} {img.mode}, {path.stat().st_size} Bytes")
    return out


def walk_outliner(model: dict):
    """Liefert (Gruppenpfad, Gruppe) und ordnet Würfel ihren Gruppen zu."""
    groups = []

    def rec(node, path):
        if isinstance(node, str):
            return
        groups.append((path + [node["name"]], node))
        for child in node.get("children", []):
            rec(child, path + [node["name"]])

    for node in model.get("outliner", []):
        rec(node, [])
    return groups


def check_structure(model: dict) -> None:
    meta = model.get("meta", {})
    if meta.get("model_format") != "free":
        warn(f"model_format ist {meta.get('model_format')!r}; Figura-Avatare nutzen \"free\" (Generic Model)")
    groups = walk_outliner(model)
    top = [g["name"] for p, g in groups if len(p) == 1]
    for req in REQUIRED_GROUPS:
        if req not in top:
            err(f"Gruppe {req} fehlt auf oberster Ebene (Figura braucht sie als Parent-Type)")
    names = {}
    for path, g in groups:
        name = g["name"]
        if name in names:
            warn(f"Gruppenname {name} kommt doppelt vor (in Lua nicht eindeutig ansprechbar)")
        names[name] = path
        if len(path) > 1:
            hit = next((t for t in sorted(PARENT_TYPES, key=len, reverse=True) if name.startswith(t)), None)
            if hit:
                err(f"Untergruppe {'/'.join(path)} beginnt mit dem Figura-Schlüsselwort {hit} "
                    "und würde doppelt mitbewegt")
    for e in model.get("elements", []):
        hit = next((t for t in sorted(PARENT_TYPES, key=len, reverse=True) if e["name"].startswith(t)), None)
        if hit:
            err(f"Würfel {e['name']} beginnt mit dem Figura-Schlüsselwort {hit}")
    referenced = set()

    def refs(node):
        for c in node.get("children", []):
            if isinstance(c, str):
                referenced.add(c)
            else:
                refs(c)

    for n in model.get("outliner", []):
        if isinstance(n, dict):
            refs(n)
    for e in model.get("elements", []):
        if e["uuid"] not in referenced:
            warn(f"Würfel {e['name']} hängt in keiner Gruppe")


def check_uvs(model: dict, textures: dict[int, Image.Image]) -> int:
    """Prüft UV-Grenzen, Box-UV-Konsistenz und Überlappungen. Liefert die Anzahl gezeichneter Flächen."""
    uvw = {i: (t.get("uv_width", 64), t.get("uv_height", 64)) for i, t in enumerate(model.get("textures", []))}
    owner: dict[int, dict[tuple[int, int], str]] = {}
    face_count = 0
    empty = []
    for e in model.get("elements", []):
        size = [round(b - a, 6) for a, b in zip(e["from"], e["to"])]
        if e.get("box_uv"):
            w, h, d = (int(abs(s) + 1e-6) for s in size)
            if any(abs(s - round(s)) > 1e-6 for s in size):
                warn(f"{e['name']}: Box-UV mit nicht ganzzahliger Größe {size}")
            u, v = e.get("uv_offset", [0, 0])
            expected = bb_box_face_uvs(u, v, w, h, d)
        else:
            expected = None
        for fname, face in e.get("faces", {}).items():
            tex = face.get("texture")
            if tex is None:
                continue
            uv = face["uv"]
            if expected and [round(x, 4) for x in uv] != [round(x, 4) for x in expected[fname]]:
                err(f"{e['name']}/{fname}: UV {uv} passt nicht zu uv_offset (erwartet {expected[fname]})")
            W, H = uvw.get(tex, (64, 64))
            x0, x1 = sorted((uv[0], uv[2]))
            y0, y1 = sorted((uv[1], uv[3]))
            if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
                err(f"{e['name']}/{fname}: UV {uv} liegt außerhalb der Textur (0..{W}, 0..{H})")
                continue
            if x1 - x0 <= 0 or y1 - y0 <= 0:
                continue  # Fläche ohne Ausdehnung (z. B. Seiten einer flachen Ebene)
            face_count += 1
            img = textures.get(tex)
            k = img.size[0] / W if img else 4
            px = [(x, y) for y in range(int(y0 * k), int(y1 * k)) for x in range(int(x0 * k), int(x1 * k))]
            cells = owner.setdefault(tex, {})
            clash = None
            for p in px:
                prev = cells.get(p)
                if prev and prev.split("/")[0] != e["name"]:
                    clash = prev
                cells[p] = f"{e['name']}/{fname}"
            if clash:
                err(f"{e['name']}/{fname} überlappt in der Textur mit {clash}")
            if img and not any(img.getpixel(p)[3] for p in px):
                empty.append(f"{e['name']}/{fname}")
    if empty:
        infos.append(f"{len(empty)} Flächen sind absichtlich ganz durchsichtig (z. B. Unterseiten der Außenschicht)")
    return face_count


def check_lua() -> int:
    total = 0
    for path in sorted(ROOT.glob("*.lua")):
        src = path.read_text(encoding="utf-8")
        total += len(src.encode("utf-8"))
        # Kommentare und Strings grob entfernen, dann nach Lua-5.3+-Syntax suchen
        code = re.sub(r"--\[\[.*?\]\]", "", src, flags=re.S)
        code = re.sub(r"--[^\n]*", "", code)
        code = re.sub(r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'", "\"\"", code)
        for pattern, what in ((r"//", "Ganzzahldivision //"), (r"(?<![=~<>])&|\|", "Bitoperator & oder |"),
                              (r"<<|>>", "Bitverschiebung"), (r"\bgoto\b", "goto"), (r"<const>|<close>", "Attribut <const>/<close>")):
            if re.search(pattern, code):
                err(f"{path.name}: {what} gibt es in Figuras Lua 5.2 nicht")
        try:
            from lupa import LuaRuntime  # optional
        except ImportError:
            infos.append("Lua-Syntax nicht geprüft (pip install lupa)")
            continue
        lua = LuaRuntime()
        ok, msg = lua.eval("function(s, n) local f, e = load(s, '=' .. n) return f ~= nil, e end")(src, path.name)
        if not ok:
            err(f"Lua-Syntaxfehler: {msg}")
    return total


def estimate_size(model: dict) -> int:
    """
    Grobe Schätzung der Figura-Avatargröße: Figura speichert Texturen als PNG-Bytes, Skripte als Text
    und das Modell als kompaktes NBT; alles zusammen wird komprimiert. Die echte Zahl zeigt Figura
    in der Garderobe an.
    """
    png = sum((ROOT / t.get("relative_path", t["name"])).stat().st_size for t in model.get("textures", []))
    scripts = b"".join(p.read_bytes() for p in sorted(ROOT.glob("*.lua")))
    slim = {"elements": [{k: v for k, v in e.items() if k in ("name", "from", "to", "origin", "rotation", "inflate", "faces")}
                         for e in model.get("elements", [])],
            "outliner": model.get("outliner", [])}
    meta = json.dumps(slim, separators=(",", ":")).encode()
    packed = len(gzip.compress(scripts + meta, 9))
    return png + packed


def main() -> int:
    check_avatar_json()
    model = load_json(ROOT / "model.bbmodel")
    if model is not None:
        textures = check_textures(model)
        check_structure(model)
        faces = check_uvs(model, textures)
        infos.append(f"gezeichnete Flächen (alle Teile sichtbar): {faces}")
        lua_bytes = check_lua()
        infos.append(f"Lua-Skripte: {lua_bytes} Bytes")
        size = estimate_size(model)
        infos.append(f"geschätzte Figura-Avatargröße: {size} Bytes ({size / 1024:.1f} KB) von {FIGURA_LIMIT // 1024} KB")
        if size > FIGURA_LIMIT:
            err("Avatar ist voraussichtlich größer als das Figura-Limit")
        elif size > FIGURA_LIMIT * 0.8:
            warn("Avatar liegt über 80 % des Figura-Limits")
    folder = sum(p.stat().st_size for p in ROOT.glob("*") if p.is_file())
    infos.append(f"Dateien im Avatar-Ordner (ohne Unterordner): {folder} Bytes")

    for m in infos:
        print(f"  info    {m}")
    for m in warnings:
        print(f"  WARNUNG {m}")
    for m in errors:
        print(f"  FEHLER  {m}")
    print("OK – keine Fehler gefunden." if not errors else f"{len(errors)} Fehler gefunden.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
