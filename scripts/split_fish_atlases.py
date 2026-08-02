"""Split chroma-keyed fish atlases into consistent transparent inventory icons."""

from pathlib import Path
import argparse
from PIL import Image


FISH = {
    "common": (6, 5, [
        "Tilapia", "Catfish", "Carp", "Perch", "Sardine", "Anchovy", "Mackerel", "Herring", "Shad", "Smelt",
        "Goby", "Mullet", "Sole", "Crucian Carp", "Bass", "Trout", "Pike", "Bluegill", "Minnow", "Sunfish",
        "Roach", "Dace", "Whiting", "Flounder", "Snapper", "Cod", "Haddock", "Pollock", "Butterfish", "Sea Bass",
    ]),
    "uncommon": (5, 5, [
        "Rainbow Trout", "Salmon", "Tuna", "Swordfish", "Eel", "Barramundi", "Grouper", "Red Snapper", "Yellowtail",
        "Pompano", "Wahoo", "Mahi-Mahi", "Sailfish", "Sturgeon", "Walleye", "Striped Bass", "King Mackerel",
        "Dorado", "Arapaima", "Paddlefish", "Tarpon", "Bonefish",
    ]),
    "rare": (5, 3, [
        "Golden Koi", "Arowana", "Moonfish", "Ghost Fish", "Crystal Fish", "Sunstone Fish", "Stargazer", "Coelacanth",
        "Electric Eel", "Oarfish", "Piranha", "Marlin", "Giant Catfish", "Anglerfish",
    ]),
    "legendary": (4, 2, [
        "Great White Shark", "Hammerhead", "Raja Ampat Shark", "Leviathan", "Phoenix Fish", "Frost Dragon Fish", "Emperor Fish",
    ]),
}


def slug(name: str) -> str:
    return "-".join("".join(c.lower() if c.isalnum() else " " for c in name).split())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("tier", choices=FISH)
    parser.add_argument("atlas", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    cols, rows, names = FISH[args.tier]
    atlas = Image.open(args.atlas).convert("RGBA")
    args.output.mkdir(parents=True, exist_ok=True)
    cell_w, cell_h = atlas.width / cols, atlas.height / rows

    for index, name in enumerate(names):
        col, row = index % cols, index // cols
        box = (round(col * cell_w), round(row * cell_h), round((col + 1) * cell_w), round((row + 1) * cell_h))
        cell = atlas.crop(box)
        alpha_box = cell.getchannel("A").getbbox()
        if not alpha_box:
            raise RuntimeError(f"empty atlas cell for {name}")
        art = cell.crop(alpha_box)
        side = max(art.size)
        margin = max(8, round(side * 0.12))
        canvas = Image.new("RGBA", (side + margin * 2, side + margin * 2))
        canvas.alpha_composite(art, ((canvas.width - art.width) // 2, (canvas.height - art.height) // 2))
        canvas.thumbnail((192, 192), Image.Resampling.LANCZOS)
        final = Image.new("RGBA", (192, 192))
        final.alpha_composite(canvas, ((192 - canvas.width) // 2, (192 - canvas.height) // 2))
        final.save(args.output / f"{slug(name)}.png", optimize=True)


if __name__ == "__main__":
    main()
