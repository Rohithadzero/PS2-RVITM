import numpy as np, wave
SR = 44100; DUR = 48.0; N = int(SR * DUR)
rng = np.random.default_rng(7)
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)
BEAT = 0.5

def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    sig = sig[: N - i]
    L[i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))

def env(n, a, d):  # attack, exp decay (seconds)
    x = np.arange(n) / SR
    return np.minimum(1, x / max(a, 1e-4)) * np.exp(-x / d)

def lowpass(x, fc):  # one-pole, fc may be array
    fc = np.broadcast_to(fc, x.shape)
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); s = 0.0
    for k in range(len(x)):
        s += a[k] * (x[k] - s); y[k] = s
    return y

def kick(g=1.0):
    n = int(0.45 * SR); x = np.arange(n) / SR
    f = 45 + 110 * np.exp(-x / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-x / 0.22) + 0.3 * rng.standard_normal(n) * np.exp(-x / 0.004)
    return np.tanh(1.6 * s) * g

def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    s = rng.standard_normal(n); s = s - lowpass(s, 7000)
    return s * env(n, 0.001, 0.09 if open_ else 0.018)

def clap():
    n = int(0.3 * SR); s = rng.standard_normal(n); s = lowpass(s - lowpass(s, 900), 5000)
    e = np.zeros(n)
    for o in (0, 0.011, 0.022): e[int(o * SR):] += env(n - int(o * SR), 0.001, 0.012)
    e += 0.6 * env(n, 0.001, 0.09)
    return s * e

def saw_additive(freq, n, harm=14, bright=7.0):
    x = np.arange(n) / SR; s = np.zeros(n)
    for h in range(1, harm + 1):
        if freq * h > 12000: break
        s += np.sin(2 * np.pi * freq * h * x + h) / h * np.exp(-h / bright)
    return s

def note(m): return 440 * 2 ** ((m - 69) / 12)

# A minor: Am - F - C - G, one chord per bar (2 s)
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]]
ROOTS = [45, 41, 48, 43]

kick_times = []
def section(T):
    if T < 4: return 'intro'
    if T < 10: return 'drive'
    if T < 16: return 'light'
    if T < 30: return 'full'
    if T < 36: return 'tension'
    if T < 42: return 'full'
    return 'outro'

# drums
for b in range(int(DUR / BEAT)):
    T = b * BEAT; sec = section(T)
    if sec in ('drive', 'full', 'tension') or (sec == 'light' and b % 2 == 0):
        add(kick(), T, 0.95); kick_times.append(T)
    if sec in ('drive', 'full', 'light'):
        add(hat(), T + 0.25, 0.22, 0.3)
        if sec == 'full': add(hat(), T + 0.125, 0.08, -0.3); add(hat(), T + 0.375, 0.08, -0.3)
    if sec in ('full', 'drive') and b % 2 == 1: add(clap(), T, 0.45, -0.1)
    if sec == 'tension': add(hat(True), T + 0.25, 0.12, 0.2)

# sidechain envelope
sc = np.ones(N)
for kt in kick_times:
    i = int(kt * SR); n = min(int(0.4 * SR), N - i)
    x = np.arange(n) / SR
    sc[i:i + n] = np.minimum(sc[i:i + n], 1 - 0.75 * np.exp(-x / 0.12))

# pad + bass
pad = np.zeros(N); bass = np.zeros(N)
for bar in range(int(DUR / 2)):
    T = bar * 2.0; k = bar % 4; n = int(2.0 * SR)
    sec = section(T)
    if T >= 45: break
    e = np.minimum(1, np.arange(n) / (0.08 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.1 * SR))
    pg = 0.5 if sec == 'intro' else 0.35
    for m in CHORDS[k]:
        for det in (-0.07, 0.07):
            pad[int(T * SR):int(T * SR) + n] += saw_additive(note(m + 12) * 2 ** (det / 12), n, 12, 4.0) * e * pg / 6
    if sec != 'intro':
        f = note(ROOTS[k] - 12); x = np.arange(n) / SR
        pat = [0, 0.75, 1.0, 1.5] if sec != 'light' else [0, 1.0]
        for o in pat:
            i0 = int((T + o) * SR); nn = int(0.42 * SR); xx = np.arange(nn) / SR
            s = np.sin(2 * np.pi * f * xx) + 0.35 * np.sin(4 * np.pi * f * xx) + 0.15 * np.sin(6 * np.pi * f * xx)
            s = np.tanh(1.8 * s) * env(nn, 0.004, 0.18)
            seg = bass[i0:i0 + nn]; bass[i0:i0 + nn] += s[:len(seg)] * 0.55
# intro swell
pad *= np.where(t < 4, np.clip(t / 3.0, 0, 1), 1)
L += pad * sc; R += pad * sc
L += bass * sc; R += bass * sc

