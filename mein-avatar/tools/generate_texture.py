#!/usr/bin/env python3
"""
Erzeugt die Texturen des Polarfuchs-Avatars prozedural:

  skin.png    256x256 RGBA – Körper im Standard-Skin-Layout (64x64) x 4
  extras.png  256x256 RGBA – Ohren, Schwanz, Haare, Rock, Schal, Schleife, Gesichter
  doku/uv_layout.png       – beschriftete Übersicht beider Layouts

Aufruf (im Ordner mein-avatar):  python3 tools/generate_texture.py

Regeln: scharfe Pixel, kein Anti-Aliasing, nur Farben aus der Palette unten.
Ein Minecraft-Pixel = 4x4 Texturpixel. Grundformen und Schatten liegen grob auf dem
4er-Raster, Details (Augen, Strähnen, Fell) nutzen einzelne Texturpixel.

Skin-Layout (UV-Einheiten, x4 = Texturpixel), wie bei jedem 64x64-Skin:
  Kopf          ( 0, 0)   Haarschicht ( 32, 0)
  Körper        (16,16)   Jacke       ( 16,32)
  rechter Arm   (40,16)   Ärmel R     ( 40,32)   (Slim, 3 breit)
  linker Arm    (32,48)   Ärmel L     ( 48,48)
  rechtes Bein  ( 0,16)   Hose R      (  0,32)
  linkes Bein   (16,48)   Hose L      (  0,48)
Jedes Teil als Netz:      [oben][unten]
                  [rechts][vorne][links][hinten]
Das Layout von extras.png ergibt sich aus tools/avatar_def.py (siehe doku/uv_layout.png).
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import avatar_def as A  # noqa: E402

# ===========================================================================
# PARAMETER – hier anpassen
# ===========================================================================

SEED = 828  # Zufallsstartwert für Strähnen und Fell (anderer Wert = andere Details)

# Farbrampen von hell nach dunkel
HAUT = ["#FFF2E8", "#FCE3D3", "#F3CBB4", "#E0AA92", "#BC8571"]
HAAR = ["#FFFFFF", "#E9F0FA", "#C8D5EB", "#9EB0D2", "#7386AE", "#4E5E85"]   # weiß-silber, leicht bläulich
FELL = ["#FFFFFF", "#F1F5FB", "#DCE4F0", "#BCC8DC", "#95A3BE"]              # Ohren und Schwanz
OHR_INNEN = ["#F4E3EA", "#E6CCD8", "#CFB0C0"]
MANTEL = ["#5B79B6", "#40598F", "#2D416E", "#203051", "#16213A"]            # Dunkelblau
PULLI = ["#F6F8FB", "#DFE4EC", "#BEC5D2", "#959DAE"]                         # Grau-Weiß
STRUMPF = ["#5E6372", "#454959", "#323542", "#24262F"]                       # Dunkelgrau
STIEFEL = ["#6D7486", "#525868", "#3B404D", "#2A2E38", "#1B1E25"]            # Grau
AKZENT = ["#DDF4FF", "#ADE0F8", "#80C7EC", "#559FCE", "#3A78A8"]             # Eisblau (Schal, Schleife, Säume)

AUGE = {  # eisblaue Augen
    "K": "#262840",  # Wimpern / Kontur
    "k": "#4C5272",  # weiche Kontur
    "W": "#FFFFFF",  # Augenweiß
    "w": "#D7E1F1",  # Augenweiß im Lidschatten
    "D": "#1F3D70",  # Iris dunkel
    "B": "#3B7CC6",  # Iris
    "L": "#71B9EE",  # Iris hell
    "C": "#BDE8FF",  # Iris sehr hell
    "H": "#FFFFFF",  # Glanzpunkt
}
BRAUE = HAAR[4]
MUND = {"M": "#A0525C", "I": "#6E2A36", "T": "#E5838E", "Z": "#FFFFFF"}
WANGE = ["#F8BDB6", "#F0A3A3"]

# Wangenröte je Ausdruck (0 = keine, 1 = leicht, 2 = kräftig)
WANGEN_STAERKE = {"neutral": 1, "froehlich": 2, "ueberrascht": 1, "wuetend": 0, "schlaefrig": 1}

# ===========================================================================

S = A.SCALE


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha


def ramp(colors: list[str]) -> list[tuple[int, int, int, int]]:
    return [rgba(c) for c in colors]


R_HAUT, R_HAAR, R_FELL, R_OHR = ramp(HAUT), ramp(HAAR), ramp(FELL), ramp(OHR_INNEN)
R_MANTEL, R_PULLI, R_STRUMPF, R_STIEFEL, R_AKZENT = ramp(MANTEL), ramp(PULLI), ramp(STRUMPF), ramp(STIEFEL), ramp(AKZENT)
C_AUGE = {k: rgba(v) for k, v in AUGE.items()}
C_MUND = {k: rgba(v) for k, v in MUND.items()}
C_WANGE = ramp(WANGE)
C_BRAUE = rgba(BRAUE)
CLEAR = (0, 0, 0, 0)


def pick(r: list, i: int):
    return r[max(0, min(len(r) - 1, i))]


# ---------------------------------------------------------------------------
# Zeichenflächen

class Face:
    """Eine rechteckige Fläche der Textur. Koordinaten lokal in Texturpixeln."""

    def __init__(self, img: Image.Image, rect_uv: tuple[float, float, float, float]):
        x0, y0, x1, y1 = rect_uv
        self.img = img
        self.px = img.load()
        self.ox, self.oy = int(x0 * S), int(y0 * S)
        self.w, self.h = int((x1 - x0) * S), int((y1 - y0) * S)

    def set(self, x: int, y: int, c) -> None:
        if c is not None and 0 <= x < self.w and 0 <= y < self.h:
            self.px[self.ox + x, self.oy + y] = c

    def get(self, x: int, y: int):
        return self.px[self.ox + x, self.oy + y]

    def fill(self, fn) -> None:
        """fn(x, y) -> Farbe oder None (None = unverändert lassen)."""
        for y in range(self.h):
            for x in range(self.w):
                self.set(x, y, fn(x, y))

    def clear(self) -> None:
        for y in range(self.h):
            for x in range(self.w):
                self.px[self.ox + x, self.oy + y] = CLEAR


def faces_of(img: Image.Image, cube: A.Cube) -> dict[str, Face]:
    rects = A.net_rects(cube.uv[0], cube.uv[1], cube.box_size)
    return {name: Face(img, r) for name, r in rects.items()}


SIDES = ("east", "north", "west", "south")  # Reihenfolge im Netz = einmal um den Würfel herum


def wrap_x(faces: dict[str, Face], side: str, x: int) -> int:
    """Lokale x-Koordinate einer Seitenfläche -> Position auf dem Umfang (für nahtlose Muster)."""
    off = 0
    for s in SIDES:
        if s == side:
            return off + x
        off += faces[s].w
    raise KeyError(side)


# ---------------------------------------------------------------------------
# Muster-Bausteine

class Strands:
    """Haarsträhnen: pro Spalte ein Helligkeitsversatz, Strähnen 2-5 px breit mit dunkler Fuge."""

    def __init__(self, rng: random.Random, width: int):
        self.off: list[int] = []
        self.edge: list[bool] = []
        self.hl: list[bool] = []
        self.tip: list[int] = []
        self.ring: list[int] = []
        while len(self.off) < width:
            w = rng.choice([3, 3, 4, 4, 5])
            o = rng.choice([0, 0, 0, 1, 1, -1])
            t = rng.choice([0, 1, 2, 3, 4])
            g = rng.choice([0, 1, 1, 2])
            for i in range(w):
                self.ring.append(g + (1 if i in (0, w - 1) else 0))   # Glanz als Zickzack
                self.off.append(o)
                self.edge.append(i == w - 1)
                self.hl.append(i == 1 and w >= 4)
                # Spitzen: Mitte der Strähne länger
                self.tip.append(t + (2 if 0 < i < w - 1 else 0))
        self.off, self.edge, self.hl, self.tip = self.off[:width], self.edge[:width], self.hl[:width], self.tip[:width]
        self.ring = self.ring[:width]

    def color(self, x: int, y: int, h: int, bias: int = 0, band: int | None = None, r=None) -> tuple:
        """Farbe an (x, y) einer Fläche der Höhe h; band = Zeile des Glanzrings (Anime-"Engelsring")."""
        r = r or R_HAAR
        idx = 1 + (y * 5) // (2 * max(1, h)) + self.off[x] + bias
        if self.edge[x]:
            idx += 2          # Fuge zwischen zwei Strähnen
        elif self.hl[x]:
            idx -= 1          # Lichtkante in der Strähne
        if band is not None:
            wave = band + self.ring[x]
            if wave <= y <= wave + 1:
                idx = 2 if self.edge[x] else 0
            elif y == wave + 2 and not self.edge[x]:
                idx = 1
            elif y == wave - 1 and not self.edge[x]:
                idx = min(idx, 1)
        return pick(r, max(0, min(idx, len(r) - 1)))


def fur(face: Face, rng: random.Random, r: list, along: str = "v", base: int = 1, edge_dark: bool = True,
        alpha_fn=None, density: float = 0.22, grad: int = 0) -> None:
    """Fell: helle Grundfläche, kurze Striche entlang der Wuchsrichtung, dunklere Ränder.
    grad > 0: nach unten um bis zu grad Stufen dunkler (Volumen)."""
    for y in range(face.h):
        for x in range(face.w):
            if alpha_fn and not alpha_fn(x, y):
                face.set(x, y, CLEAR)
                continue
            idx = base + (y * (grad + 1)) // face.h
            if edge_dark and (x == 0 or x == face.w - 1 or y == face.h - 1):
                idx += 1
            face.set(x, y, pick(r, idx))
    n = int(face.w * face.h * density / 3)
    for _ in range(n):
        x, y = rng.randrange(face.w), rng.randrange(face.h)
        length = rng.choice([2, 3, 3, 4])
        shade = base + (y * (grad + 1)) // face.h + rng.choice([1, 1, 2, -1])
        for i in range(length):
            xx, yy = (x, y + i) if along == "v" else (x + i, y)
            if 0 <= xx < face.w and 0 <= yy < face.h and face.get(xx, yy)[3]:
                face.set(xx, yy, pick(r, shade))


def jag_mask(rng: random.Random, width: int, base: int, spread: int) -> list[int]:
    """Zackige Kante: pro Spalte eine Länge, in Spitzen gruppiert (für Haar- und Fellränder)."""
    out = []
    while len(out) < width:
        w = rng.choice([3, 4, 5])
        L = base + rng.randrange(spread + 1)
        for i in range(w):
            out.append(L - abs(i - (w - 1) / 2) * 1.5)
    return [int(v) for v in out[:width]]


# ---------------------------------------------------------------------------
# Gesicht

EYES: dict[str, list[str]] = {
    # 8 x 9, Spalte 0 = äußerer Augenwinkel (rechtes Auge; linkes wird gespiegelt)
    "open": [
        "KKKKKKK.",
        ".KKKKKKK",
        ".wDDDDDw",
        ".WDHHDDW",
        ".WBHHDBW",
        ".WBBBBBW",
        ".WBLLLBW",
        ".WLCHCLW",
        "..kkkkk.",
    ],
    "closed": [
        "........",
        "........",
        "........",
        "........",
        "........",
        "KK.....K",
        ".KKKKKK.",
        "..k..k..",
        "........",
    ],
    "happy": [
        "........",
        "........",
        "........",
        "...KK...",
        "..KKKK..",
        ".KK..KK.",
        "KK....KK",
        "K......K",
        "........",
    ],
    "surprised": [
        "........",
        ".KKKKKK.",
        "KkwwwwkK",
        ".WWDDWW.",
        ".WDHDDW.",
        ".WDDBDW.",
        ".WBLLBW.",
        ".WWBBWW.",
        "..kkkk..",
    ],
    "angry": [
        "K.......",
        ".KKK....",
        ".wDKKKKK",
        ".WDHHKKK",
        ".WBHHDBK",
        ".WBBBBBW",
        ".WBLLLBW",
        ".WLCHCLW",
        "..kkkkk.",
    ],
    "sleepy": [
        "........",
        "........",
        "........",
        "........",
        "KKKKKKKK",
        ".wDDDDDw",
        ".WBLLLBW",
        ".WLCHCLW",
        "..kkkkk.",
    ],
}

BROWS: dict[str, list[str]] = {  # 7 x 3, Spalte 0 = außen
    "neutral": [".......", ".RRRRR.", "R......"],
    "froehlich": [".RRRRR.", "R......", "......."],
    "ueberrascht": ["..RRR..", ".R...R.", "R......"],
    "wuetend": ["RR.....", "..RRR..", ".....RR"],
    "schlaefrig": [".......", ".......", "RRRRRR."],
}

MOUTHS: dict[str, list[str]] = {  # 8 x 4
    "neutral": ["M..MM..M", ".MM..MM.", "........", "........"],
    "froehlich": [".MMMMMM.", ".MIIIIM.", "..MTTM..", "...MM..."],
    "ueberrascht": ["...MM...", "..MIIM..", "..MIIM..", "...MM..."],
    "wuetend": ["........", "..MMMM..", ".MZ..M..", ".M....M."],
    "schlaefrig": ["........", "...MM...", "..M..M..", "...MM..."],
}

EYE_STATE = {
    ("neutral", False): "open", ("froehlich", False): "happy", ("ueberrascht", False): "surprised",
    ("wuetend", False): "angry", ("schlaefrig", False): "sleepy",
}

# Lage im Gesichtsfeld (32 x 20, Zeile 0 = Kopfzeile 12 in Texturpixeln)
EYE_ROW, EYE_COL_R, EYE_COL_L = 3, 5, 19
BROW_ROW, BROW_COL_R, BROW_COL_L = 0, 6, 19
MOUTH_ROW, MOUTH_COL = 15, 12
BLUSH_ROW = 12


def stamp(face: Face, ox: int, oy: int, rows: list[str], colors: dict, mirror: bool = False) -> None:
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            xx = ox + (len(row) - 1 - x if mirror else x)
            face.set(xx, oy + y, colors[ch])


def paint_features(face: Face, emo: str, closed: bool, oy: int = 0) -> None:
    """Brauen, Augen, Nase, Wangen, Mund in ein 32 x 20-Feld (oy = Versatz nach unten)."""
    eye = "closed" if closed and emo != "froehlich" else EYE_STATE[(emo, False)]
    stamp(face, EYE_COL_R, oy + EYE_ROW, EYES[eye], C_AUGE)
    stamp(face, EYE_COL_L, oy + EYE_ROW, EYES[eye], C_AUGE, mirror=True)
    brow = {"R": C_BRAUE}
    stamp(face, BROW_COL_R, oy + BROW_ROW, BROWS[emo], brow)
    stamp(face, BROW_COL_L, oy + BROW_ROW, BROWS[emo], brow, mirror=True)
    # Nase: ein Schattenpixel
    face.set(15, oy + 13, R_HAUT[3])
    face.set(16, oy + 13, R_HAUT[2])
    # Wangen: schräge Striche
    level = WANGEN_STAERKE[emo]
    if level:
        for cx in (6, 25):
            for i in range(-1, 2):
                for dy in range(2):
                    x = cx + i * 2 - dy
                    face.set(x, oy + BLUSH_ROW + dy, C_WANGE[1] if level == 2 and dy == 0 else C_WANGE[0])
            if level == 2:
                face.set(cx - 3, oy + BLUSH_ROW + 1, C_WANGE[0])
                face.set(cx + 3, oy + BLUSH_ROW, C_WANGE[0])
    stamp(face, MOUTH_COL, oy + MOUTH_ROW, MOUTHS[emo], C_MUND)


def bangs_edge(x: int) -> int:
    """Unterkante des Ponys auf der Kopf-Vorderseite (Zeile, bis zu der Haare reichen)."""
    tips = [(4, 13), (9, 15), (15, 11), (20, 14), (25, 12), (28, 14)]
    best = 9
    for c, L in tips:
        best = max(best, int(L - abs(x - c) * 1.6))
    side = min(x, 31 - x)
    if side <= 2:   # seitliche Haare, die das Gesicht rahmen
        best = max(best, 27 - side)
    return best


def head_front_base(face: Face, rng: random.Random) -> None:
    """Kopf vorne ohne Gesichtszüge: Haaransatz/Pony, Haut mit Schatten."""
    st = Strands(rng, face.w)
    for y in range(face.h):
        for x in range(face.w):
            e = bangs_edge(x)
            if y <= e:
                face.set(x, y, st.color(x, y, 16, bias=0, band=3))
            else:
                d = y - e
                idx = 1
                if d <= 1:
                    idx = 3 if d == 0 else 2   # Schatten unter dem Pony
                if x in (0, 31) or (x in (1, 30) and y > 26):
                    idx = max(idx, 2)
                if y >= 30:
                    idx = max(idx, 2)   # Kinnschatten
                face.set(x, y, R_HAUT[idx])


# ---------------------------------------------------------------------------
# Körperteile in skin.png

def paint_head(img: Image.Image, root: A.Group, rng: random.Random) -> None:
    cube = A.find_cube(root, "Kopf")
    f = faces_of(img, cube)
    # eigener, fester Zufall: die Gesichtsflächen in extras.png bauen dieselbe Grundlage nach
    head_front_base(f["north"], random.Random(SEED + 1))
    paint_features(f["north"], "neutral", False, oy=A.FACE_ROW0 * S)

    # Seiten: Haar, vorne unten Wange/Kiefer
    for side in ("east", "west"):
        face = f[side]
        st = Strands(rng, face.w)
        for y in range(face.h):
            for x in range(face.w):
                front = x if side == "west" else face.w - 1 - x   # 0 = vordere Kante
                hair_limit = 13 + front // 2 + st.tip[x] // 2        # weiter hinten reicht das Haar tiefer
                if front >= 14 or y <= hair_limit:
                    face.set(x, y, st.color(x, y, face.h, bias=0, band=4))
                else:
                    idx = 2 if front <= 1 or y >= 29 else 1
                    face.set(x, y, R_HAUT[idx])
    # Hinten: nur Haar
    st = Strands(rng, 32)
    f["south"].fill(lambda x, y: st.color(x, y, 32, bias=1, band=4))
    # Oben: Strähnen von vorne nach hinten, Scheitel in der Mitte
    st = Strands(rng, 32)
    f["up"].fill(lambda x, y: R_HAAR[3] if x in (15, 16) and y > 18 else st.color(x, 31 - y, 40, bias=-1))
    # Unten: hinten Haar, vorne Hals/Kinn im Schatten (unten im Bild = vorne)
    f["down"].fill(lambda x, y: R_HAAR[4] if y < 14 else R_HAUT[3])


def paint_hair_layer(img: Image.Image, root: A.Group, rng: random.Random) -> None:
    cube = A.find_cube(root, "Kopf_Haarschicht")
    f = faces_of(img, cube)
    for face in f.values():
        face.clear()
    # Vorne: nur seitliche Haare und oben ein Rand (der Pony-Würfel liegt davor)
    face = f["north"]
    st = Strands(rng, 32)
    for y in range(32):
        for x in range(32):
            side = min(x, 31 - x)
            if (side <= 1 and y <= 27 - st.tip[x]) or y <= 5 + st.tip[x] // 2:
                face.set(x, y, st.color(x, y, 32, band=2))
    # Seiten: Haarvolumen, zackig auslaufend, vorne frei für Wange
    for side_name in ("east", "west"):
        face = f[side_name]
        st = Strands(rng, 32)
        for y in range(32):
            for x in range(32):
                front = x if side_name == "west" else 31 - x
                limit = 15 + front // 2 + st.tip[x]
                if front >= 14:
                    limit = 31
                if y <= limit:
                    face.set(x, y, st.color(x, y, 32, band=5))
    # Hinten: komplett Haar, unten Spitzen
    face = f["south"]
    st = Strands(rng, 32)
    for y in range(32):
        for x in range(32):
            if y <= 27 + st.tip[x]:
                face.set(x, y, st.color(x, y, 32, bias=1, band=5))
    # Oben: lockeres Volumen
    face = f["up"]
    st = Strands(rng, 32)
    face.fill(lambda x, y: st.color(x, 31 - y, 40, bias=-1) if (x + y * 3) % 7 else None)
    # Unten: hinten etwas Haar
    face = f["down"]
    face.fill(lambda x, y: R_HAAR[4] if y < 10 else None)


def coat_color(x: int, y: int, h: int, folds: set[int], base: int = 1) -> tuple:
    idx = base + (y * 2) // max(1, h)
    if x in folds:
        idx += 1
    elif x - 1 in folds:
        idx -= 1
    return pick(R_MANTEL, idx)


def knit_color(x: int, y: int, base: int = 0, r=None) -> tuple:
    r = r or R_PULLI
    return pick(r, base + (1 if x % 4 == 3 else 0) + (1 if (y // 2 + x // 4) % 6 == 0 else 0))


def fluffy(face: Face, rng: random.Random, y0: int, y1: int, r=None, jag_top: bool = True, jag_bottom: bool = True,
           x_off: int = 0) -> None:
    """Weißer Fellsaum zwischen y0 und y1 mit zackigen Büscheln oben und unten."""
    r = r or R_FELL
    top = jag_mask(rng, face.w, 0, 2)
    bot = jag_mask(rng, face.w, 1, 3)
    for x in range(face.w):
        t = y0 - (max(0, top[x]) if jag_top else 0)
        b = y1 + (max(0, bot[x]) if jag_bottom else 0)
        for y in range(max(0, t), min(face.h, b + 1)):
            idx = 0 if y < t + 2 else 1
            if y >= b - 1:
                idx = 2
            if rng.random() < 0.18:
                idx += 1
            if (x + x_off) % 6 == 5 and t + 1 < y < b - 1:
                idx = 2        # Büschel-Fuge
            face.set(x, y, pick(r, idx))


def paint_body(img: Image.Image, root: A.Group, rng: random.Random) -> None:
    # Innen: Pulli, Gürtel
    f = faces_of(img, A.find_cube(root, "Koerper"))
    for side in SIDES:
        face = f[side]
        for y in range(face.h):
            for x in range(face.w):
                wx = wrap_x(f, side, x)
                c = knit_color(wx, y, base=0 if side == "north" else 1)
                if 40 <= y <= 43:  # Gürtel
                    c = pick(R_MANTEL, 3 if y in (40, 43) else 2)
                    if side == "north" and 13 <= x <= 18:
                        c = pick(R_AKZENT, 1 if y in (41, 42) and 14 <= x <= 17 else 3)
                if y >= 44:
                    c = pick(R_MANTEL, 2)   # Rockbund (wird vom Rock verdeckt)
                face.set(x, y, c)
    f["up"].fill(lambda x, y: knit_color(x, y, 1))
    f["down"].fill(lambda x, y: R_MANTEL[3])

    # Außen: Mantel, vorne offen mit Fellkante
    f = faces_of(img, A.find_cube(root, "Jacke"))
    for face in f.values():
        face.clear()
    folds = {3, 9, 21, 27, 37, 45, 52, 60, 70, 76, 86, 90}
    for side in SIDES:
        face = f[side]
        for y in range(face.h):
            for x in range(face.w):
                wx = wrap_x(f, side, x)
                if side == "north" and 10 <= x <= 21 and y >= 6:
                    continue  # Öffnung vorne
                if y > 41:
                    continue  # Saum kommt als Fell darüber
                face.set(x, y, coat_color(wx, y, face.h, folds, base=1 if side in ("north", "south") else 2))
        fluffy(face, rng, 39, 43)
    # Fellkanten an der Öffnung
    front = f["north"]
    for y in range(4, 44):
        for x in list(range(7, 10)) + list(range(22, 25)):
            idx = 0 if x in (8, 23) else 1
            if (y + x) % 4 == 0:
                idx += 1
            front.set(x, y, pick(R_FELL, idx))
    for x in range(7, 25):   # Kragen (unter dem Schal)
        for y in range(0, 4):
            front.set(x, y, pick(R_FELL, 1 + (x + y) % 2))
    # Taschen
    for x0 in (2, 25):
        for x in range(x0, x0 + 5):
            front.set(x, 30, pick(R_MANTEL, 4))
            front.set(x, 31, pick(R_MANTEL, 0))
    f["up"].fill(lambda x, y: coat_color(x, y, 16, folds, 0) if not (8 <= x <= 23 and 3 <= y <= 12) else None)


def paint_arm(img: Image.Image, root: A.Group, rng: random.Random, inner: str, outer: str) -> None:
    f = faces_of(img, A.find_cube(root, inner))
    for side in SIDES:
        face = f[side]
        for y in range(face.h):
            for x in range(face.w):
                wx = wrap_x(f, side, x)
                if y >= 40:   # Hand
                    idx = 1 if side == "north" else 2
                    if y == 47 or (side in ("north", "south") and y >= 45 and x % 3 == 2):
                        idx = 3      # Fingerlinien
                    face.set(x, y, R_HAUT[idx])
                else:
                    face.set(x, y, knit_color(wx, y, 1))
    f["up"].fill(lambda x, y: knit_color(x, y, 1))
    f["down"].fill(lambda x, y: R_HAUT[2] if (x + y) % 5 else R_HAUT[3])

    f = faces_of(img, A.find_cube(root, outer))
    for face in f.values():
        face.clear()
    folds = {2, 7, 15, 22, 30, 36, 43, 51}
    for side in SIDES:
        face = f[side]
        for y in range(36):
            for x in range(face.w):
                wx = wrap_x(f, side, x)
                c = coat_color(wx, y, 48, folds, base=1 if side == "north" else 2)
                # Ellbogenfalten
                if 18 <= y <= 22 and (x + y) % 6 == 0:
                    c = pick(R_MANTEL, 3)
                face.set(x, y, c)
        fluffy(face, rng, 34, 38)
    f["up"].fill(lambda x, y: coat_color(x, y, 16, folds, 0))


def paint_leg(img: Image.Image, root: A.Group, rng: random.Random, inner: str, outer: str) -> None:
    f = faces_of(img, A.find_cube(root, inner))
    for side in SIDES:
        face = f[side]
        for y in range(face.h):
            for x in range(face.w):
                wx = wrap_x(f, side, x)
                if y < 18:   # Oberschenkel (unter dem Rock), Haut
                    idx = 1 if side == "north" else 2
                    if y < 6:
                        idx += 1   # Schatten unter dem Rock
                    face.set(x, y, R_HAUT[idx])
                elif y < 22:  # Strumpfband eisblau
                    face.set(x, y, pick(R_AKZENT, 2 if y in (18, 21) else 1))
                elif y < 33:  # Strumpf
                    idx = (1 if side == "north" else 2) + (1 if wx % 8 == 7 else 0)
                    if y == 22:
                        idx = 3
                    face.set(x, y, pick(R_STRUMPF, idx))
                else:         # Stiefel
                    idx = 1 if side == "north" else 2
                    if y >= 44:
                        idx = 4 if y >= 46 else 3   # Sohle
                    elif side == "north" and y >= 40 and 4 <= x <= 11:
                        idx = 0 if y == 40 else 1   # Spitze mit Glanz
                    if wx % 16 == 15 and y < 44:
                        idx += 1
                    face.set(x, y, pick(R_STIEFEL, idx))
    f["up"].fill(lambda x, y: R_HAUT[2])
    f["down"].fill(lambda x, y: R_STIEFEL[4] if (x + y) % 4 else R_STIEFEL[3])

    f = faces_of(img, A.find_cube(root, outer))
    for face in f.values():
        face.clear()
    for side in SIDES:
        fluffy(f[side], rng, 29, 34, x_off=wrap_x(f, side, 0))


# ---------------------------------------------------------------------------
# Extras in extras.png

def paint_ear(img: Image.Image, root: A.Group, rng: random.Random, side: str) -> None:
    base = faces_of(img, A.find_cube(root, f"Ohr_{side}_Basis"))
    tip = faces_of(img, A.find_cube(root, f"Ohr_{side}_Spitze"))

    # Basis 3x2x1: vorne Innenohr mit Fellrand
    for name, face in base.items():
        fur(face, rng, R_FELL, "v", base=1 if name != "south" else 2)
    front = base["north"]
    for y in range(front.h):
        for x in range(2, front.w - 2):
            idx = 0 if y < 3 else 1
            if x in (2, front.w - 3):
                idx = 2
            front.set(x, y, R_OHR[idx])
    for x in range(2, front.w - 2, 3):   # Fellbüschel im Innenohr
        front.set(x, front.h - 1, R_FELL[0])
        front.set(x, front.h - 2, R_FELL[1])

    # Spitze 2x3x1: spitz zulaufend (Alpha), vorne Innenohr
    def silhouette(face: Face):
        def inside(x: int, y: int) -> bool:
            half = (face.w / 2) * min(1.0, (y + 2) / (face.h * 0.85))
            return abs(x + 0.5 - face.w / 2) <= half
        return inside

    for name, face in tip.items():
        if name in ("north", "south"):
            fur(face, rng, R_FELL, "v", base=1 if name == "north" else 2, alpha_fn=silhouette(face))
        elif name in ("east", "west"):
            fur(face, rng, R_FELL, "v", base=2, alpha_fn=lambda x, y, h=face.h: y >= h * 0.55)
        elif name == "up":
            face.clear()
        else:
            fur(face, rng, R_FELL, "v", base=2)
    front = tip["north"]
    ins = silhouette(front)
    for y in range(front.h):
        for x in range(front.w):
            if ins(x, y) and ins(x - 2, y) and ins(x + 2, y) and y >= 3:
                front.set(x, y, R_OHR[0 if y < front.h - 3 else 1])
    for x in range(front.w):   # leicht dunkle Spitze (Polarfuchs: kaum)
        for y in range(3):
            if ins(x, y):
                front.set(x, y, R_FELL[2 + (y == 0)])


def bang_tips(rng: random.Random, width: int, height: int) -> list[int]:
    """Spitze Pony-Strähnen: pro Spalte die unterste Zeile mit Haar."""
    out = [0] * width
    x = 0
    while x < width:
        w = rng.choice([4, 5, 6, 7])
        L = height - 1 - rng.choice([0, 0, 1, 2, 3])
        for i in range(w):
            if x + i < width:
                out[x + i] = max(out[x + i], int(L - abs(i - (w - 1) / 2) * 1.4))
        x += w - 1
    return out


def paint_pony(img: Image.Image, root: A.Group, rng: random.Random) -> None:
    f = faces_of(img, A.find_cube(root, "Pony_Haare"))
    front = f["north"]
    st = Strands(rng, front.w)
    tips = bang_tips(rng, front.w, front.h)
    front.fill(lambda x, y: st.color(x, y, front.h + 4, band=2) if y <= tips[x] else CLEAR)
    for side in ("east", "west"):
        face = f[side]
        st2 = Strands(rng, face.w)
        face.fill(lambda x, y: st2.color(x, y, face.h + 4, band=2) if y <= face.h - 1 - (x % 2) * 2 else CLEAR)
    st3 = Strands(rng, 32)
    f["up"].fill(lambda x, y: st3.color(x, 2, 12, bias=-1))
    f["south"].fill(lambda x, y: R_HAAR[4])
    f["down"].fill(lambda x, y: R_HAAR[3] if tips[min(x, len(tips) - 1)] >= front.h - 2 else CLEAR)


def paint_lock(img: Image.Image, root: A.Group, rng: random.Random, name: str) -> None:
    f = faces_of(img, A.find_cube(root, name))
    for fname, face in f.items():
        st = Strands(rng, face.w)
        h = face.h

        def color(x: int, y: int, face=face, st=st, h=h):
            if fname in ("north", "south", "east", "west") and h > 8:
                # nach unten spitz zulaufend
                remain = h - 1 - y
                if remain < 6 and abs(x + 0.5 - face.w / 2) > remain * 0.4 + 0.2:
                    return CLEAR
            return st.color(x, y, h, bias=0 if fname == "north" else 1, band=6)
        face.fill(color)


def paint_back_hair(img: Image.Image, root: A.Group, rng: random.Random) -> None:
    f = faces_of(img, A.find_cube(root, "Haare_Hinten_Haare"))
    back = f["south"]
    st = Strands(rng, back.w)
    tips = bang_tips(rng, back.w, back.h)
    back.fill(lambda x, y: st.color(x, y, back.h, bias=1, band=5) if y <= tips[x] else CLEAR)
    front = f["north"]
    front.fill(lambda x, y: R_HAAR[4] if y <= tips[back.w - 1 - x] else CLEAR)
    for side in ("east", "west"):
        face = f[side]
        st2 = Strands(rng, face.w)
        face.fill(lambda x, y, face=face, st2=st2: st2.color(x, y, face.h, bias=1, band=5) if y < face.h - 2 - x % 3 else CLEAR)
    f["up"].fill(lambda x, y: R_HAAR[2])
    f["down"].fill(lambda x, y: CLEAR)


def paint_bow(img: Image.Image, root: A.Group, rng: random.Random) -> None:
    for name in ("Schleife_Knoten", "Schleife_Vorne", "Schleife_Hinten"):
        f = faces_of(img, A.find_cube(root, name))
        for fname, face in f.items():
            knot = name.endswith("Knoten")

            def color(x: int, y: int, face=face, knot=knot):
                if knot:
                    return pick(R_AKZENT, 3 if (x in (0, face.w - 1) or y in (0, face.h - 1)) else 2)
                idx = 1
                if x == 0 or y == 0 or x == face.w - 1 or y == face.h - 1:
                    idx = 3
                elif (x + y) % 5 == 0:
                    idx = 2      # Stofffalten
                elif y == 1:
                    idx = 0
                return pick(R_AKZENT, idx)
            face.fill(color)


def paint_scarf(img: Image.Image, root: A.Group, rng: random.Random) -> None:
    def scarf_color(x: int, y: int, h: int):
        idx = 1 + (1 if x % 4 == 3 else 0)        # Strickrippen
        if (y + (x // 4)) % 8 in (0,):
            idx += 1
        if h > 10 and y in (h // 2 - 1, h // 2):
            return pick(R_PULLI, 0)               # weißer Streifen
        return pick(R_AKZENT, idx)

    f = faces_of(img, A.find_cube(root, "Schal_Ring"))
    for fname, face in f.items():
        face.fill(lambda x, y, face=face: scarf_color(x, y, face.h) if fname not in ("up", "down")
                  else pick(R_AKZENT, 2 if (x + y) % 3 else 3))
    f = faces_of(img, A.find_cube(root, "Schal_Ende_Stoff"))
    for fname, face in f.items():
        h = face.h

        def color(x: int, y: int, face=face, h=h):
            if fname in ("north", "south", "east", "west") and y >= h - 3:
                return pick(R_AKZENT, 2) if x % 2 == 0 else CLEAR   # Fransen
            if fname in ("north", "south") and 8 <= y <= 11:
                return pick(R_PULLI, 0 if y in (9, 10) else 1)
            return scarf_color(x, y, 4)
        face.fill(color)


def paint_skirt(img: Image.Image, root: A.Group, rng: random.Random) -> None:
    for name in ("Rock_Vorne_Stoff", "Rock_Hinten_Stoff", "Rock_R_Stoff", "Rock_L_Stoff"):
        f = faces_of(img, A.find_cube(root, name))
        for fname, face in f.items():
            inner = fname in ("up", "down")

            def color(x: int, y: int, face=face, inner=inner):
                if inner:
                    return pick(R_MANTEL, 3)
                # Falten: alle 4 px ein Faltenpaar (hell/dunkel), unten Saum
                pleat = x % 4
                idx = 1 + (y * 2) // face.h + (1 if pleat == 3 else 0) - (1 if pleat == 0 else 0)
                if y >= face.h - 4:
                    return pick(R_AKZENT, 1 if y == face.h - 3 else 3)
                if y == face.h - 5:
                    return pick(R_PULLI, 0)
                return pick(R_MANTEL, idx)
            face.fill(color)


def paint_tail(img: Image.Image, root: A.Group, rng: random.Random) -> None:
    # Der Schwanz zeigt entlang +Z: Fellstriche laufen auf den Seiten waagerecht.
    for name, base in (("Schwanz_Basis_Fell", 2), ("Schwanz_Mitte_Fell", 1), ("Schwanz_Spitze_Fell", 0)):
        f = faces_of(img, A.find_cube(root, name))
        for fname, face in f.items():
            along = "v" if fname in ("up", "down") else "h"
            b = base + (1 if fname == "down" else 0)
            if fname == "south" and name == "Schwanz_Spitze_Fell":
                b = 0
            fur(face, rng, R_FELL, along, base=b, density=0.35, grad=2 if fname in ("east", "west") else 0)


# ---------------------------------------------------------------------------
# Gesichtsvarianten (extras.png)

def paint_face_variants(extras: Image.Image, root: A.Group) -> None:
    # Grundlage ohne Gesichtszüge aus dem Kopf-Vorderbild nachzeichnen
    tmp = Image.new("RGBA", (A.TEX_SIZE, A.TEX_SIZE), CLEAR)
    base_face = Face(tmp, (0, 0, 8, 8))
    head_front_base(base_face, random.Random(SEED + 1))
    row0 = A.FACE_ROW0 * S
    for emo in A.EMOTIONS:
        for closed in (False, True):
            cube = A.find_cube(root, f"Gesicht_{emo}_{'zu' if closed else 'offen'}")
            face = Face(extras, cube.faces["north"])
            face.fill(lambda x, y: base_face.get(x, row0 + y))
            paint_features(face, emo, closed)


# ---------------------------------------------------------------------------
# Übersicht

FACE_LABEL = {"up": "oben", "down": "unten", "east": "rechts", "north": "vorne", "west": "links", "south": "hinten"}


def draw_layout(skin: Image.Image, extras: Image.Image, root: A.Group, path: Path) -> None:
    zoom = 4
    big = A.TEX_SIZE * zoom
    out = Image.new("RGBA", (big * 2 + 60, big + 70), (30, 32, 40, 255))
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.load_default(size=14)
        title_font = ImageFont.load_default(size=22)
    except TypeError:  # sehr alte Pillow-Version
        font = title_font = ImageFont.load_default()
    for i, (img, title) in enumerate(((skin, "skin.png (Standard-Skin-Layout x4)"), (extras, "extras.png"))):
        ox, oy = 20 + i * (big + 20), 50
        draw.text((ox, 12), title, fill=(255, 255, 255, 255), font=title_font)
        # Schachbrett als Hintergrund für Transparenz
        for y in range(0, big, 32):
            for x in range(0, big, 32):
                c = (70, 72, 82, 255) if (x // 32 + y // 32) % 2 else (55, 57, 66, 255)
                draw.rectangle([ox + x, oy + y, ox + x + 31, oy + y + 31], fill=c)
        dim = img.resize((big, big), Image.NEAREST)
        out.alpha_composite(dim, (ox, oy))
        tex = "skin" if i == 0 else "extras"
        for cube in A.iter_cubes(root):
            if cube.tex != tex:
                continue
            if cube.uv is not None:
                rects = A.net_rects(cube.uv[0], cube.uv[1], cube.box_size)
            else:
                rects = {k: v for k, v in cube.faces.items()}
            for fname, (x0, y0, x1, y1) in rects.items():
                if x1 - x0 <= 0 or y1 - y0 <= 0:
                    continue
                k = S * zoom
                box = [ox + x0 * k, oy + y0 * k, ox + x1 * k - 1, oy + y1 * k - 1]
                draw.rectangle(box, outline=(255, 210, 60, 255))
                label = f"{cube.name}\n{FACE_LABEL[fname]}"
                if fname == "north" or cube.uv is None:
                    draw.multiline_text((box[0] + 3, box[1] + 2), label, fill=(255, 255, 255, 255), font=font,
                                        stroke_width=2, stroke_fill=(0, 0, 0, 255))
                elif (x1 - x0) * k >= 40:
                    draw.text((box[0] + 3, box[1] + 2), FACE_LABEL[fname], fill=(255, 240, 180, 255), font=font,
                              stroke_width=2, stroke_fill=(0, 0, 0, 255))
    out.convert("RGB").save(path, optimize=True)


# ---------------------------------------------------------------------------

def save_png(img: Image.Image, path: Path) -> None:
    """Verlustfrei klein speichern; bleibt RGBA (wichtig für Editoren und Figura)."""
    img.save(path, optimize=True)
    try:
        import oxipng  # pip install pyoxipng (optional)
        oxipng.optimize(path, level=6, strip=oxipng.StripChunks.safe(),
                        color_type_reduction=False, palette_reduction=False,
                        grayscale_reduction=False, bit_depth_reduction=False)
    except ImportError:
        pass


def generate(out_dir: Path) -> tuple[Image.Image, Image.Image]:
    root = A.build()
    rng = random.Random(SEED)
    skin = Image.new("RGBA", (A.TEX_SIZE, A.TEX_SIZE), CLEAR)
    extras = Image.new("RGBA", (A.TEX_SIZE, A.TEX_SIZE), CLEAR)

    paint_head(skin, root, rng)
    paint_hair_layer(skin, root, rng)
    paint_body(skin, root, rng)
    paint_arm(skin, root, rng, "Arm_R", "Aermel_R")
    paint_arm(skin, root, rng, "Arm_L", "Aermel_L")
    paint_leg(skin, root, rng, "Bein_R", "Hose_R")
    paint_leg(skin, root, rng, "Bein_L", "Hose_L")

    paint_face_variants(extras, root)
    paint_ear(extras, root, rng, "R")
    paint_ear(extras, root, rng, "L")
    paint_pony(extras, root, rng)
    paint_lock(extras, root, rng, "Straehne_R_Haare")
    paint_lock(extras, root, rng, "Straehne_L_Haare")
    paint_back_hair(extras, root, rng)
    paint_bow(extras, root, rng)
    paint_scarf(extras, root, rng)
    paint_skirt(extras, root, rng)
    paint_tail(extras, root, rng)

    save_png(skin, out_dir / "skin.png")
    save_png(extras, out_dir / "extras.png")
    (out_dir / "doku").mkdir(exist_ok=True)
    draw_layout(skin, extras, root, out_dir / "doku" / "uv_layout.png")
    return skin, extras


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent
    generate(out)
    for name in ("skin.png", "extras.png", "doku/uv_layout.png"):
        print(f"{name}: {(out / name).stat().st_size} Bytes")
