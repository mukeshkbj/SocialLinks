# Synthesises a soft music bed + mouse-click sounds timed to the video. Output: audio.wav (48 kHz stereo)
import numpy as np, wave
SR = 48000
DUR = [4.5, 4.2, 12, 5.4, 8, 13, 5.5, 6, 5.2, 6.5, 6.5]
T = sum(DUR); N = int(T * SR); t = np.arange(N) / SR
start = np.cumsum([0] + DUR[:-1])
# clicks (scene index, time in scene) — mirror clickRing() calls in stage.html
CLICKS = [(2, .65), (2, 4.6), (2, 9.6), (3, .85), (3, 3.75), (4, 1.15), (4, 4.45), (5, .9), (5, 3.95), (5, 6.95), (5, 10.2), (6, 1.7)]
PASTE = []   # Paste here types the link in on the click itself

def note(f): return 440 * 2 ** ((f - 69) / 12)
# I – vi – IV – V in D major, 4 s per chord, warm pad (sine + soft 2nd/3rd harmonics)
CHORDS = [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]]
pad = np.zeros(N); L = 4.0
for k in range(int(np.ceil(T / L)) + 1):
    a = k * L; seg = (t >= a - .8) & (t < a + L + .8)
    if not seg.any(): continue
    tt = t[seg] - a
    env = np.clip((tt + .8) / 1.6, 0, 1) * np.clip((L + .8 - tt) / 1.6, 0, 1)
    env = np.sin(env * np.pi / 2) ** 2
    s = np.zeros(seg.sum())
    for m in CHORDS[k % 4]:
        f = note(m)
        for h, g in ((1, 1), (2, .25), (3, .08)):
            s += g * np.sin(2 * np.pi * f * h * tt + m) * (1 + .15 * np.sin(2 * np.pi * .3 * tt + m))
    pad[seg] += s * env
pad /= np.abs(pad).max()
# soft bell arpeggio on 8th notes at 100 bpm, quiet
bell = np.zeros(N); step = 60 / 100 / 2
for i in range(int(T / step)):
    a = i * step; ch = CHORDS[int(a // L) % 4]
    f = note(ch[[2, 3, 4, 3][i % 4]] + 12)
    n0 = int(a * SR); n = min(int(1.2 * SR), N - n0)
    if n <= 0: break
    tt = np.arange(n) / SR
    bell[n0:n0 + n] += (np.sin(2 * np.pi * f * tt) + .3 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt * 4.5) * (.55 if i % 4 else .8)
bell /= np.abs(bell).max()
music = .55 * pad + .22 * bell
# fades: in 1 s, out 2.5 s
music *= np.clip(t / 1.0, 0, 1) * np.clip((T - t) / 2.5, 0, 1)
music *= 10 ** (-16 / 20)

sfx = np.zeros(N)
rng = np.random.default_rng(7)
def click(at, gain=.5, tone=2400):
    n0 = int(at * SR); n = int(.035 * SR)
    tt = np.arange(n) / SR
    c = (rng.standard_normal(n) * .5 + np.sin(2 * np.pi * tone * tt)) * np.exp(-tt * 180)
    sfx[n0:n0 + n] += gain * c[: max(0, min(n, N - n0))]
for s, x in CLICKS: click(start[s] + x)
for s, x in PASTE: click(start[s] + x, .35, 1500); click(start[s] + x + .07, .3, 1800)
mix = music + .35 * sfx
mix /= max(1, np.abs(mix).max() / .9)
st = np.stack([mix, mix * .98], 1)
with wave.open('audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print('audio', round(T, 2), 's')
