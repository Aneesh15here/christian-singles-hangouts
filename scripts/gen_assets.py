#!/usr/bin/env python3
"""
Regenerates og-image.png, qr.png, and the social promo graphics from the
app's current branding.

Run this any time the app name, tagline, or domain changes (see SITE_URL
in app.js and the brand strings below) so the social-share card, the
printable/scannable QR code, and the promo graphics stay in sync with the
live site.

Usage:
    python3 -m venv /tmp/gen-assets-venv
    /tmp/gen-assets-venv/bin/pip install pillow qrcode
    /tmp/gen-assets-venv/bin/python3 scripts/gen_assets.py

Requires: pillow, qrcode  (not part of the app's runtime — dev-only tools)
"""
import os

import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- brand ------------------------------------------------------------ ---
SITE_URL = "https://soulfulgather.com/"
DOMAIN_LABEL = "soulfulgather.com"
BRAND_NAME = "Soulful Gather"
TAGLINE = "Meaningful gatherings that nourish the soul."
DESCRIPTION = "Hikes, coffee, game nights, Bible study"
EYEBROW = "A CHRISTIAN COMMUNITY, OPEN TO EVERYONE"
HOOK_LINE = "Less scrolling, more showing up."

# Matches style.css custom properties.
INK = "#2b2320"
INK_SOFT = "#6f6459"
CREAM = "#fdf6ee"
ORANGE = "#e05e3d"
ROSE = "#d24b74"
# Muted cream for secondary text on the gradient promo backgrounds — a
# pre-mixed tone rather than a transparent fill, since the promo images are
# flattened to RGB (alpha in a draw.text fill doesn't blend against a
# varying gradient background once the alpha channel is discarded).
CREAM_MUTED = "#f0ddc7"

# Matches icon.svg (the app's favicon/PWA icon) — reused here as a small
# brand mark on the promo graphics.
ICON_BG = "#c1694f"
ICON_CREAM = "#fdf8f1"
ICON_GOLD = "#e8b854"

FONT_DIR = "/System/Library/Fonts/Supplemental"
FONT_TITLE = os.path.join(FONT_DIR, "Arial Rounded Bold.ttf")
FONT_BOLD = os.path.join(FONT_DIR, "Arial Bold.ttf")
FONT_ITALIC = os.path.join(FONT_DIR, "Arial Italic.ttf")


def _lerp_color(c1, c2, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))


def _hex(c):
    return tuple(int(c.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))


def _diagonal_gradient(width, height, c1, c2, res=64):
    """Same top-left -> bottom-right blend as the CSS 120deg brand gradient,
    computed at low res and upscaled (fast, and the smooth blend upsamples
    cleanly since gradients have no fine detail)."""
    small = Image.new("RGB", (res, res))
    px = small.load()
    for y in range(res):
        for x in range(res):
            t = (x / res * 0.5) + (y / res * 0.5)
            px[x, y] = _lerp_color(c1, c2, min(max(t, 0), 1))
    return small.resize((width, height), Image.BILINEAR)


def _fit_font(draw, text, font_path, max_width, start_size, min_size=20, step=2):
    """Shrinks font size until `text` fits within max_width."""
    size = start_size
    while size > min_size:
        font = ImageFont.truetype(font_path, size)
        bbox = draw.textbbox((0, 0), text, font=font)
        if bbox[2] - bbox[0] <= max_width:
            return font
        size -= step
    return ImageFont.truetype(font_path, min_size)


def _wrap_text(draw, text, font, max_width):
    """Greedy word-wrap; returns a list of lines that each fit max_width."""
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _draw_centered(draw, y, text, font, fill, canvas_width):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    draw.text(((canvas_width - w) / 2, y), text, font=font, fill=fill)
    return bbox[3] - bbox[1]


def _draw_wrapped_centered(draw, y, text, font, fill, canvas_width, max_width, line_gap=10):
    """Word-wraps `text` to max_width and draws each line centered on
    canvas_width, starting at y. Returns the total height consumed."""
    lines = _wrap_text(draw, text, font, max_width)
    total = 0
    for line in lines:
        h = _draw_centered(draw, y + total, line, font, fill, canvas_width)
        total += h + line_gap
    return total - line_gap if lines else 0


def _draw_icon_badge(draw, cx, cy, size):
    """Draws the app's icon.svg brand mark (two heads over a shoulders
    curve, on a rounded-square badge) centered at (cx, cy)."""
    scale = size / 128
    left, top = cx - size / 2, cy - size / 2

    def pt(x, y):
        return (left + x * scale, top + y * scale)

    draw.rounded_rectangle(
        [pt(0, 0), pt(128, 128)], radius=28 * scale, fill=_hex(ICON_BG)
    )
    r = 16 * scale
    c1x, c1y = pt(46, 56)
    draw.ellipse([c1x - r, c1y - r, c1x + r, c1y + r], fill=_hex(ICON_CREAM))
    c2x, c2y = pt(82, 56)
    draw.ellipse([c2x - r, c2y - r, c2x + r, c2y + r], fill=_hex(ICON_GOLD))
    arc_box = [pt(24, 68), pt(104, 148)]
    draw.arc(arc_box, start=200, end=340, fill=_hex(ICON_CREAM), width=round(8 * scale))


