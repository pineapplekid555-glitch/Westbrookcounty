#!/usr/bin/env python3
"""
Westbrook County map exporter.

Turns the map picture that ServerStorage.MapBaker stores inside Studio
(ServerStorage.MapRasterData) into PNG images for the website, and writes the
manifest that /api/maps reads.

HOW TO USE
  1. In Studio (Edit mode), if the world changed since the last bake, run this in the
     Command Bar first:   require(game.ServerStorage.MapBaker)()
  2. In the Explorer, right-click  ServerStorage > MapRasterData  >  "Save to File..."
     and save it as  MapRasterData.rbxmx   (choose the .rbxmx type, NOT .rbxm).
  3. Run:
         pip install zstandard pillow
         python3 tools/export_map.py MapRasterData.rbxmx
  4. Upload the files it creates in  assets/maps/  to GitHub. Done - /api/maps is updated.

Optional second argument: a map-data.json to draw labels from (default: assets/maps/map-data.json).
"""
import base64
import datetime
import json
import os
import sys
import xml.etree.ElementTree as ET

try:
    import zstandard
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Missing libraries. Run:  pip install zstandard pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "assets", "maps")


# ---------------------------------------------------------------- reading the Studio file
def read_string_values(path):
    """Returns {name: value} for every StringValue inside the saved .rbxmx file."""
    with open(path, "rb") as f:
        head = f.read(16)
    if head.startswith(b"<roblox!"):
        sys.exit("That file was saved as .rbxm (binary). Save it again and choose the .rbxmx type.")
    values = {}
    for item in ET.parse(path).getroot().iter("Item"):
        if item.get("class") != "StringValue":
            continue
        props = item.find("Properties")
        if props is None:
            continue
        name = value = None
        for p in props:
            if p.get("name") == "Name":
                name = p.text or ""
            elif p.get("name") == "Value":
                value = p.text or ""
        if name is not None and value is not None:
            values[name] = value
    return values


def build_level(values, meta, level):
    """Reassembles one level ("detail" or "overview") from its Zstd-compressed tiles."""
    info = meta[level]
    W, H = info["W"], info["H"]
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dctx = zstandard.ZstdDecompressor()
    for index, tile in enumerate(info["tiles"], start=1):
        compressed = b""
        for chunk in range(1, tile["chunks"] + 1):
            key = f"{level}_{index}_{chunk}"
            if key not in values:
                sys.exit(f"The file is missing '{key}'. Re-save MapRasterData and try again.")
            compressed += base64.b64decode(values[key])
        w, h = tile["w"], tile["h"]
        raw = dctx.decompress(compressed, max_output_size=w * h * 4)
        if len(raw) != w * h * 4:
            sys.exit(f"Tile {level}_{index} decoded to the wrong size.")
        image.paste(Image.frombytes("RGBA", (w, h), raw), (tile["x"], tile["y"]))
    return image


# ---------------------------------------------------------------- drawing labels
def find_font(size):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def to_pixel(data, size, x, z):
    b = data["bounds"]
    px = (x - b["minX"]) / (b["maxX"] - b["minX"]) * size[0]
    py = (z - b["minZ"]) / (b["maxZ"] - b["minZ"]) * size[1]
    return px, py


