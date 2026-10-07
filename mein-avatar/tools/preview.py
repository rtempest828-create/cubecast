#!/usr/bin/env python3
"""
Vorschau ohne Minecraft: ein kleiner Software-Renderer (orthografisch, Nearest-Neighbor,
Alpha-Cutout wie in Figura) für model.bbmodel.

Aufruf (im Ordner mein-avatar):
  python3 tools/preview.py                 -> doku/ansichten.png, doku/posen.png, doku/gesichter.png

Gelesen wird nur model.bbmodel (inkl. eingebetteter Texturen) – also genau die Datei,
die auch Blockbench und Figura bekommen. Flächen-Ausrichtung wie in Blockbench:
  north: links im Bild = +X     south: links = -X
  east : links im Bild = +Z     west : links = -Z
  up   : links = -X, oben = -Z  down : links = -X, oben = +Z
(ein UV-Paar [u1,v1,u2,v2] gehört zur Ecke "oben links" bzw. "unten rechts")
"""

from __future__ import annotations

import base64
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# Modell laden

class Model:
    def __init__(self, path: Path):
        data = json.loads(path.read_text(encoding="utf-8"))
        self.res = (data["resolution"]["width"], data["resolution"]["height"])
        self.textures = []
        for t in data["textures"]:
            src = t.get("source", "")
            if src.startswith("data:"):
                img = Image.open(io.BytesIO(base64.b64decode(src.split(",", 1)[1])))
            else:
                img = Image.open(path.parent / t["relative_path"])
            img = img.convert("RGBA")
            uvw = t.get("uv_width", self.res[0])
            uvh = t.get("uv_height", self.res[1])
            self.textures.append((np.array(img), img.width / uvw, img.height / uvh))
        self.elements = {e["uuid"]: e for e in data["elements"]}
        self.outliner = data["outliner"]


def rot_matrix(deg) -> np.ndarray:
    """Blockbench/three.js-Euler, Reihenfolge ZYX: M = Rz * Ry * Rx."""
    x, y, z = (math.radians(v) for v in deg)
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rz @ ry @ rx


def affine(pivot, deg) -> np.ndarray:
    """4x4: um pivot drehen."""
    m = np.eye(4)
    r = rot_matrix(deg)
    p = np.array(pivot, dtype=float)
    m[:3, :3] = r
    m[:3, 3] = p - r @ p
    return m


def face_corners(f: str, a, b):
    """Ecken [oben links, oben rechts, unten links, unten rechts] einer Fläche (Blockbench-Ausrichtung)."""
    x0, y0, z0 = a
    x1, y1, z1 = b
    return {
        "north": [(x1, y1, z0), (x0, y1, z0), (x1, y0, z0), (x0, y0, z0)],
        "south": [(x0, y1, z1), (x1, y1, z1), (x0, y0, z1), (x1, y0, z1)],
        "east": [(x1, y1, z1), (x1, y1, z0), (x1, y0, z1), (x1, y0, z0)],
        "west": [(x0, y1, z0), (x0, y1, z1), (x0, y0, z0), (x0, y0, z1)],
        "up": [(x0, y1, z0), (x1, y1, z0), (x0, y1, z1), (x1, y1, z1)],
        "down": [(x0, y0, z1), (x1, y0, z1), (x0, y0, z0), (x1, y0, z0)],
    }[f]


def collect_quads(model: Model, pose: dict[str, tuple] | None = None, show: dict[str, bool] | None = None):
    """Alle sichtbaren Flächen als (Ecken[4] in Weltkoordinaten, UV-Ecken, Textur, Normale)."""
    pose = pose or {}
    show = show or {}
    quads = []

    def walk(node, parent_m):
        if isinstance(node, str):
            e = model.elements[node]
            visible = show.get(e["name"], e.get("visibility", True))
            if not visible or e.get("type", "cube") != "cube":
                return
            inf = e.get("inflate", 0)
            a = [v - inf for v in e["from"]]
            b = [v + inf for v in e["to"]]
            m = parent_m @ affine(e.get("origin", [0, 0, 0]), e.get("rotation", [0, 0, 0]))
            for f, face in e["faces"].items():
                if face.get("texture") is None:
                    continue
                if face.get("rotation", 0):
                    raise ValueError("Flächen-Drehung wird von der Vorschau nicht unterstützt")
                corners = np.array([list(c) + [1.0] for c in face_corners(f, a, b)])
                world = (m @ corners.T).T[:, :3]
                u1, v1, u2, v2 = face["uv"]
                uvs = [(u1, v1), (u2, v1), (u1, v2), (u2, v2)]
                quads.append((world, uvs, face["texture"], f, e["name"]))
            return
        if not show.get(node["name"], node.get("visibility", True)):
            return
        rot = list(node.get("rotation", [0, 0, 0]))
        extra = pose.get(node["name"])
        if extra:
            rot = [r + d for r, d in zip(rot, extra)]
        m = parent_m @ affine(node["origin"], rot)
        for child in node["children"]:
            walk(child, m)

    for node in model.outliner:
        walk(node, np.eye(4))
    return quads


