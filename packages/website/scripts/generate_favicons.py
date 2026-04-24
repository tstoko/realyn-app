#!/usr/bin/env python3
"""Regenerate favicon and PWA icons from public/r-logo.png (run from repo root)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "r-logo.png"
OUT = ROOT / "public"
BG = (0, 0, 0, 255)


def square_icon(src: Image.Image, size: int, pad_ratio: float = 0.12) -> Image.Image:
    """Center-fit `src` into a size×size RGBA image with solid background."""
    canvas = Image.new("RGBA", (size, size), BG)
    inner = max(1, int(size * (1 - 2 * pad_ratio)))
    fitted = src.copy()
    fitted.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source: {SRC}")
    src = Image.open(SRC).convert("RGBA")

    square_icon(src, 16).save(OUT / "favicon-16x16.png", optimize=True)
    square_icon(src, 32).save(OUT / "favicon-32x32.png", optimize=True)
    square_icon(src, 180).save(OUT / "apple-touch-icon.png", optimize=True)
    img192 = square_icon(src, 192)
    img192.save(OUT / "android-chrome-192x192.png", optimize=True)
    img192.save(OUT / "logo192.png", optimize=True)
    img512 = square_icon(src, 512)
    img512.save(OUT / "android-chrome-512x512.png", optimize=True)
    img512.save(OUT / "logo512.png", optimize=True)

    i16 = square_icon(src, 16).convert("RGBA")
    i32 = square_icon(src, 32).convert("RGBA")
    i48 = square_icon(src, 48).convert("RGBA")
    i16.save(
        OUT / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[i32, i48],
    )

    print(
        "Wrote favicon.ico, favicon-*.png, apple-touch-icon.png, "
        "android-chrome-*.png, logo192.png, logo512.png"
    )


if __name__ == "__main__":
    main()
