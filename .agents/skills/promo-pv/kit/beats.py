# BGM → beats.js: python3 kit/beats.py assets/bgm.wav [END seconds]
# BEATS: tracked beat times (T(bar) = TB(bar * 4) in scenes); KICKS: low-frequency hits (< 150 Hz);
# SAX: high-band melodic onsets (500–2500 Hz). Cut scenes on BEATS; land accents on KICKS / SAX.
import sys, json
import numpy as np, librosa
path = sys.argv[1]; y, sr = librosa.load(path, sr=22050, mono=True)
end = float(sys.argv[2]) if len(sys.argv) > 2 else round(len(y) / sr, 2)
tempo, bt = librosa.beat.beat_track(y=y, sr=sr, units='time')
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512)); f = librosa.fft_frequencies(sr=sr, n_fft=2048)
def band(lo, hi, delta):
    env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[(f >= lo) & (f < hi)]), sr=sr)
    return librosa.onset.onset_detect(onset_envelope=env, sr=sr, units='time', delta=delta)
r = lambda a: [round(float(x), 4) for x in a if x <= end]
out = f'const BEATS = {json.dumps(r(bt))};\nconst KICKS = {json.dumps(r(band(20, 150, 0.25)))};\nconst SAX = {json.dumps(r(band(500, 2500, 0.35)))};\nconst END = {end};\n'
open('beats.js', 'w').write(out); print(f'tempo {float(np.atleast_1d(tempo)[0]):.1f} bpm, {len(bt)} beats, end {end}s → beats.js')
