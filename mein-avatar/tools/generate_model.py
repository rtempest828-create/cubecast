#!/usr/bin/env python3
"""
Erzeugt model.bbmodel (Blockbench, Format 4.10 "Generic Model") aus tools/avatar_def.py.

Aufruf (im Ordner mein-avatar):  python3 tools/generate_model.py
Vorher die Texturen erzeugen (generate_texture.py), denn sie werden eingebettet.

- Projekt-UV-Auflösung 64x64, Texturen 256x256 mit uv_width/uv_height = 64
  -> Blockbench und Figura rechnen jede UV-Einheit auf 4 Texturpixel um.
- Körperteile im Box-UV-Modus (uv_offset wie beim Vanilla-Skin); die Flächen-UVs werden
  zusätzlich genau so gespeichert, wie Blockbench sie selbst berechnet.
- Texturen: eingebettet (Base64) UND mit relative_path. Figura lädt zuerst die Datei
  neben dem Modell (skin.png/extras.png) und nimmt sonst die eingebettete Kopie.
- Format 4.10 statt 5.x: Blockbench 5 öffnet es problemlos, ältere Figura-Versionen lesen
  das neue 5er-Format (Gruppen getrennt vom Gliederungsbaum) dagegen eventuell nicht.
"""

from __future__ import annotations

import base64
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import avatar_def as A  # noqa: E402

NAMESPACE = uuid.UUID("6f1c3c2e-6a51-4b8e-9d0e-2f5a8c1b7e44")
FACE_NAMES = ("north", "east", "south", "west", "up", "down")


def uid(kind: str, name: str) -> str:
    """Stabile UUIDs: gleiches Modell -> gleiche Datei (saubere Git-Diffs)."""
    return str(uuid.uuid5(NAMESPACE, f"{kind}:{name}"))


def num(v: float) -> float | int:
    v = round(float(v), 4)
    return int(v) if v == int(v) else v


def vec(v) -> list:
    return [num(x) for x in v]


def cube_json(cube: A.Cube, pivot, color: int) -> dict:
    tex_index = A.TEXTURES.index(cube.tex)
    data: dict = {
        "name": cube.name,
        "box_uv": cube.uv is not None,
        "rescale": False,
        "locked": False,
        "render_order": "default",
        "allow_mirror_modeling": True,
        "from": vec(cube.frm),
        "to": vec(cube.to),
        "autouv": 0,
        "color": color,
        "origin": vec(pivot),
    }
    if cube.inflate:
        data["inflate"] = num(cube.inflate)
    if cube.uv is not None:
        data["uv_offset"] = list(cube.uv)
        uvs = A.bb_box_face_uvs(cube.uv[0], cube.uv[1], cube.box_size)
        data["faces"] = {f: {"uv": vec(uvs[f]), "texture": tex_index} for f in FACE_NAMES}
    else:
        faces = {}
        for f in FACE_NAMES:
            if f in cube.faces:
                faces[f] = {"uv": vec(cube.faces[f]), "texture": tex_index}
            else:
                faces[f] = {"uv": [0, 0, 0, 0], "texture": None}   # Fläche aus
        data["faces"] = faces
    data["type"] = "cube"
    data["uuid"] = uid("cube", cube.name)
    if not cube.visible:
        data["visibility"] = False
    return data


def build_json(root: A.Group, texture_dir: Path) -> dict:
    elements: list[dict] = []

    def group_json(g: A.Group, depth: int) -> dict:
        children: list = []
        for cube in g.cubes:
            elements.append(cube_json(cube, g.pivot, depth % 8))
            children.append(uid("cube", cube.name))
        for child in g.children:
            children.append(group_json(child, depth + 1))
        data = {
            "name": g.name,
            "origin": vec(g.pivot),
            "color": depth % 8,
            "uuid": uid("group", g.name),
            "export": True,
            "mirror_uv": False,
            "isOpen": depth < 1,
            "locked": False,
            "visibility": g.visible,
            "autouv": 0,
            "children": children,
        }
        if any(g.rotation):
            data["rotation"] = vec(g.rotation)
        return data

    outliner = [group_json(g, 0) for g in root.children]

    textures = []
    for i, name in enumerate(A.TEXTURES):
        png = (texture_dir / f"{name}.png").read_bytes()
        textures.append({
            "path": "",
            "name": f"{name}.png",
            "folder": "",
            "namespace": "",
            "id": str(i),
            "group": "",
            "width": A.TEX_SIZE,
            "height": A.TEX_SIZE,
            "uv_width": A.UV_RES,
            "uv_height": A.UV_RES,
            "particle": i == 0,
            "use_as_default": i == 0,
            "layers_enabled": False,
            "sync_to_project": "",
            "render_mode": "default",
            "render_sides": "auto",
            "pbr_channel": "color",
            "frame_time": 1,
            "frame_order_type": "loop",
            "frame_order": "",
            "frame_interpolate": False,
            "visible": True,
            "internal": True,
            "saved": True,
            "uuid": uid("texture", name),
            "relative_path": f"{name}.png",
            "source": "data:image/png;base64," + base64.b64encode(png).decode("ascii"),
        })

    return {
        "meta": {"format_version": "4.10", "model_format": "free", "box_uv": True},
        "name": A.MODEL_NAME,
        "model_identifier": "",
        "visible_box": [1, 1, 0],
        "variable_placeholders": "",
        "variable_placeholder_buttons": [],
        "timeline_setups": [],
        "unhandled_root_fields": {},
        "resolution": {"width": A.UV_RES, "height": A.UV_RES},
        "elements": elements,
        "outliner": outliner,
        "textures": textures,
    }


def generate(out_dir: Path) -> Path:
    root = A.build()
    model = build_json(root, out_dir)
    path = out_dir / f"{A.MODEL_NAME}.bbmodel"
    # kompakt, aber zeilenweise lesbar genug für Diffs
    path.write_text(json.dumps(model, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return path


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent
    p = generate(out)
    print(f"{p.name}: {p.stat().st_size} Bytes")
