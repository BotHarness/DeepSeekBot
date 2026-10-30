# BGM + UI sound cues → one wav: python3 kit/mix.py --bgm assets/bgm.wav --events 'out/seg/ev*.json' --total 60 --out mix.wav
import argparse, glob, json, os
import numpy as np, soundfile as sf
ap = argparse.ArgumentParser(); ap.add_argument('--bgm'); ap.add_argument('--events'); ap.add_argument('--total', type=float); ap.add_argument('--out')
ap.add_argument('--sfx', default=os.path.join(os.path.dirname(__file__), '..', 'sfx')); a = ap.parse_args()
SR = 48000; n = int(a.total * SR)
if a.bgm and os.path.exists(a.bgm):
    bgm, sr = sf.read(a.bgm, dtype='float32', always_2d=True); assert sr == SR, 'resample the BGM to 48 kHz first'
    mix = np.tile(bgm, (int(np.ceil(n / len(bgm))), 1))[:n] * 0.9
else:
    mix = np.zeros((n, 2), np.float32)
fade = int(1.2 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
S = {k: sf.read(os.path.join(a.sfx, f'{k}.wav'), dtype='float32', always_2d=True)[0] for k in ['whoosh', 'swish', 'click', 'pop', 'tick']}
lvl = {'whoosh': 0.28, 'swish': 0.24, 'click': 0.42, 'pop': 0.3, 'tick': 0.24}
lead = {'whoosh': 0.25, 'swish': 0.12}
ev = {}
for f in sorted(glob.glob(a.events)): ev.update(json.load(open(f)))
for e in ev.values():
    x = S[e['type']] * lvl[e['type']] * e.get('gain', 1)
    i = max(0, int((e['t'] - lead.get(e['type'], 0)) * SR)); j = min(n, i + len(x)); mix[i:j] += x[: j - i]
peak = np.abs(mix).max(); mix = mix / max(1, peak / 0.95)
sf.write(a.out, mix, SR); print(len(ev), 'cues, peak', round(float(peak), 3))
