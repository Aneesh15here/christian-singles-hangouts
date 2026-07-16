#!/usr/bin/env python3
"""
Regenerates og-image.png and qr.png from the app's current branding.

Run this any time the app name, tagline, or domain changes (see SITE_URL
in app.js and the brand strings below) so the social-share card and the
printable/scannable QR code stay in sync with the live site.

Usage:
    python3 -m venv /tmp/gen-assets-venv
    /tmp/gen-assets-venv/bin/pip install pillow qrcode
    /tmp/gen-assets-venv/bin/python3 scripts/gen_assets.py

Requires: pillow, qrcode  (not part of the app's runtime — dev-only tools)
"""
import os

import qrcode
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- brand ----------------------------------------------------------------
SITE_URL = "https://soulfulgather.com/"
DOMAIN_LABEL = "soulfulgather.com"
BRAND_NAME = "Soulful Gather"
TAGLINE = "Meaningful gatherings that nourish the soul."
DESCRIPTION = "Hikes, coffee, game nights, Bible study"

# Matches style.css custom properties.
INK = "#2b2320"
INK_SOFT = "#6f6459"
CREAM = "#fdf6ee"
ORANGE = "#e05e3d"
ROSE = "#d24b74"

FONT_DIR = "/System/Library/Fonts/Supplemental"
FONT_TITLE = os.path.join(FONT_DIR, "Arial Rounded Bold.ttf")
FONT_BOLD = os.path.join(FONT_DIR, "Arial Bold.ttf")


def _lerp_color(c1, c2, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))


def _hex(c):
    return tuple(int(c.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))


def gen_og_image(path=None, width=1200, height=630):
    """Social share card: brand gradient background, cream rounded panel,
    title + tagline + description + domain, matching the site's
    `--grad: linear-gradient(120deg, #e05e3d, #d24b74)` and card styling."""
    path = path or os.path.join(ROOT, "og-image.png")

    img = Image.new("RGB", (width, height), ORANGE)
    px = img.load()
    c1, c2 = _hex(ORANGE), _hex(ROSE)
    # Approximate the CSS 120deg gradient as a diagonal top-left -> bottom-right blend.
    for y in range(height):
        for x in range(width):
            t = (x / width * 0.5) + (y / height * 0.5)
            px[x, y] = _lerp_color(c1, c2, min(max(t, 0), 1))

    draw = ImageDraw.Draw(img)

    # Cream rounded card
    margin_x, margin_y = 48, 40
    card_box = (margin_x, margin_y, width - margin_x, height - margin_y)
    draw.rounded_rectangle(card_box, radius=40, fill=_hex(CREAM))

    title_font = ImageFont.truetype(FONT_TITLE, 80)
    tagline_font = ImageFont.truetype(FONT_BOLD, 34)
    desc_font = ImageFont.truetype(FONT_BOLD, 36)
    domain_font = ImageFont.truetype(FONT_BOLD, 32)

    def centered_text(y, text, font, fill):
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        draw.text(((width - w) / 2, y), text, font=font, fill=fill)
        return bbox[3] - bbox[1]

    y = 120
    y += centered_text(y, BRAND_NAME, title_font, _hex(INK)) + 36
    y += centered_text(y, TAGLINE, tagline_font, _hex(ORANGE)) + 30
    y += centered_text(y, DESCRIPTION, desc_font, _hex(INK_SOFT)) + 46
    centered_text(y, DOMAIN_LABEL, domain_font, _hex(INK))

    img.save(path)
    print(f"Wrote {path} ({width}x{height})")


def gen_qr(path=None, url=SITE_URL, box_size=22, border=4):
    """Branded QR code (ink-on-cream) pointing at the live site root, matching
    the SITE_URL constant used for share links in app.js."""
    path = path or os.path.join(ROOT, "qr.png")

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color=INK, back_color=CREAM).convert("RGB")
    img.save(path)
    print(f"Wrote {path} ({img.size[0]}x{img.size[1]}) encoding {url!r}")


if __name__ == "__main__":
    gen_og_image()
    gen_qr()
