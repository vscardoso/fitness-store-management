"""Gera as telas de abertura do iPhone (apple-touch-startup-image) em public/splash/.
Fundo roxo do app e o ícone no meio, para o app instalado não piscar branco ao abrir.
Uso: python scripts/gen-splash.py   (depois o pwa-postbuild.js liga as imagens no index.html)"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'splash')
ICON = os.path.join(HERE, '..', 'public', 'icon-512.png')
BG = (124, 58, 237)  # #7C3AED, o mesmo theme-color do app

# (largura pt, altura pt, escala): iPhones em retrato
DEVICES = [(440, 956, 3), (402, 874, 3), (430, 932, 3), (393, 852, 3), (428, 926, 3), (390, 844, 3),
           (414, 896, 3), (414, 896, 2), (375, 812, 3), (375, 667, 2)]

os.makedirs(OUT, exist_ok=True)
icon = Image.open(ICON).convert('RGB')
for w, h, s in DEVICES:
    W, H = w * s, h * s
    size = int(W * 0.30)
    img = Image.new('RGB', (W, H), BG)
    ic = icon.resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    img.paste(ic, ((W - size) // 2, (H - size) // 2), mask)
    path = os.path.join(OUT, f'{W}x{H}.png')
    img.save(path, optimize=True)
    print(f'{W}x{H}', os.path.getsize(path) // 1024, 'KB')