# arp (S4 and S6): 16ths across the chord
for T0, T1 in ((22.0, 30.0), (36.0, 42.0)):
    s16 = 0.125; k = 0; T = T0
    while T < T1:
        bar = int(T / 2) % 4; ch = CHORDS[bar]
        m = ch[k % 3] + 24 + (12 if (k // 3) % 2 else 0)
        n = int(0.12 * SR); x = np.arange(n) / SR
        s = (np.sin(2 * np.pi * note(m) * x) + 0.3 * np.sin(4 * np.pi * note(m) * x)) * env(n, 0.002, 0.05)
        add(s, T, 0.09, 0.5 * np.sin(k * 0.7)); k += 1; T += s16

# --- sfx ---
def whoosh(dur=0.9, up=True):
    n = int(dur * SR); x = np.arange(n) / n
    s = rng.standard_normal(n)
    fc = 300 + 7000 * (x if up else 1 - x) ** 2
    s = lowpass(s, fc); s = s - lowpass(s, fc * 0.25)
    return s * np.sin(np.pi * x) ** 1.5 * 2.2
def glitch(dur=0.8):
    n = int(dur * SR); out = np.zeros(n)
    for _ in range(70):
        p = rng.random(); i = int(p * n * 0.95)
        dens = np.sin(np.pi * p)
        if rng.random() > dens: continue
        nn = int(0.012 * SR); x = np.arange(nn) / SR
        f = 900 + 3500 * rng.random()
        out[i:i + nn] += np.sign(np.sin(2 * np.pi * f * x)) * env(nn, 0.0005, 0.003)[: len(out[i:i + nn])] * 0.5
    return out
def impact(g=1.0):
    n = int(1.6 * SR); x = np.arange(n) / SR
    b = np.sin(2 * np.pi * (38 + 60 * np.exp(-x / 0.05)) * x) * np.exp(-x / 0.5)
    nz = rng.standard_normal(n); nz = lowpass(nz, 4000) * np.exp(-x / 0.35)
    return np.tanh(1.5 * (b + 0.5 * nz)) * g
def click():
    n = int(0.12 * SR); x = np.arange(n) / SR
    return (np.sin(2 * np.pi * 2400 * x) * np.exp(-x / 0.01) + 0.6 * rng.standard_normal(n) * np.exp(-x / 0.004)) * 0.8
def buzz():
    n = int(0.14 * SR); x = np.arange(n) / SR
    return np.sign(np.sin(2 * np.pi * 120 * x)) * 0.35 * env(n, 0.002, 0.08)
def tick():
    n = int(0.03 * SR); x = np.arange(n) / SR
    return rng.standard_normal(n) * np.exp(-x / 0.004) * 0.25
def riser(dur):
    n = int(dur * SR); x = np.arange(n) / n
    s = lowpass(rng.standard_normal(n), 200 + 6000 * x ** 2)
    return s * x ** 2 * 1.6

for cut in (10, 22, 36): add(whoosh(), cut - 0.45, 0.55)
for cut in (4, 16, 30, 42): add(glitch(), cut - 0.4, 0.55, 0.0); add(whoosh(0.8), cut - 0.4, 0.25)
add(riser(3.6), 0.2, 0.25)
for k in range(18): add(tick(), 0.25 + k * 0.07, 0.5, np.sin(k))  # dots assembling
add(impact(0.7), 4.0)
for tt in (5.5, 6.5, 7.5): add(impact(0.35), tt)
for k in range(16): add(tick(), 11.15 + k * 0.16, 0.8, 0.2)  # transcript typing
add(click(), 19.0, 0.9); add(impact(0.5), 19.0)
add(impact(1.0), 32.5); add(click(), 32.5, 0.6)
add(buzz(), 33.65, 0.6); add(buzz(), 33.82, 0.6)
add(whoosh(0.5, False), 36.2, 0.3)
add(impact(0.45), 40.0); add(impact(0.45), 40.5)
add(riser(2.4), 40.0, 0.2)
for tt in (42.4, 42.9, 43.4): add(impact(0.9), tt); add(kick(), tt, 1.0)
add(whoosh(1.2), 43.95, 0.35)
# final chord with long tail
n = int(3.2 * SR)
fin = sum(saw_additive(note(m + 12), n, 12, 5.0) for m in (57, 60, 64, 69)) * env(n, 0.01, 1.2) * 0.25
add(fin, 45.0, 1.0); add(impact(0.8), 45.0)
for k in range(10): add(np.sin(2 * np.pi * note(81 + [0, 3, 7, 12][k % 4]) * np.arange(int(0.3 * SR)) / SR) * env(int(0.3 * SR), 0.002, 0.12), 45.0 + k * 0.09, 0.08, np.sin(k))

# reverb (FFT convolution with decaying noise IR)
def reverb(x, secs=1.6, mix=0.18):
    n = int(secs * SR); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (secs / 4))
    ir = lowpass(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
    M = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, M) * np.fft.rfft(ir, M), M)[: len(x)]
    return x + mix * y
L = reverb(L); R = reverb(R)

fade = np.clip((DUR - t) / 2.2, 0, 1)
L *= fade; R *= fade
mx = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(1.3 * L / mx) / np.tanh(1.3) * 0.89; R = np.tanh(1.3 * R / mx) / np.tanh(1.3) * 0.89
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', pcm.shape)