def _promo_background(width, height):
    """Full-bleed brand gradient with a couple of soft blurred blobs for
    depth, echoing the site's .hero-blob / .hero-glow treatment."""
    base = _diagonal_gradient(width, height, _hex(ORANGE), _hex(ROSE)).convert("RGBA")

    blobs = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(blobs)
    blob_r = width * 0.42
    bdraw.ellipse(
        [-blob_r * 0.5, -blob_r * 0.5, blob_r * 1.1, blob_r * 1.1],
        fill=(*_hex(CREAM), 60),
    )
    bdraw.ellipse(
        [width - blob_r * 0.8, height - blob_r * 0.9, width + blob_r * 0.6, height + blob_r * 0.7],
        fill=(*_hex(ICON_GOLD), 55),
    )
    blobs = blobs.filter(ImageFilter.GaussianBlur(width * 0.05))

    return Image.alpha_composite(base, blobs)


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


def _domain_pill(draw, cx, y, canvas_width, font, pad_x=44, pad_y=22):
    """Cream rounded pill with the domain in ink, like a CTA button —
    matches the .btn-primary/.btn-ghost pill shape used across the app."""
    bbox = draw.textbbox((0, 0), DOMAIN_LABEL, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    pill_w, pill_h = text_w + pad_x * 2, text_h + pad_y * 2
    left = cx - pill_w / 2
    draw.rounded_rectangle(
        [left, y, left + pill_w, y + pill_h], radius=pill_h / 2, fill=_hex(CREAM)
    )
    draw.text(
        (cx - text_w / 2, y + pad_y - bbox[1]), DOMAIN_LABEL, font=font, fill=_hex(INK)
    )
    return pill_h


def gen_promo_square(path=None, size=1080):
    """Instagram feed square (1:1) launch/promo graphic: full-bleed brand
    gradient, icon mark, name, tagline, and a domain pill CTA."""
    path = path or os.path.join(ROOT, "promo-square.png")
    img = _promo_background(size, size)
    draw = ImageDraw.Draw(img)
    max_w = size * 0.82

    _draw_icon_badge(draw, size / 2, size * 0.2, size * 0.16)

    eyebrow_font = ImageFont.truetype(FONT_BOLD, round(size * 0.026))
    title_font = _fit_font(draw, BRAND_NAME, FONT_TITLE, max_w, round(size * 0.125))
    tagline_font = ImageFont.truetype(FONT_ITALIC, round(size * 0.042))
    desc_font = ImageFont.truetype(FONT_BOLD, round(size * 0.032))
    cta_font = ImageFont.truetype(FONT_TITLE, round(size * 0.05))
    pill_font = ImageFont.truetype(FONT_BOLD, round(size * 0.032))

    y = size * 0.36
    y += _draw_centered(draw, y, EYEBROW, eyebrow_font, _hex(CREAM), size) + size * 0.038
    y += _draw_centered(draw, y, BRAND_NAME, title_font, _hex(CREAM), size) + size * 0.05
    y += _draw_wrapped_centered(draw, y, TAGLINE, tagline_font, _hex(CREAM_MUTED), size, max_w) + size * 0.026
    y += _draw_wrapped_centered(draw, y, DESCRIPTION, desc_font, _hex(CREAM_MUTED), size, max_w) + size * 0.09

    _draw_centered(draw, y, "Join us — it's free", cta_font, _hex(CREAM), size)

    _domain_pill(draw, size / 2, size * 0.83, size, pill_font)

    img.convert("RGB").save(path)
    print(f"Wrote {path} ({size}x{size})")


def gen_promo_story(path=None, width=1080, height=1920):
    """Instagram/Facebook Story-sized (9:16) vertical promo graphic with a
    short hook line, for full-screen story posting."""
    path = path or os.path.join(ROOT, "promo-story.png")
    img = _promo_background(width, height)
    draw = ImageDraw.Draw(img)
    max_w = width * 0.84

    _draw_icon_badge(draw, width / 2, height * 0.16, width * 0.2)

    eyebrow_font = ImageFont.truetype(FONT_BOLD, round(width * 0.032))
    title_font = _fit_font(draw, BRAND_NAME, FONT_TITLE, max_w, round(width * 0.145))
    tagline_font = ImageFont.truetype(FONT_ITALIC, round(width * 0.044))
    hook_font = _fit_font(draw, HOOK_LINE, FONT_TITLE, max_w, round(width * 0.072))
    pill_font = ImageFont.truetype(FONT_BOLD, round(width * 0.038))
    note_font = ImageFont.truetype(FONT_BOLD, round(width * 0.026))

    y = height * 0.27
    y += _draw_centered(draw, y, EYEBROW, eyebrow_font, _hex(CREAM), width) + height * 0.026
    y += _draw_centered(draw, y, BRAND_NAME, title_font, _hex(CREAM), width) + height * 0.05
    y += _draw_wrapped_centered(draw, y, TAGLINE, tagline_font, _hex(CREAM_MUTED), width, max_w) + height * 0.1

    # Thin divider to separate the name block from the hook line below it.
    rule_w = width * 0.14
    draw.line([(width / 2 - rule_w / 2, y), (width / 2 + rule_w / 2, y)], fill=_hex(CREAM), width=round(height * 0.004))
    y += height * 0.045

    _draw_wrapped_centered(draw, y, HOOK_LINE, hook_font, _hex(CREAM), width, max_w, line_gap=height * 0.012)

    pill_y = height * 0.78
    pill_h = _domain_pill(draw, width / 2, pill_y, width, pill_font)
    note_font_y = pill_y + pill_h + height * 0.022
    _draw_centered(draw, note_font_y, "Free to join · takes about a minute", note_font, _hex(CREAM_MUTED), width)

    img.convert("RGB").save(path)
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
    gen_promo_square()
    gen_promo_story()