# ---------------------------------------------------------------------------
# Rastern

def render(model: Model, yaw: float = 0, pitch: float = 0, ppu: int = 12, pose=None, show=None,
           size: tuple[int, int] | None = None, center=(0, 17), bg=(0, 0, 0, 0)) -> Image.Image:
    """
    yaw = 0: Kamera vor der Figur (schaut nach +Z). yaw = 90: Kamera rechts von der Figur.
    ppu = Bildpixel pro Minecraft-Pixel.
    """
    a, p = math.radians(yaw), math.radians(pitch)
    fwd = np.array([-math.sin(a) * math.cos(p), -math.sin(p), math.cos(a) * math.cos(p)])
    up0 = np.array([0.0, 1.0, 0.0])
    right = np.cross(fwd, up0)
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    W, H = size or (ppu * 26, ppu * 44)
    color = np.zeros((H, W, 4), dtype=np.uint8)
    color[:] = bg
    depth = np.full((H, W), np.inf)

    cx, cy = center
    for world, uvs, tex_i, fname, _name in collect_quads(model, pose, show):
        tex, kx, ky = model.textures[tex_i]
        sx = (world @ right - cx * 0) * ppu + W / 2 - (np.array([cx, cy, 0]) @ right) * ppu
        sy = H / 2 - (world @ up) * ppu + (np.array([cx, cy, 0]) @ up) * ppu
        sz = world @ fwd
        # Normale (für Licht und Rückseiten)
        n = np.cross(world[1] - world[0], world[2] - world[0])
        nl = np.linalg.norm(n)
        if nl < 1e-9:
            continue
        n = n / nl
        # nach außen zeigend? Ecken-Reihenfolge TL,TR,BL von außen gesehen -> cross zeigt nach innen
        n = -n
        # Minecraft-ähnliche Flächenhelligkeit: oben hell, unten dunkel, Seiten dazwischen
        light = abs(n[0]) * 0.72 + abs(n[2]) * 0.86 + (n[1] if n[1] > 0 else -n[1] * 0.55)
        u = np.array([c[0] for c in uvs]) * kx
        v = np.array([c[1] for c in uvs]) * ky
        umin, umax = min(u[0], u[1]), max(u[0], u[1])
        vmin, vmax = min(v[0], v[2]), max(v[0], v[2])
        for tri in ((0, 1, 2), (1, 3, 2)):
            raster(color, depth, sx[list(tri)], sy[list(tri)], sz[list(tri)], u[list(tri)], v[list(tri)], tex,
                   (umin, umax, vmin, vmax), light)
    return Image.fromarray(color, "RGBA")


def raster(color, depth, xs, ys, zs, us, vs, tex, bounds, light):
    H, W = depth.shape
    x0, x1 = int(max(0, math.floor(xs.min()))), int(min(W - 1, math.ceil(xs.max())))
    y0, y1 = int(max(0, math.floor(ys.min()))), int(min(H - 1, math.ceil(ys.max())))
    if x0 > x1 or y0 > y1:
        return
    area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0])
    if abs(area) < 1e-9:
        return
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    w0 = ((xs[1] - gx) * (ys[2] - gy) - (xs[2] - gx) * (ys[1] - gy)) / area
    w1 = ((xs[2] - gx) * (ys[0] - gy) - (xs[0] - gx) * (ys[2] - gy)) / area
    w2 = 1 - w0 - w1
    eps = -1e-6
    inside = (w0 >= eps) & (w1 >= eps) & (w2 >= eps)
    if not inside.any():
        return
    z = w0 * zs[0] + w1 * zs[1] + w2 * zs[2]
    u = w0 * us[0] + w1 * us[1] + w2 * us[2]
    v = w0 * vs[0] + w1 * vs[1] + w2 * vs[2]
    umin, umax, vmin, vmax = bounds
    ui = np.clip(np.floor(u), math.floor(umin), math.ceil(umax) - 1).astype(int)
    vi = np.clip(np.floor(v), math.floor(vmin), math.ceil(vmax) - 1).astype(int)
    ui = np.clip(ui, 0, tex.shape[1] - 1)
    vi = np.clip(vi, 0, tex.shape[0] - 1)
    texel = tex[vi, ui]
    sub_depth = depth[y0:y1 + 1, x0:x1 + 1]
    mask = inside & (texel[..., 3] >= 128) & (z < sub_depth - 1e-4)
    if not mask.any():
        return
    sub_depth[mask] = z[mask]
    rgb = (texel[..., :3].astype(float) * light).clip(0, 255).astype(np.uint8)
    sub = color[y0:y1 + 1, x0:x1 + 1]
    sub[mask, :3] = rgb[mask]
    sub[mask, 3] = 255


