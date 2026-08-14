#!/usr/bin/env python3
"""Installe un scan de cadre et recale sa géométrie dans js/frames.js.

    python3 tools/fit-frame.py <image.png> <frame-id> [--scale N] [--dry-run]

Le PNG doit avoir une fenêtre réellement transparente (alpha 0) au centre :
l'app dessine la photo d'abord, le scan par-dessus (js/frames.js:239-243).
Un scan à fenêtre pleine masquerait la photo — le script refuse ce cas.

Dépendance : Pillow (pip3 install Pillow).
"""

import argparse
import re
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow manquant. Installe-le : pip3 install Pillow")

ROOT = Path(__file__).resolve().parent.parent
FRAMES_JS = ROOT / "js" / "frames.js"

# Le rendu vise ~1400 px de large (frame.W * scale) pour rester homogène
# avec les autres cadres du jeu.
TARGET_W = 1400
SCALES = (1, 1.25, 1.5, 2)


def measure(path, thr=128):
    """Renvoie (W, H, (x, y, w, h)) — la fenêtre est la zone transparente
    connexe qui contient le centre de l'image. (…, None) si elle est pleine."""
    im = Image.open(path)
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    W, H = im.size
    alpha = im.getchannel("A").point(lambda v: 0 if v < thr else 255)
    if alpha.getpixel((W // 2, H // 2)) != 0:
        return W, H, None
    ImageDraw.floodfill(alpha, (W // 2, H // 2), 128, thresh=0)
    box = alpha.point(lambda v: 255 if v == 128 else 0).getbbox()
    return W, H, (box[0], box[1], box[2] - box[0], box[3] - box[1])


def find_entry(src, frame_id):
    """Découpe le bloc littéral de l'objet portant cet id."""
    m = re.search(r"id:\s*'%s'" % re.escape(frame_id), src)
    if not m:
        ids = re.findall(r"id:\s*'([^']+)'", src)
        sys.exit("id inconnu : %s\nDisponibles : %s" % (frame_id, ", ".join(ids)))
    start = src.rindex("{", 0, m.start())
    end = src.index("\n  },", m.start())
    return start, end, src[start:end]


def pick_scale(width):
    return min(SCALES, key=lambda s: abs(width * s - TARGET_W))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("frame_id")
    ap.add_argument("--scale", type=float, help="force le facteur de rendu")
    ap.add_argument("--dry-run", action="store_true", help="mesure sans rien écrire")
    args = ap.parse_args()

    source = Path(args.image).expanduser()
    if not source.is_file():
        sys.exit("Introuvable : %s" % source)

    src = FRAMES_JS.read_text(encoding="utf-8")
    start, end, block = find_entry(src, args.frame_id)

    overlay = re.search(r"overlay:\s*'([^']+)'", block)
    if not overlay:
        sys.exit("Pas de champ overlay dans l'entrée %s" % args.frame_id)
    target = ROOT / overlay.group(1)

    W, H, win = measure(source)
    if win is None:
        sys.exit(
            "La fenêtre de %s n'est pas transparente : le centre est opaque.\n"
            "Ré-exporte le PNG en effaçant la zone image en alpha 0 (transparence\n"
            "réelle, pas du blanc), en gardant le grain du papier et les bords de\n"
            "la découpe. Sinon le cadre recouvrirait la photo." % source.name
        )

    x, y, w, h = win
    scale = args.scale if args.scale else pick_scale(W)

    old = re.search(r"W:\s*(\d+),\s*H:\s*(\d+)", block)
    old_img = re.search(r"img:\s*\{[^}]*\}", block)
    old_scale = re.search(r"scale:\s*([\d.]+)", block)

    print("Source  : %s" % source)
    print("Cible   : %s" % target.relative_to(ROOT))
    print("Avant   : W: %s, H: %s  %s  scale: %s"
          % (old.group(1), old.group(2), old_img.group(0), old_scale.group(1)))
    print("Après   : W: %d, H: %d  img: { x: %d, y: %d, w: %d, h: %d }  scale: %g"
          % (W, H, x, y, w, h, scale))
    print("Rendu   : %d × %d px" % (W * scale, H * scale))

    if args.dry_run:
        print("\n--dry-run : rien écrit.")
        return

    patched = block
    patched = re.sub(r"W:\s*\d+,\s*H:\s*\d+", "W: %d, H: %d" % (W, H), patched, count=1)
    patched = re.sub(r"img:\s*\{[^}]*\}",
                     "img: { x: %d, y: %d, w: %d, h: %d }" % (x, y, w, h),
                     patched, count=1)
    patched = re.sub(r"scale:\s*[\d.]+", "scale: %g" % scale, patched, count=1)

    FRAMES_JS.write_text(src[:start] + patched + src[end:], encoding="utf-8")
    shutil.copyfile(source, target)
    print("\nÉcrit : %s et js/frames.js" % target.relative_to(ROOT))


if __name__ == "__main__":
    main()
