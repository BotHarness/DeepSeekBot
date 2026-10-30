# Synthesized UI sounds (whoosh, swish, click, pop, tick): python3 kit/sfx.py sfx
import os, sys
import numpy as np, soundfile as sf
OUT = sys.argv[1] if len(sys.argv) > 1 else 'sfx'; os.makedirs(OUT, exist_ok=True)
SR = 48000
def env(n, a, d): t = np.arange(n) / SR; return np.minimum(1, t / a) * np.exp(-t / d)
def bp_noise(n, lo, hi, seed=0):
    rng = np.random.default_rng(seed); x = rng.standard_normal(n)
    X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, n)
def whoosh(dur=0.55, seed=1):
    n = int(SR * dur); t = np.arange(n) / SR
    out = np.zeros(n); steps = 24
    for i in range(steps):  # sweep a band upward then down
        c = 500 + 2600 * np.sin(np.pi * i / steps)
        seg = bp_noise(n, c * 0.7, c * 1.3, seed + i)
        w = np.exp(-((t - dur * i / steps) / (dur / steps * 1.4)) ** 2)
        out += seg * w
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
    return out / np.abs(out).max() * shape * 0.5
def swish(dur=0.32, seed=7):
    w = whoosh(dur, seed); return w * 0.8
def click():
    n = int(SR * 0.05); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * 2900 * t) * np.exp(-t / 0.006) + 0.4 * np.sin(2 * np.pi * 1400 * t) * np.exp(-t / 0.012)
    s[:30] += np.random.default_rng(3).standard_normal(30) * 0.6
    return s * 0.45
def pop():
    n = int(SR * 0.12); t = np.arange(n) / SR
    f = 380 + 700 * np.exp(-t / 0.018); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.002, 0.035) * 0.55
def tick():
    n = int(SR * 0.04); t = np.arange(n) / SR
    return np.sin(2 * np.pi * 1900 * t) * env(n, 0.001, 0.008) * 0.35
for name, x in [('whoosh', whoosh()), ('swish', swish()), ('click', click()), ('pop', pop()), ('tick', tick())]:
    sf.write(os.path.join(OUT, f'{name}.wav'), np.stack([x, x], 1).astype(np.float32), SR)
print('ok')