# ---------------------------------------------------------------------------
# Bögen zusammenstellen

FONT_FILES = ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/segoeui.ttf",
              "/System/Library/Fonts/Supplemental/Arial.ttf", "DejaVuSans.ttf", "arial.ttf")


def font(size: int):
    """Schrift mit Umlauten, sonst Pillow-Standardschrift."""
    for f in FONT_FILES:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def sheet(images: list[tuple[str, Image.Image]], cols: int, title: str, bg=(46, 50, 62, 255)) -> Image.Image:
    cw = max(im.width for _, im in images)
    ch = max(im.height for _, im in images)
    rows = math.ceil(len(images) / cols)
    out = Image.new("RGBA", (cols * cw + (cols + 1) * 10, rows * (ch + 30) + 50), bg)
    d = ImageDraw.Draw(out)
    d.text((12, 10), title, fill=(255, 255, 255, 255), font=font(22))
    for i, (label, im) in enumerate(images):
        x = 10 + (i % cols) * (cw + 10)
        y = 50 + (i // cols) * (ch + 30)
        d.rectangle([x, y, x + cw - 1, y + ch - 1], fill=(64, 70, 86, 255))
        out.alpha_composite(im, (x + (cw - im.width) // 2, y))
        d.text((x + 4, y + ch + 4), label, fill=(230, 230, 240, 255), font=font(16))
    return out


WALK = {"RightLeg": (28, 0, 0), "LeftLeg": (-28, 0, 0), "RightArm": (-24, 0, 0), "LeftArm": (24, 0, 0),
        "Rock_Vorne": (14, 0, 0), "Rock_Hinten": (-14, 0, 0), "Schwanz": (-20, 8, 0), "Schwanz_Mitte": (-6, 10, 0),
        "Haare_Hinten": (-12, 0, 0), "Ohr_R": (12, 0, 0), "Ohr_L": (12, 0, 0), "Schal_Ende": (-15, 0, 0)}
SIT = {"RightLeg": (80, -10, 0), "LeftLeg": (80, 10, 0), "Rock_Vorne": (62, 0, 0), "Rock_R": (0, 0, 20),
       "Rock_L": (0, 0, -20), "Schwanz": (-25, 20, 0), "RightArm": (36, 0, 0), "LeftArm": (36, 0, 0)}
WAVE = {"RightArm": (0, 0, 150), "Head": (-10, 15, 0), "Schwanz": (0, 25, 0), "Schwanz_Mitte": (0, 15, 0),
        "Schwanz_Spitze": (0, 10, 0)}


def face_show(emo: str, closed: bool, model: Model) -> dict[str, bool]:
    show = {}
    for e in model.elements.values():
        if e["name"].startswith("Gesicht_"):
            show[e["name"]] = e["name"] == f"Gesicht_{emo}_{'zu' if closed else 'offen'}"
    return show


def main() -> None:
    model = Model(ROOT / "model.bbmodel")
    out_dir = ROOT / "doku"
    out_dir.mkdir(exist_ok=True)

    views = [
        ("vorne", render(model, 0, 0)),
        ("hinten", render(model, 180, 0)),
        ("rechte Seite", render(model, 90, 0)),
        ("linke Seite", render(model, -90, 0)),
        ("schräg vorne", render(model, 35, 15)),
        ("schräg hinten", render(model, 145, 15)),
    ]
    sheet(views, 6, "Polarfuchs – Ansichten (Ruhepose, Blockbench-Koordinaten)").save(out_dir / "ansichten.png")

    poses = [
        ("Laufen (vorne schräg)", render(model, 30, 10, pose=WALK)),
        ("Laufen (Seite)", render(model, 90, 0, pose=WALK)),
        ("Sitzen (Seite)", render(model, 90, 0, pose=SIT)),
        ("Winken", render(model, 20, 5, pose=WAVE, show=face_show("froehlich", False, model))),
        ("von oben", render(model, 20, 60)),
        ("von unten", render(model, 20, -40)),
    ]
    sheet(poses, 6, "Posen (Drehung zusätzlich zur Modell-Drehung)").save(out_dir / "posen.png")

    import importlib
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    A = importlib.import_module("avatar_def")
    faces = []
    for closed in (False, True):
        for emo in A.EMOTIONS:
            im = render(model, 0, 0, ppu=26, size=(26 * 14, 26 * 15), center=(0, 29), show=face_show(emo, closed, model))
            faces.append((f"{A.EMOTION_TITLES[emo]}{' (zu)' if closed else ''}", im))
    sheet(faces, 5, "Gesichter (oben offen, unten zu) – im Spiel per Action Wheel").save(out_dir / "gesichter.png")
    for f in ("ansichten.png", "posen.png", "gesichter.png"):
        print(out_dir / f)


if __name__ == "__main__":
    main()
