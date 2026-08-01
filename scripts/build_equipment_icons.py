"""Split the generated 6x6 equipment source sheet into transparent game icons."""

from pathlib import Path
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source" / "equipment-sprite-source.png"
SHOP_SOURCE = ROOT / "art-source" / "shop-items-sprite-source.png"
OUTPUT = ROOT / "public" / "assets" / "items" / "equipment"

NAMES = [
    "novice-cutter", "sword", "bow", "gun", "mage-staff", "holy-rod",
    "katana", "crossbow", "silver-dagger", "heavy-warhammer", "excalibur", "rudra-bow",
    "ragnarok-blade", "ember-fang", "frost-cleaver", "stormcaller-bow", "soulreaper", "godslayer",
    "wooden-buckler", "iron-shield", "tear-shield", "golden-shield", "aegis-of-olympus", "cowboy-hat",
    "wizard-hat", "crown", "sunglasses", "classic-glasses", "cotton-shirt", "adventurer-suit",
    "iron-helm", "leather-cloak", "steel-plate-mail", "ranger-hood", "dragon-scale-mail", "valkyrie-armor",
]

SHOP_NAMES = [
    "apple", "carrot", "red-herb", "green-herb", "yellow-herb", "orange-juice",
    "blue-herb", "grape", "fishing-rod", "silver-ring", "speed-boots", "odin-garment",
    "leather-bracer", "leather-pants", "steel-bracer", "plate-legguards", "guardian-wristguard", "dragon-greaves",
    "poring-pet", "chick-pet", "kitten-pet", "puppy-pet", "owl-pet", "baby-dragon-pet",
    "oridecon", "elunium",
]


def remove_green(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = pixels[x, y]
            # Soft chroma matte. The source background is saturated green;
            # protect natural muted greens inside equipment by also requiring
            # green to dominate red and blue strongly.
            dominance = g - max(r, b)
            if g > 150 and dominance > 55:
                alpha = max(0, min(255, int(255 * (1 - (dominance - 55) / 150))))
                # Despill remaining edge green toward the other channels.
                g = min(g, max(r, b) + 18)
                pixels[x, y] = (r, g, b, alpha)
    return rgba


def center_icon(cell: Image.Image, size: int = 128) -> Image.Image:
    alpha = cell.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return Image.new("RGBA", (size, size))
    subject = cell.crop(bbox)
    max_subject = int(size * 0.88)
    subject.thumbnail((max_subject, max_subject), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.alpha_composite(subject, ((size - subject.width) // 2, (size - subject.height) // 2))
    return canvas


def keep_largest_component(image: Image.Image) -> Image.Image:
    """Drop fragments belonging to subjects that crossed in from other cells."""
    alpha = image.getchannel("A")
    width, height = image.size
    visible = alpha.load()
    visited = bytearray(width * height)
    components = []
    for y in range(height):
        for x in range(width):
            key = y * width + x
            if visited[key] or visible[x, y] < 24:
                continue
            stack = [(x, y)]
            visited[key] = 1
            component = []
            while stack:
                px, py = stack.pop()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        nk = ny * width + nx
                        if not visited[nk] and visible[nx, ny] >= 24:
                            visited[nk] = 1
                            stack.append((nx, ny))
            components.append(component)
    if not components:
        return image
    keep = set(max(components, key=len))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            if (x, y) not in keep:
                r, g, b, _ = pixels[x, y]
                pixels[x, y] = (r, g, b, 0)
    return image


def main() -> None:
    sheet = Image.open(SOURCE).convert("RGB")
    if len(NAMES) != 36:
        raise ValueError("equipment icon manifest must contain exactly 36 names")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cell_w = sheet.width // 6
    cell_h = sheet.height // 6
    preview = Image.new("RGBA", (6 * 128, 6 * 128), (18, 24, 38, 255))
    for index, name in enumerate(NAMES):
        col, row = index % 6, index // 6
        # The generated subjects occasionally graze a neighbouring cell by a
        # few pixels. Inset each cell so those fragments never leak into icons.
        inset = 7
        left, top = col * cell_w + inset, row * cell_h + inset
        right = (sheet.width if col == 5 else (col + 1) * cell_w) - inset
        bottom = (sheet.height if row == 5 else (row + 1) * cell_h) - inset
        cell = sheet.crop((left, top, right, bottom))
        icon = center_icon(keep_largest_component(remove_green(cell)))
        icon.save(OUTPUT / f"{name}.png", optimize=True)
        preview.alpha_composite(icon, ((index % 6) * 128, (index // 6) * 128))
    preview.save(ROOT / "art-source" / "equipment-icons-preview.png", optimize=True)

    shop = Image.open(SHOP_SOURCE).convert("RGB")
    shop_preview = Image.new("RGBA", (6 * 128, 5 * 128), (18, 24, 38, 255))
    shop_w, shop_h = shop.width // 6, shop.height // 5
    for index, name in enumerate(SHOP_NAMES):
        col, row = index % 6, index // 6
        inset = 7
        left, top = col * shop_w + inset, row * shop_h + inset
        right = (shop.width if col == 5 else (col + 1) * shop_w) - inset
        bottom = (shop.height if row == 4 else (row + 1) * shop_h) - inset
        icon = center_icon(keep_largest_component(remove_green(shop.crop((left, top, right, bottom)))))
        icon.save(OUTPUT / f"{name}.png", optimize=True)
        shop_preview.alpha_composite(icon, (col * 128, row * 128))
    shop_preview.save(ROOT / "art-source" / "shop-items-icons-preview.png", optimize=True)
    print(f"wrote {len(NAMES) + len(SHOP_NAMES)} icons to {OUTPUT}")


if __name__ == "__main__":
    main()
