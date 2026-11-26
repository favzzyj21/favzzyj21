#!/usr/bin/env python3
"""Ambient brand music bed for iCube reels — synthesized, subtle, professional.
Usage: make_bed.py <duration_sec> <out.wav>
Layers: warm chord pad (Am9 <-> Fmaj9 crossfade), soft sub pulse on beats,
        quiet arpeggio plucks, airy noise shimmer. Master: fades + soft clip.
"""
import sys, wave
import numpy as np

SR = 48000
BPM = 90.0
BEAT = 60.0 / BPM  # 0.6667 s

def env_adsr(n, a, d, s_level, r, sr=SR):
    e = np.ones(n) * s_level
    na, nd, nr = int(a * sr), int(d * sr), int(r * sr)
    na = min(na, n); nd = min(nd, max(n - na, 0)); nr = min(nr, max(n - na - nd, 0))
    if na: e[:na] = np.linspace(0, 1, na)
    if nd: e[na:na + nd] = np.linspace(1, s_level, nd)
    if nr: e[n - nr:] = np.linspace(e[n - nr] if n - nr < n else s_level, 0, nr)
    return e

def pad_chord(freqs, dur, sr=SR):
    n = int(dur * sr)
    t = np.arange(n) / sr
    sig = np.zeros(n)
    for f in freqs:
        for det, amp in ((0.0, 1.0), (+0.0013, 0.55), (-0.0013, 0.55)):
            ph = 2 * np.pi * f * (1 + det) * t
            sig += amp * (np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph))
    sig /= (len(freqs) * 2.4)
    # slow breathing LFO
    sig *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t)
    return sig

def pluck(f, dur=0.42, sr=SR):
    n = int(dur * sr)
    t = np.arange(n) / sr
    sig = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    return sig * np.exp(-t * 7.5)

def sub_kick(dur=0.30, sr=SR):
    n = int(dur * sr)
    t = np.arange(n) / sr
    f = 58 * np.exp(-t * 9) + 42
    ph = 2 * np.pi * np.cumsum(f) / sr
    return np.sin(ph) * np.exp(-t * 10)

def onepole_lp(x, cutoff, sr=SR):
    a = np.exp(-2 * np.pi * cutoff / sr)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y

def make(duration, out_path):
    n_total = int(duration * SR)
    t_total = np.arange(n_total) / SR
    L = np.zeros(n_total); R = np.zeros(n_total)

    # ── chord pad: Am9 -> Fmaj9 -> Am9,1.4s crossfades
    AM9 = [220.00, 261.63, 329.63, 493.88]   # A3 C4 E4 B4
    FM9 = [174.61, 220.00, 261.63, 329.63]   # F3 A3 C4 E4
    seg = duration / 2.0
    xf = 1.4
    for (f0, f1, chord_a, chord_b) in [
        (0.0, seg, AM9, FM9),
        (seg, duration, FM9, AM9),
    ]:
        s, e = int(f0 * SR), min(int(f1 * SR), n_total)
        if s >= n_total: break
        n = e - s
        if n <= 0: continue
        pad_a = pad_chord(chord_a, n / SR + xf)[:n]
        pad_b = pad_chord(chord_b, n / SR + xf)[:n]
        w = np.clip(np.arange(n) / (xf * SR), 0, 1)          # fade a -> b across segment
        pad = pad_a * (1 - w) + pad_b * w
        pad *= env_adsr(n, 0.8, 0.2, 1.0, 1.2)
        L[s:e] += pad * 0.34
        # slight stereo width (haas)
        d = int(0.012 * SR)
        R[s:e] += pad * 0.34
        if e + d <= n_total:
            R[s + d:e + d] += pad * 0.34 * 0.5
            L[s + d:e + d] += pad * 0.34 * 0.15

    # ── sub pulse every beat
    beat_t = 0.0
    k = 0
    while beat_t < duration - 0.05:
        s = int(beat_t * SR)
        kk = sub_kick()
        e = min(s + len(kk), n_total)
        amp = 0.20 if k % 4 == 0 else 0.13
        L[s:e] += kk[:e - s] * amp
        R[s:e] += kk[:e - s] * amp
        beat_t += BEAT; k += 1

    # ── arpeggio plucks on eighths, cycling chord tones, panned alternately
    arp_t = BEAT / 2
    j = 0
    while arp_t < duration - 0.1:
        chord = AM9 if (arp_t < seg) else FM9
        f = chord[j % len(chord)] * 2.0   # octave up
        p = pluck(f)
        s = int(arp_t * SR)
        e = min(s + len(p), n_total)
        amp = 0.055 if j % 2 == 0 else 0.04
        if j % 4 == 2: amp *= 1.3         # gentle accent
        seg_p = p[:e - s] * amp
        if j % 2 == 0:
            L[s:e] += seg_p * 1.0; R[s:e] += seg_p * 0.55
        else:
            L[s:e] += seg_p * 0.55; R[s:e] += seg_p * 1.0
        arp_t += BEAT / 2; j += 1

    # ── air shimmer (lowpassed noise, slow LFO)
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(n_total)
    air = onepole_lp(noise, 3200) * 0.05
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t_total)
    air *= lfo
    L += air; R += air * 0.9

    # ── master: fade in/out, soft clip, normalize peak
    fade_in = int(0.8 * SR); fade_out = int(1.4 * SR)
    for ch in (L, R):
        ch[:fade_in] *= np.linspace(0, 1, fade_in)
        ch[-fade_out:] *= np.linspace(1, 0, fade_out)
    mix = np.stack([L, R])
    mix = np.tanh(mix * 1.15) * 0.9
    peak = np.max(np.abs(mix)) or 1.0
    mix = mix / peak * 0.62                      # ~ -4.2 dBFS peak headroom for VO

    data = (mix.T * 32767).astype(np.int16)
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(data.tobytes())
    rms = 20 * np.log10(np.sqrt(np.mean((mix ** 2))) + 1e-9)
    print(f'wrote {out_path}: {duration}s peak={20*np.log10(np.max(np.abs(mix))):.1f} dBFS rms={rms:.1f} dBFS')

if __name__ == '__main__':
    make(float(sys.argv[1]), sys.argv[2])
