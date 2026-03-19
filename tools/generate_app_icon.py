from __future__ import annotations

from pathlib import Path
from struct import pack

ROOT = Path(__file__).resolve().parents[1]
ICON_PATH = ROOT / "app" / "src-tauri" / "icons" / "icon.ico"
SIZES = [16, 32, 48, 64, 128, 256]

TRANSPARENT = (0, 0, 0, 0)
OUTLINE = (24, 28, 36, 255)
BASE = (18, 22, 30, 255)
ACCENT = (205, 156, 55, 255)
HIGHLIGHT = (247, 238, 214, 255)


def build_logical_grid() -> list[list[tuple[int, int, int, int]]]:
    grid = [[TRANSPARENT for _ in range(16)] for _ in range(16)]

    for y in range(2, 14):
        for x in range(2, 14):
            if x in (2, 13) or y in (2, 13):
                grid[y][x] = OUTLINE
            else:
                grid[y][x] = BASE

    for x, y in ((2, 2), (13, 2), (2, 13), (13, 13)):
        grid[y][x] = TRANSPARENT

    letter_pixels = {
        (7, 4), (8, 4),
        (6, 5), (7, 5), (8, 5), (9, 5),
        (6, 6), (9, 6),
        (5, 7), (6, 7), (7, 7), (8, 7), (9, 7), (10, 7),
        (5, 8), (10, 8),
        (5, 9), (6, 9), (7, 9), (8, 9), (9, 9), (10, 9),
        (4, 10), (5, 10), (10, 10), (11, 10),
        (4, 11), (5, 11), (10, 11), (11, 11),
        (4, 12), (5, 12), (10, 12), (11, 12),
    }

    for x, y in letter_pixels:
        grid[y][x] = ACCENT

    for x, y in ((7, 9), (8, 9), (7, 5), (8, 5)):
        grid[y][x] = HIGHLIGHT

    sparkle = {(11, 3), (10, 4), (11, 4), (12, 4), (11, 5)}
    for x, y in sparkle:
        grid[y][x] = HIGHLIGHT

    return grid


def scale_grid(grid: list[list[tuple[int, int, int, int]]], size: int) -> list[list[tuple[int, int, int, int]]]:
    logical = len(grid)
    return [
        [
            grid[min(logical - 1, y * logical // size)][min(logical - 1, x * logical // size)]
            for x in range(size)
        ]
        for y in range(size)
    ]


def bitmap_bytes(size: int, pixels: list[list[tuple[int, int, int, int]]]) -> bytes:
    row_bytes = size * 4
    xor_data = bytearray()
    for row in reversed(pixels):
        for red, green, blue, alpha in row:
            xor_data.extend((blue, green, red, alpha))

    mask_row_bytes = ((size + 31) // 32) * 4
    and_mask = bytes(mask_row_bytes * size)
    header = pack(
        "<IIIHHIIIIII",
        40,
        size,
        size * 2,
        1,
        32,
        0,
        row_bytes * size,
        0,
        0,
        0,
        0,
    )
    return header + xor_data + and_mask


def write_icon() -> None:
    logical_grid = build_logical_grid()
    images = []
    for size in SIZES:
        scaled = scale_grid(logical_grid, size)
        bmp = bitmap_bytes(size, scaled)
        images.append((size, bmp))

    ICON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with ICON_PATH.open("wb") as handle:
        handle.write(pack("<HHH", 0, 1, len(images)))

        offset = 6 + len(images) * 16
        entries = []
        for size, bmp in images:
            width_byte = 0 if size >= 256 else size
            height_byte = 0 if size >= 256 else size
            entries.append(pack("<BBBBHHII", width_byte, height_byte, 0, 0, 1, 32, len(bmp), offset))
            offset += len(bmp)

        for entry in entries:
            handle.write(entry)

        for _, bmp in images:
            handle.write(bmp)


if __name__ == "__main__":
    write_icon()
    print(f"Generated pixel icon at {ICON_PATH}")
