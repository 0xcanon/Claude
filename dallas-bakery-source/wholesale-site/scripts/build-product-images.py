#!/usr/bin/env python3
"""
Rebuilds the homepage photography in public/images/ from source photographs.

Why this exists: the homepage art is not a set of files someone once dragged
in, it is the output of a recipe. If the bakery re-shoots the bread, or wants
the logo on the pictures, or the site palette changes, run this instead of
opening an image editor and guessing.

    python3 scripts/build-product-images.py --src ~/photos
    python3 scripts/build-product-images.py --src ~/photos --logo

What it does to each photograph:

  * Removes a baked-in watermark. The retail store's packshots carry the
    Dallas Bakery mark in the bottom-left of the transparent layer. The loaf
    and the mark are separate islands in the alpha channel and the loaf is
    always far larger, so keeping the biggest island isolates the bread
    without hard-coding where the mark sits.
  * Crops to the loaf, so the bread fills its frame instead of floating in a
    big transparent square.
  * Builds each image at the aspect ratio of the box it actually renders in.
    The containers use object-fit: cover, which silently crops anything that
    does not match — a wide loaf in the 4:3 product card lost its ends.
  * Adds a soft contact shadow so the loaf sits on the panel rather than
    hovering above it, on a background taken from globals.css.

--logo puts the bakery mark back, small and in a consistent corner. It is off
by default: on this site every product card already sits under the Dallas
Bakery Wholesale header, so a mark on each photograph repeats the brand three
more times on one screen and competes with the bread. It earns its place on
images that travel away from the site — app-store screenshots, a marketing
email, a photo a buyer drops into their own deck.

Requires Pillow and numpy:  pip install pillow numpy
"""
import argparse
import os
import sys

try:
    import numpy as np
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit("Needs Pillow and numpy:  pip install pillow numpy")

# Panel colours, kept in step with app/globals.css.
HERO_BG = (0xd9, 0xc3, 0xa6)   # .hero-visual
CARD_BG = (0xe8, 0xdc, 0xcb)   # .product-image

# source filename -> (output name, canvas, background, rotation)
PLAN = {
    "barbari-bare":     ("hero-barbari.webp",        (1200, 1500), HERO_BG, -28),
    "barbari-bare2":    ("classic-barbari.webp",     (900, 675),   CARD_BG, 0),
    "natural-bare":     ("natural-barbari.webp",     (900, 675),   CARD_BG, 0),
    "whole-wheat-bare": ("whole-wheat-barbari.webp", (900, 675),   CARD_BG, 0),
}


def clean_loaf(path):
    """Returns the loaf alone: watermark dropped, cropped to its own bounds."""
    im = Image.open(path).convert("RGBA")
    rgba = np.array(im)
    solid = rgba[:, :, 3] > 24
    h, w = solid.shape

    labels = np.zeros((h, w), dtype=np.int32)
    current = best_label = best_size = 0
    for y in range(h):
        for x in range(w):
            if not solid[y, x] or labels[y, x]:
                continue
            current += 1
            size = 0
            stack = [(y, x)]
            labels[y, x] = current
            while stack:
                cy, cx = stack.pop()
                size += 1
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = current
                        stack.append((ny, nx))
            if size > best_size:
                best_size, best_label = size, current

    mask = labels == best_label
    rgba[~mask] = (0, 0, 0, 0)
    ys, xs = np.where(mask)
    return Image.fromarray(rgba, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def trim(im):
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def warm_ground(size, base):
    """A soft vertical wash, so a flat panel does not read as a pasted box."""
    w, h = size
    top = tuple(min(255, c + 10) for c in base)
    bottom = tuple(max(0, c - 14) for c in base)
    ramp = np.linspace(0, 1, h)[:, None]
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    for i in range(3):
        rgb[:, :, i] = (top[i] * (1 - ramp) + bottom[i] * ramp).astype(np.uint8)
    return Image.fromarray(rgb, "RGB").convert("RGBA")


def keyed_logo(path, height, opacity=0.55):
    """The logo ships as black art on white; turn the white into transparency."""
    im = Image.open(path).convert("L")
    art = Image.new("RGBA", im.size, (0x2a, 0x1b, 0x13, 255))
    art.putalpha(im.point(lambda v: int((255 - v) * opacity)))
    return art.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def build(src, out, canvas, bg, angle, logo=None, fill=0.86):
    loaf = clean_loaf(src)
    if angle:
        loaf = trim(loaf.rotate(angle, resample=Image.BICUBIC, expand=True))

    cw, ch = canvas
    ground = warm_ground(canvas, bg)
    scale = min(cw * fill / loaf.width, ch * fill / loaf.height)
    loaf = loaf.resize((max(1, round(loaf.width * scale)), max(1, round(loaf.height * scale))), Image.LANCZOS)
    if scale > 1.2:
        # Enough to bring the crust back after upscaling, not so much that the
        # sesame seeds ring.
        loaf = loaf.filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=3))

    x, y = (cw - loaf.width) // 2, (ch - loaf.height) // 2

    shadow = Image.new("RGBA", canvas, (0, 0, 0, 0))
    blob = Image.new("RGBA", loaf.size, (0, 0, 0, 0))
    blob.putalpha(loaf.getchannel("A").point(lambda v: int(v * 0.30)))
    shadow.paste(blob, (x, y + max(6, loaf.height // 14)), blob)
    ground.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(radius=max(8, loaf.height // 22))))
    ground.alpha_composite(loaf, (x, y))

    if logo and os.path.exists(logo):
        mark = keyed_logo(logo, max(72, ch // 7))
        ground.alpha_composite(mark, (int(cw * 0.035), ch - mark.height - int(ch * 0.035)))

    ground.convert("RGB").save(out, "WEBP", quality=88, method=6)
    print(f"  {os.path.basename(out):<28} {cw}x{ch:<5} {os.path.getsize(out) // 1024:>4}KB")


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="folder of source photographs (RGBA, loaf on transparency)")
    ap.add_argument("--out", default=os.path.join(here, "public", "images"))
    ap.add_argument("--logo", nargs="?", const="auto", default=None,
                    help="stamp the bakery mark on each image; optionally a path to the logo file")
    args = ap.parse_args()

    logo = args.logo
    if logo == "auto":
        logo = os.path.join(args.src, "Dallas_Bakery_Logo.jpg")
        if not os.path.exists(logo):
            sys.exit(f"--logo given but no logo at {logo}; pass --logo /path/to/logo.jpg")

    print(f"Building into {args.out}" + (" with the bakery mark" if logo else " (no mark — see --logo)"))
    missing = []
    for stem, (name, canvas, bg, angle) in PLAN.items():
        src = next((os.path.join(args.src, stem + e) for e in (".webp", ".png", ".jpg")
                    if os.path.exists(os.path.join(args.src, stem + e))), None)
        if not src:
            missing.append(stem)
            continue
        build(src, os.path.join(args.out, name), canvas, bg, angle, logo)

    if missing:
        print("\nNot found in --src (skipped): " + ", ".join(missing))
        print("Name each source photograph after its key above, e.g. barbari-bare.webp")


if __name__ == "__main__":
    main()
