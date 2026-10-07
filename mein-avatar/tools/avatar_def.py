"""
Gemeinsame Definition des Avatars: Geometrie, Gruppen und UV-Layout.

Alle anderen Skripte (Textur, Modell, Validierung, Vorschau) lesen diese Datei,
damit Modell und Textur nie auseinanderlaufen.

Koordinaten wie in Blockbench (Einheit = 1 Minecraft-Pixel):
  - die Figur schaut nach -Z (Seite "north"),
  - ihre rechte Seite liegt bei +X ("east"), ihre linke bei -X ("west"),
  - Füße bei Y = 0, Oberkante Kopf bei Y = 32.

UV-Auflösung des Projekts: 64 x 64. Die Texturen sind 256 x 256, also 4 Texturpixel
pro UV-Einheit (SCALE = 4). Figura und Blockbench rechnen UVs über
"uv_width/uv_height" (64) auf die echte Bildgröße (256) um.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Grundgrößen

UV_RES = 64          # UV-Auflösung im Modell (wie ein normaler Skin)
SCALE = 4            # Texturpixel pro UV-Einheit
TEX_SIZE = UV_RES * SCALE  # 256

MODEL_NAME = "model"  # Dateiname ohne Endung -> in Lua: models.model
TEXTURES = ("skin", "extras")  # Index 0 = skin.png, 1 = extras.png

EMOTIONS = ("neutral", "froehlich", "ueberrascht", "wuetend", "schlaefrig")
EMOTION_TITLES = {
    "neutral": "Neutral",
    "froehlich": "Fröhlich",
    "ueberrascht": "Überrascht",
    "wuetend": "Wütend",
    "schlaefrig": "Schläfrig",
}

# Gesichtsfläche (vor dem Kopf): unterer Teil der Kopf-Vorderseite,
# 8 x 5 Minecraft-Pixel = 32 x 20 Texturpixel (Brauen, Augen, Wangen, Mund).
FACE_W, FACE_H = 8, 5
FACE_Y0 = 24            # Unterkante (Kinn)
FACE_Z = -4.01          # knapp vor der Kopf-Vorderseite (-4), hinter der Haarschicht (-4.5)
# Zeile der Kopf-Vorderseite (in Minecraft-Pixeln von oben), ab der die Gesichtsfläche beginnt
FACE_ROW0 = 8 - FACE_H  # = 3


# ---------------------------------------------------------------------------
# Datenstrukturen

@dataclass
class Cube:
    name: str
    frm: tuple[float, float, float]
    to: tuple[float, float, float]
    tex: str                                   # "skin" oder "extras"
    uv: tuple[int, int] | None = None          # Box-UV-Ursprung (UV-Einheiten); None = Einzelflächen-UV
    inflate: float = 0.0
    faces: dict[str, tuple[float, float, float, float]] | None = None  # nur bei Einzelflächen-UV
    visible: bool = True

    @property
    def size(self) -> tuple[int, int, int]:
        s = tuple(round(b - a, 6) for a, b in zip(self.frm, self.to))
        return s  # type: ignore[return-value]

    @property
    def box_size(self) -> tuple[int, int, int]:
        """Ganzzahlige Größe für Box-UV (wie Blockbench: abgerundet)."""
        return tuple(int(abs(v) + 1e-6) for v in self.size)  # type: ignore[return-value]


@dataclass
class Group:
    name: str
    pivot: tuple[float, float, float]
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0)
    cubes: list[Cube] = field(default_factory=list)
    children: list["Group"] = field(default_factory=list)
    visible: bool = True


# ---------------------------------------------------------------------------
# Box-UV (Minecraft-Skin-Netz)
#
#              [ oben ][ unten ]
#   [ rechts ][ vorne ][ links ][ hinten ]
#
# "rechts/links" aus Sicht der Figur. Breite w (X), Höhe h (Y), Tiefe d (Z).
# Ausrichtung beim Malen (so wie im Skin-Editor):
#   vorne : links im Bild = rechte Körperseite (+X)
#   rechts: links im Bild = hinten,  rechts im Bild = vorne
#   links : links im Bild = vorne,   rechts im Bild = hinten
#   hinten: links im Bild = linke Körperseite (-X)
#   oben  : unten im Bild = vorne, links im Bild = rechte Körperseite
#   unten : wie "oben" ausgerichtet (Minecraft-Eigenheit: unten im Bild = vorne)

def net_rects(u: int, v: int, size: tuple[int, int, int]) -> dict[str, tuple[int, int, int, int]]:
    """Flächen eines Box-UV-Netzes in UV-Einheiten als (x0, y0, x1, y1), x0<x1, y0<y1."""
    w, h, d = size
    return {
        "up": (u + d, v, u + d + w, v + d),
        "down": (u + d + w, v, u + d + 2 * w, v + d),
        "east": (u, v + d, u + d, v + d + h),            # rechte Körperseite
        "north": (u + d, v + d, u + d + w, v + d + h),   # vorne
        "west": (u + d + w, v + d, u + 2 * d + w, v + d + h),  # linke Körperseite
        "south": (u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h),  # hinten
    }


def bb_box_face_uvs(u: int, v: int, size: tuple[int, int, int]) -> dict[str, list[float]]:
    """
    Flächen-UVs genau so, wie Blockbench sie im Box-UV-Modus berechnet und speichert
    (Cube.updateUV). "up" ist in beiden Achsen, "down" waagerecht gespiegelt gespeichert.
    """
    w, h, d = size
    return {
        "east": [u, v + d, u + d, v + d + h],
        "west": [u + d + w, v + d, u + 2 * d + w, v + d + h],
        "up": [u + d + w, v + d, u + d, v],
        "down": [u + d + 2 * w, v, u + d + w, v + d],
        "south": [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
        "north": [u + d, v + d, u + d + w, v + d + h],
    }


def net_size(size: tuple[int, int, int]) -> tuple[int, int]:
    w, h, d = size
    return 2 * d + 2 * w, d + h


# ---------------------------------------------------------------------------
# Platzverteilung in extras.png (einfacher Regal-Packer, deterministisch)

class _Packer:
    def __init__(self, width: int, gap: int = 1) -> None:
        self.width = width
        self.gap = gap
        self.x = 0
        self.y = 0
        self.row_h = 0

    def place(self, w: int, h: int) -> tuple[int, int]:
        if self.x + w > self.width:
            self.x = 0
            self.y += self.row_h + self.gap
            self.row_h = 0
        pos = (self.x, self.y)
        self.x += w + self.gap
        self.row_h = max(self.row_h, h)
        return pos


def _box(name: str, frm, to, tex: str = "extras", inflate: float = 0.0, uv=None) -> Cube:
    return Cube(name=name, frm=tuple(frm), to=tuple(to), tex=tex, uv=uv, inflate=inflate)


def build() -> Group:
    """Baut den kompletten Gruppenbaum. Wurzel ist eine unsichtbare Sammelgruppe."""

    # --- Vanilla-Körper (skin.png, Standard-Layout) -------------------------
    head = Group("Head", (0, 24, 0), cubes=[
        _box("Kopf", (-4, 24, -4), (4, 32, 4), "skin", uv=(0, 0)),
        _box("Kopf_Haarschicht", (-4, 24, -4), (4, 32, 4), "skin", 0.5, uv=(32, 0)),
    ])
    body = Group("Body", (0, 24, 0), cubes=[
        _box("Koerper", (-4, 12, -2), (4, 24, 2), "skin", uv=(16, 16)),
        _box("Jacke", (-4, 12, -2), (4, 24, 2), "skin", 0.25, uv=(16, 32)),
    ])
    # Slim-Arme (3 Pixel breit). Figura verschiebt Slim-Arme im Spiel selbst um 0,5 nach unten
    # (Vanilla-Pivot 2,5 statt 2), deshalb hier bündig mit der Schulter wie in Figuras Vorlage.
    right_arm = Group("RightArm", (5, 22, 0), cubes=[
        _box("Arm_R", (4, 12, -2), (7, 24, 2), "skin", uv=(40, 16)),
        _box("Aermel_R", (4, 12, -2), (7, 24, 2), "skin", 0.25, uv=(40, 32)),
    ])
    left_arm = Group("LeftArm", (-5, 22, 0), cubes=[
        _box("Arm_L", (-7, 12, -2), (-4, 24, 2), "skin", uv=(32, 48)),
        _box("Aermel_L", (-7, 12, -2), (-4, 24, 2), "skin", 0.25, uv=(48, 48)),
    ])
    right_leg = Group("RightLeg", (1.9, 12, 0), cubes=[
        _box("Bein_R", (0, 0, -2), (4, 12, 2), "skin", uv=(0, 16)),
        _box("Hose_R", (0, 0, -2), (4, 12, 2), "skin", 0.25, uv=(0, 32)),
    ])
    left_leg = Group("LeftLeg", (-1.9, 12, 0), cubes=[
        _box("Bein_L", (-4, 0, -2), (0, 12, 2), "skin", uv=(16, 48)),
        _box("Hose_L", (-4, 0, -2), (0, 12, 2), "skin", 0.25, uv=(0, 48)),
    ])

    # --- Extras (extras.png) -------------------------------------------------
    # Namen bewusst deutsch: Figura ordnet Gruppen per Namensanfang zu ("Head...", "Left..."),
    # die Extras dürfen deshalb NICHT mit diesen Schlüsselwörtern beginnen.
    ear_r = Group("Ohr_R", (2.5, 32, -0.5), (0, 0, -12), cubes=[
        _box("Ohr_R_Basis", (1, 32, -1), (4, 34, 0)),
        _box("Ohr_R_Spitze", (1.5, 34, -1), (3.5, 37, 0)),
    ])
    ear_l = Group("Ohr_L", (-2.5, 32, -0.5), (0, 0, 12), cubes=[
        _box("Ohr_L_Basis", (-4, 32, -1), (-1, 34, 0)),
        _box("Ohr_L_Spitze", (-3.5, 34, -1), (-1.5, 37, 0)),
    ])
    pony = Group("Pony", (0, 32, -4.5), cubes=[_box("Pony_Haare", (-4, 29, -5), (4, 32, -4), inflate=0.25)])
    lock_r = Group("Straehne_R", (4.5, 30, -4.5), cubes=[_box("Straehne_R_Haare", (4, 23, -5), (5, 30, -4), inflate=0.25)])
    lock_l = Group("Straehne_L", (-4.5, 30, -4.5), cubes=[_box("Straehne_L_Haare", (-5, 23, -5), (-4, 30, -4), inflate=0.25)])
    back_hair = Group("Haare_Hinten", (0, 28, 4.5), cubes=[_box("Haare_Hinten_Haare", (-4, 20, 4), (4, 28, 5), inflate=0.25)])
    bow = Group("Schleife", (-4.75, 32, -1.5), (-20, 0, 0), cubes=[
        _box("Schleife_Knoten", (-5.25, 31.5, -2), (-4.25, 32.5, -1)),
        _box("Schleife_Vorne", (-5, 31, -4), (-4, 33, -2)),
        _box("Schleife_Hinten", (-5, 31, -1), (-4, 33, 1)),
    ])
    face = Group("Gesicht", (0, 24, 0))
    for emo in EMOTIONS:
        for state in ("offen", "zu"):
            face.cubes.append(Cube(
                name=f"Gesicht_{emo}_{state}",
                frm=(-4, FACE_Y0, FACE_Z), to=(4, FACE_Y0 + FACE_H, FACE_Z),
                tex="extras", uv=None, faces={},
                visible=(emo == "neutral" and state == "offen"),
            ))
    head.children += [face, ear_r, ear_l, pony, lock_r, lock_l, back_hair, bow]

    scarf_end = Group("Schal_Ende", (2.5, 22, -2.75), cubes=[_box("Schal_Ende_Stoff", (1.5, 16, -3.25), (3.5, 22, -2.25))])
    scarf = Group("Schal", (0, 24, 0), cubes=[_box("Schal_Ring", (-4.5, 22, -2.5), (4.5, 24, 2.5), inflate=0.25)],
                  children=[scarf_end])
    skirt = Group("Rock", (0, 13, 0), children=[
        Group("Rock_Vorne", (0, 13, -2.5), (8, 0, 0), cubes=[_box("Rock_Vorne_Stoff", (-4, 8, -3), (4, 13, -2), inflate=0.25)]),
        Group("Rock_Hinten", (0, 13, 2.5), (-8, 0, 0), cubes=[_box("Rock_Hinten_Stoff", (-4, 8, 2), (4, 13, 3), inflate=0.25)]),
        Group("Rock_R", (4.5, 13, 0), (0, 0, 8), cubes=[_box("Rock_R_Stoff", (4, 8, -2), (5, 13, 2), inflate=0.25)]),
        Group("Rock_L", (-4.5, 13, 0), (0, 0, -8), cubes=[_box("Rock_L_Stoff", (-5, 8, -2), (-4, 13, 2), inflate=0.25)]),
    ])
    tail_tip = Group("Schwanz_Spitze", (0, 13.5, 10.5), (-18, 0, 0), cubes=[_box("Schwanz_Spitze_Fell", (-2, 11.5, 10), (2, 15.5, 14))])
    tail_mid = Group("Schwanz_Mitte", (0, 13.5, 5), (-12, 0, 0), cubes=[_box("Schwanz_Mitte_Fell", (-2.5, 11, 4.5), (2.5, 16, 10.5))],
                     children=[tail_tip])
    tail = Group("Schwanz", (0, 13.5, 2.25), (55, 0, 0), cubes=[_box("Schwanz_Basis_Fell", (-1, 12.5, 2), (1, 14.5, 5))],
                 children=[tail_mid])
    body.children += [scarf, skirt, tail]

    root = Group("root", (0, 0, 0), children=[head, body, right_arm, left_arm, right_leg, left_leg])

    # --- UVs in extras.png verteilen ------------------------------------------
    packer = _Packer(UV_RES, gap=1)
    for cube in iter_cubes(root):
        if cube.tex != "extras":
            continue
        if cube.faces is not None:   # Gesichtsfläche: nur die Vorderseite
            x, y = packer.place(FACE_W, FACE_H)
            cube.faces = {"north": (x, y, x + FACE_W, y + FACE_H)}
        else:
            w, h = net_size(cube.box_size)
            cube.uv = packer.place(w, h)
    if packer.y + packer.row_h > UV_RES:
        raise RuntimeError("extras.png ist voll – UV-Layout passt nicht in 64x64")
    return root


def iter_groups(group: Group):
    yield group
    for child in group.children:
        yield from iter_groups(child)


def iter_cubes(group: Group):
    for g in iter_groups(group):
        yield from g.cubes


def find_cube(root: Group, name: str) -> Cube:
    for cube in iter_cubes(root):
        if cube.name == name:
            return cube
    raise KeyError(name)


def find_group(root: Group, name: str) -> Group:
    for g in iter_groups(root):
        if g.name == name:
            return g
    raise KeyError(name)


if __name__ == "__main__":
    r = build()
    for c in iter_cubes(r):
        print(f"{c.name:24s} tex={c.tex:6s} size={c.box_size} uv={c.uv} faces={c.faces}")