def draw_text(base, xy, text, font, fill, angle=0):
    """Text with a dark outline, centred on xy, optionally rotated 90 degrees (top-to-bottom)."""
    probe = ImageDraw.Draw(base)
    left, top, right, bottom = probe.textbbox((0, 0), text, font=font, stroke_width=3)
    layer = Image.new("RGBA", (right - left + 8, bottom - top + 8), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((4 - left, 4 - top), text, font=font, fill=fill, stroke_width=3, stroke_fill=(10, 14, 20, 255))
    if angle == 90:
        layer = layer.rotate(-90, expand=True)
    base.alpha_composite(layer, (int(xy[0] - layer.width / 2), int(xy[1] - layer.height / 2)))


def label_size(probe, text, font):
    left, top, right, bottom = probe.textbbox((0, 0), text, font=font, stroke_width=3)
    return right - left + 8, bottom - top + 8


def overlaps(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def draw_labels(blank, data, with_postals):
    img = blank.copy()
    size = img.size
    scale = size[0] / 1827.0  # tuned on the 1827px wide map
    street_font = find_font(max(14, int(22 * scale)))
    place_font = find_font(max(12, int(17 * scale)))
    icon_font = find_font(max(9, int(12 * scale)))
    postal_font = find_font(max(12, int(18 * scale)))
    draw = ImageDraw.Draw(img)
    r = max(9, int(15 * scale))
    taken = []  # rectangles already used, so labels do not sit on top of each other

    # dots first (they are never moved), then street names
    dots = [(to_pixel(data, size, p["x"], p["z"]), p) for p in data.get("places", [])]
    for (x, y), _ in dots:
        taken.append((x - r, y - r, x + r, y + r))

    for s in data.get("streets", []):
        x, y = to_pixel(data, size, s["x"], s["z"])
        w, h = label_size(draw, s["name"], street_font)
        if s.get("angle", 0) == 90:
            w, h = h, w
        taken.append((x - w / 2, y - h / 2, x + w / 2, y + h / 2))
        draw_text(img, (x, y), s["name"], street_font, (255, 255, 255, 255), s.get("angle", 0))

    gap = 10 * scale
    for (x, y), p in dots:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=tuple(p["color"]) + (255,), outline=(255, 255, 255, 255), width=2)
        draw.text((x, y), p["icon"], font=icon_font, fill=(15, 20, 28, 255), anchor="mm")
        w, h = label_size(draw, p["name"], place_font)
        # try spots around the dot, nearest first (below, above, right, left, then diagonals),
        # moving further out each round, and keep the first one that is free
        candidates = []
        for k in range(5):
            extra = k * h * 0.9
            dy = r + gap + h / 2 + extra
            dx = r + 6 + w / 2 + extra
            candidates += [(x, y + dy), (x, y - dy), (x + dx, y), (x - dx, y),
                           (x + w / 2 + r, y + dy), (x - w / 2 - r, y + dy),
                           (x + w / 2 + r, y - dy), (x - w / 2 - r, y - dy)]
        spot = candidates[0]
        for cx, cy in candidates:
            box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
            if not any(overlaps(box, t) for t in taken):
                spot = (cx, cy)
                break
        taken.append((spot[0] - w / 2, spot[1] - h / 2, spot[0] + w / 2, spot[1] + h / 2))
        draw_text(img, spot, p["name"], place_font, (255, 236, 160, 255))

    if with_postals:
        for p in data.get("postals", []):
            draw_text(img, to_pixel(data, size, p["x"], p["z"]), p["text"], postal_font, (120, 230, 255, 255))
        for p in data.get("buildingNumbers", []):
            draw_text(img, to_pixel(data, size, p["x"], p["z"]), p["text"], icon_font, (255, 255, 255, 255))
    return img


# ---------------------------------------------------------------- main
def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    data_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(OUT_DIR, "map-data.json")
    os.makedirs(OUT_DIR, exist_ok=True)

    values = read_string_values(src)
    if "Meta" not in values:
        sys.exit("No 'Meta' found - was MapRasterData saved (not another folder)?")
    meta = json.loads(values["Meta"])

    detail = build_level(values, meta, "detail")
    overview = build_level(values, meta, "overview")

    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)
    b = meta["bounds"]
    data["bounds"] = {"minX": b[0], "maxX": b[1], "minZ": b[2], "maxZ": b[3]}

    files = []

    def save(name, image):
        image.save(os.path.join(OUT_DIR, name), optimize=True)
        files.append(name)
        print(f"  wrote {name}  {image.size[0]}x{image.size[1]}")

    print("Writing images to", os.path.normpath(OUT_DIR))
    save("westbrook_blank.png", detail)
    save("westbrook_labelled.png", draw_labels(detail, data, with_postals=False))
    has_postals = bool(data.get("postals") or data.get("buildingNumbers"))
    if has_postals:
        save("westbrook_postals.png", draw_labels(detail, data, with_postals=True))
    save("westbrook_blank_small.png", overview)

    data["size"] = {"width": detail.size[0], "height": detail.size[1]}
    with open(os.path.join(OUT_DIR, "map-data.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    manifest = {
        "files": files,
        "updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "size": data["size"],
        "studsPerPixel": meta["studsPerPixel"],
        "bounds": data["bounds"],
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("  wrote manifest.json and map-data.json")
    print("Now upload everything in assets/maps/ to GitHub.")


if __name__ == "__main__":
    main()
