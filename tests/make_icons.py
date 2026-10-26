from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

ROOT = Path(__file__).resolve().parents[1]
SIZE = 512
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def font(size, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def base(accent=(125, 231, 255), accent2=(109, 140, 255)):
    im = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    px = im.load()
    for y in range(SIZE):
        for x in range(SIZE):
            t = (x + y) / (SIZE * 2)
            px[x, y] = (int(18 - 10*t), int(28 - 15*t), int(45 - 24*t), 255)
    mask = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((14, 14, 498, 498), radius=112, fill=255)
    im.putalpha(mask)
    glow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-100, -130, 330, 300), fill=accent + (75,))
    gd.ellipse((270, 260, 650, 640), fill=accent2 + (52,))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((15, 15, 497, 497), radius=111, outline=(170, 220, 255, 70), width=3)
    d.rounded_rectangle((30, 30, 482, 482), radius=96, outline=(255, 255, 255, 12), width=2)
    return im


def centered(draw, xy, text, fnt, fill):
    box = draw.textbbox((0, 0), text, font=fnt)
    draw.text((xy[0] - (box[2]-box[0])/2, xy[1] - (box[3]-box[1])/2 - box[1]), text, font=fnt, fill=fill)


def creator_icon():
    im = base()
    # Soft accent glow behind the composition.
    glow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.rounded_rectangle((153, 77, 359, 393), radius=42, outline=(125, 231, 255, 110), width=14)
    glow = glow.filter(ImageFilter.GaussianBlur(22))
    im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im)
    # 9:16 frame, intentionally subtle behind the four vehicle circles.
    d.rounded_rectangle((159, 70, 353, 397), radius=35, fill=(3, 12, 22, 105), outline=(125, 231, 255, 115), width=4)
    d.rounded_rectangle((222, 82, 290, 88), radius=3, fill=(170, 225, 255, 80))
    centers = [(211, 176), (301, 176), (211, 276), (301, 276)]
    for i, (x, y) in enumerate(centers):
        d.ellipse((x-39, y-39, x+39, y+39), fill=(10, 25, 38, 235), outline=(178, 230, 255, 205), width=5)
        d.ellipse((x-28, y-28, x+28, y+28), outline=(125, 231, 255, 42), width=2)
        # Minimal vehicle silhouette inside every circle.
        d.rounded_rectangle((x-20, y-4, x+20, y+10), radius=5, fill=(179, 218, 235, 170))
        d.polygon([(x-13, y-4), (x-7, y-14), (x+9, y-14), (x+17, y-4)], fill=(179, 218, 235, 170))
        d.ellipse((x-15, y+7, x-7, y+15), fill=(5, 13, 22, 255))
        d.ellipse((x+7, y+7, x+15, y+15), fill=(5, 13, 22, 255))
    # PASS and FAIL marks are part of the product identity, not a HUD redesign.
    x, y = centers[0]
    d.line((x-17, y+1, x-5, y+14, x+20, y-17), fill=(104, 239, 174, 255), width=8, joint='curve')
    x, y = centers[3]
    d.line((x-15, y-15, x+15, y+15), fill=(255, 124, 140, 255), width=8)
    d.line((x+15, y-15, x-15, y+15), fill=(255, 124, 140, 255), width=8)
    centered(d, (256, 434), 'CREATORPACK', font(31), (232, 246, 255, 255))
    centered(d, (256, 468), 'STUDIO  •  SHORTS', font(15), (125, 231, 255, 215))
    return im


def save(im, path):
    im = im.resize((256, 256), Image.Resampling.LANCZOS)
    im.save(path, optimize=True)
    print(path, path.stat().st_size, 'bytes')


save(creator_icon(), ROOT / 'CreatorPack/ui/modules/apps/CreatorPack/app.png')
