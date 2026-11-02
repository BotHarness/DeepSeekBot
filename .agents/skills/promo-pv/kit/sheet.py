# contact sheet of preview frames: python3 kit/sheet.py out/pv out/sheet.jpg [cols]
import sys, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
fs = sorted(f for f in os.listdir(d) if f.endswith('.jpg')); W, H = 480, 270
rows = (len(fs) + cols - 1) // cols; S = Image.new('RGB', (cols * W, rows * (H + 18)), 'white'); dr = ImageDraw.Draw(S)
for i, f in enumerate(fs):
    x, y = i % cols * W, i // cols * (H + 18); S.paste(Image.open(os.path.join(d, f)).resize((W, H)), (x, y + 18)); dr.text((x + 4, y + 3), f, fill='black')
S.save(out, quality=85)
