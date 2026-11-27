// iCube Instagram REELS generator v2 (1080x1920, 30fps, H.264 MP4)
// v2: ORIGINAL untouched logo PNG (rule: never re-trace/reform the logo),
//     stylish kinetic typography, direct-address copy, voiceover-synced beats.
// Frame-by-frame SVG scenes -> PNG frames -> ffmpeg encode; audio muxed separately.
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'reels');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const W = 1080, H = 1920, FPS = 30;
// Playback pacing. Everything (motion + voice) is authored at FPS and slowed by
// this factor together, so audio and visuals stay frame-locked in sync.
const TIME_SCALE = 1.08;

const C = { ink: '#03050a', navy: '#06195b', blue: '#3c6bff', mint: '#08deaa', white: '#ffffff' };
const F = { head: 'Poppins', body: 'Space Grotesk', mono: 'JetBrains Mono' };
const HANDLE = '@icubeinnovationslab';

/* ── social marks (same drawings as build.mjs — Instagram, LinkedIn, X) ──
   Client instruction: no "DM us" anywhere. The three marks carry the ask,
   with the handle written beside them in flyer style. */
function social(kind, x, y, col = C.white, s = 1) {
  const st = `stroke="${col}" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const p = {
    instagram:
      `<rect x="3" y="3" width="18" height="18" rx="5.2" ${st}/>` +
      `<circle cx="12" cy="12" r="4.1" ${st}/>` +
      `<circle cx="17.2" cy="6.8" r="1.25" fill="${col}" stroke="none"/>`,
    linkedin:
      `<rect x="3" y="3" width="18" height="18" rx="4" ${st}/>` +
      `<path d="M7.6 10.4v6.1" ${st}/>` +
      `<circle cx="7.6" cy="7.5" r="1.15" fill="${col}" stroke="none"/>` +
      `<path d="M11.6 16.5v-3.3a2.4 2.4 0 0 1 4.8 0v3.3" ${st}/>` +
      `<path d="M11.6 10.4v6.1" ${st}/>`,
    x:
      `<path d="M4.2 3.6h3.1l12.5 16.8h-3.1z" ${st}/>` +
      `<path d="M20.1 3.6 13.2 11.4M10.9 14 3.9 20.4" ${st}/>`,
  }[kind];
  return `<g transform="translate(${x} ${y}) scale(${s})">${p}</g>`;
}
// Three marks + handle, centred on cx. Returns { svg, width }.
function socialRow(cx, y, { size = 34, col = C.white, gap = 42, handleSize = 32, handleCol } = {}) {
  const icons = ['instagram', 'linkedin', 'x'];
  const step = size + gap;
  const handleW = HANDLE.length * handleSize * 0.60;
  const width = icons.length * size + (icons.length - 1) * gap + gap + handleW;
  let out = '';
  let x = cx - width / 2;
  for (const i of icons) {
    out += social(i, x, y, col, size / 24);
    x += step;
  }
  out += text({
    x: x - gap + gap,
    y: y + size * 0.74,
    s: HANDLE,
    size: handleSize,
    ff: F.mono,
    w: 500,
    fill: handleCol || col,
    ls: 1,
    op: 0.9,
  });
  return { svg: out, width };
}

// ── ORIGINAL logo (untouched source PNG — never re-traced) ──
const MARK_PNG = fs.readFileSync(path.join(ASSETS, 'mark-white.png'));
const MARK_B64 = MARK_PNG.toString('base64');
const MARK_W = MARK_PNG.readUInt32BE(16);
const MARK_H = MARK_PNG.readUInt32BE(20);

/* ── helpers ── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; const x = clamp01(t) - 1; return 1 + c3 * x * x * x + c1 * x * x; };
function inOut(t, start, dur, fade = 0.3) {
  if (t < start || t > start + dur) return 0;
  const e = t - start;
  const a = easeOut(e / Math.min(fade, dur / 2));
  const b = 1 - easeOut((e - (dur - fade)) / Math.min(fade, dur / 2));
  return Math.min(a, b, 1);
}
function text({ x, y, s, size = 40, ff = F.body, w = 400, fill = C.white, ls = 0, anchor = 'start', op = 1, italic = false, stroke, sw }) {
  const lsA = ls ? ` letter-spacing="${ls}"` : '';
  const opA = op !== 1 ? ` opacity="${op}"` : '';
  const itA = italic ? ' font-style="italic"' : '';
  const stA = stroke ? ` stroke="${stroke}" stroke-width="${sw ?? 2}"` : '';
  return `<text x="${x}" y="${y}" font-family="${ff}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}"${lsA}${opA}${itA}${stA}>${esc(s)}</text>`;
}
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 0}" fill="${o.fill ?? 'none'}"` +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 1}"` : '') +
  (o.op !== undefined ? ` opacity="${o.op}"` : '') + '/>';
const line = (x1, y1, x2, y2, stroke, sw = 1, op = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`;
const circle = (cx, cy, r, o = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fill ?? 'none'}"` + (o.op !== undefined ? ` opacity="${o.op}"` : '') + '/>';
function markImg({ cx, y, h, op = 1 }) {
  const w = (h * MARK_W) / MARK_H;
  const x = cx - w / 2;
  return `<image href="data:image/png;base64,${MARK_B64}" x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h}" opacity="${op}"/>`;
}
const PILL_FS = 26, PILL_LS = 3, PILL_PAD = 34;
const pillWidth = (label) => Math.round(label.length * PILL_FS * 0.62 + label.length * PILL_LS + PILL_PAD * 2);
function pill(cx, cy, label, { fill, stroke, textColor, h = 74, fs = PILL_FS, ls = PILL_LS, pop = 1, w: forceW }) {
  const wd = forceW ?? (label.length * fs * 0.62 + fs * ls * 0.6) + 56;
  const x = cx - wd / 2;
  const s = 0.86 + 0.14 * pop; // overshoot pop
  const g = `<g transform="translate(${cx} ${cy}) scale(${s.toFixed(3)}) translate(${-cx} ${-cy})" opacity="${clamp01(pop * 1.4).toFixed(3)}">`;
  return g + rect(x, cy - h / 2, wd, h, { r: h / 2, fill: fill ?? 'none', stroke, sw: stroke ? 2 : 0 }) +
    text({ x: cx, y: cy + fs * 0.36, s: label, size: fs, ff: F.mono, w: 700, fill: textColor, anchor: 'middle', ls }) + '</g>';
}
// draw-in underline (stroke-dashoffset grows with progress p 0..1)
function drawRule(x, y, len, p, { stroke = C.mint, sw = 4 } = {}) {
  const L = len + 4;
  const off = L * (1 - clamp01(p));
  return `<line x1="${x}" y1="${y}" x2="${x + len}" y2="${y}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${L}" stroke-dashoffset="${off.toFixed(1)}"/>`;
}

/* ── shared chrome ── */
const defs = `<defs>
  <radialGradient id="gl" cx="50%" cy="50%"><stop offset="0" stop-color="${C.blue}" stop-opacity=".5"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/></radialGradient>
  <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.mint}"/></linearGradient>
</defs>`;
function chrome(t, { pulse = 0.5 } = {}) {
  const dx = (t * 14) % 135;
  let g = `<g opacity="0.05">`;
  for (let x = -135 + dx; x <= W + 135; x += 135) g += line(x, 0, x, H, C.white, 1);
  for (let y = 135; y < H; y += 135) g += line(0, y, W, y, C.white, 1);
  g += '</g>';
  const glowOp = pulse + 0.06 * Math.sin(t * 2.2);
  g += `<ellipse cx="${W * 0.82}" cy="${H * 0.24}" rx="${W * 0.6}" ry="${H * 0.24}" fill="url(#gl)" opacity="${glowOp.toFixed(3)}"/>`;
  g += circle(270, 405, 5, { fill: C.mint, op: 0.85 });
  g += circle(945, 1515, 5, { fill: C.blue, op: 0.85 });
  return g;
}
// giant ghost word drifting behind content (kinetic depth)
function ghost(t, word, { y = 1450, size = 260 } = {}) {
  const dx = ((t * 18) % 400) - 200;
  return text({ x: W / 2 + dx, y, s: word, size, ff: F.head, w: 900, fill: 'none', anchor: 'middle', op: 0.05, stroke: C.white, sw: 2, ls: 12 });
}

/* ── REEL 1: technology partner (14s) — VO-locked ──
   Measured VO energy envelopes (mp3 timeline, then +0.60s mix delay):
     "What should you look for in a technology partner?" 0.00–2.00   -> scene 0.60–2.60
     "Mission fit."                                      2.26–2.81   -> scene 2.86
     "Proven experience."                                3.05–3.55   -> scene 3.65
     "Transparent pricing."                              3.98–4.70   -> scene 4.58
     "Security and reliability."                         5.47–6.92   -> scene 6.07 / 6.45
     "Long-term support."                                7.10–8.12   -> scene 7.70 / 8.00
     "Let's build together."                             8.66–9.49   -> scene 9.26
   Scene timings below already include the +0.60s audio delay from mux.sh. */
const R1_ITEMS = ['Mission fit', 'Proven experience', 'Transparent pricing', 'Security & reliability', 'Long-term support'];
const R1_IN = [2.86, 3.65, 4.58, 6.07, 7.70];    // item voicing starts
const R1_CHECK = [3.30, 4.15, 5.30, 6.50, 8.15]; // tick lands as the word finishes
const R1_TITLE_OUT = 2.50;
const R1_OUTRO = 9.26;

function scene1(t) {
  let b = '';
  const intro = easeOut(t / 0.45);
  const outro = 1 - easeInOut((t - 13.6) / 0.4);
  const globalOp = Math.min(intro, outro, 1);

  b += ghost(t, 'PARTNER', { y: 1600, size: 240 });

  // ── hook: title beat (VO 0.00–2.00 -> scene 0.60–2.60)
  const tOp = inOut(t, 0.55, R1_TITLE_OUT - 0.55, 0.32);
  if (tOp > 0) {
    const g = (i) => Math.min(easeOut((t - (0.6 + i * 0.1)) / 0.5), 1);
    b += `<g opacity="${tOp.toFixed(3)}">`;
    const lb = g(0);
    b += `<g transform="translate(0 ${((1 - lb) * 40).toFixed(1)})" opacity="${lb.toFixed(3)}">` +
      text({ x: 90, y: 500, s: 'TECHNOLOGY PARTNER', size: 30, ff: F.mono, w: 600, fill: C.mint, ls: 8 }) + '</g>';
    const lines = [
      ['What should you', C.white, false, 84],
      ['look for in a', C.white, false, 84],
      ['technology partner?', 'url(#accent)', true, 82],
    ];
    lines.forEach(([s, fill, it, sz], i) => {
      const a = g(i + 1);
      const sc = (0.965 + 0.035 * a).toFixed(3);
      const y = 660 + i * 116;
      b += `<g transform="translate(90 ${y}) scale(${sc}) translate(-90 ${-y})" opacity="${a.toFixed(3)}">` +
        text({ x: 90, y, s, size: sz, ff: F.head, w: 700, fill, ls: -2, italic: it }) + '</g>';
    });
    b += drawRule(90, 1062, 260, g(4), { stroke: C.mint, sw: 5 });
    b += '</g>';
  }

  // ── checklist beat: five items, each appearing exactly on its spoken word
  if (t >= 2.75) {
    const checksDone = R1_CHECK.filter((c) => t >= c).length;
    const exitA = 1 - easeInOut((t - (R1_OUTRO - 0.75)) / 0.45);   // clear the frame for the outro
    const hA = inOut(t, 2.75, 0.55, 0.25) * Math.max(exitA, 0);
    // heading + progress rail
    if (hA > 0) {
      b += `<g opacity="${hA.toFixed(3)}">`;
      b += text({ x: 90, y: 430, s: 'THE CHECKLIST', size: 28, ff: F.mono, w: 600, fill: C.mint, ls: 7 });
      b += text({ x: 990, y: 430, s: `${checksDone}/5`, size: 28, ff: F.mono, w: 700, fill: C.mint, ls: 2, anchor: 'end', op: 0.9 });
      b += line(90, 462, 990, 462, C.white, 2, 0.12);
      const prog = checksDone / 5;
      b += line(90, 462, 90 + 900 * prog, 462, C.mint, 3, 0.9);
      b += '</g>';
    }
    R1_ITEMS.forEach((label, i) => {
      const dt = t - R1_IN[i];
      if (dt <= 0) return;
      const a = easeOut(dt / 0.34) * Math.max(exitA, 0);
      if (a <= 0.002) return;
      const slide = (1 - easeOut(dt / 0.34)) * 46;
      const y = 578 + i * 172;
      const checked = t >= R1_CHECK[i];
      // long items stack as two lines so nothing crowds the tick column
      const twoLine = label.length > 14;
      const words = twoLine ? label.split(' ') : null;
      const cut = twoLine ? Math.ceil(words.length / 2) : 0;
      const l1 = twoLine ? words.slice(0, cut).join(' ') : label;
      const l2 = twoLine ? words.slice(cut).join(' ') : null;
      b += `<g transform="translate(${slide.toFixed(2)} 0)" opacity="${a.toFixed(3)}">`;
      // numeral
      b += text({ x: 90, y: y, s: `0${i + 1}`, size: 34, ff: F.mono, w: 700, fill: checked ? C.mint : C.blue, ls: 1 });
      // label: blue + dim until spoken, white once ticked
      const lc = checked ? C.white : C.blue;
      b += text({ x: 174, y: y, s: l1, size: 62, ff: F.head, w: 700, fill: lc, ls: -1.5 });
      if (l2) b += text({ x: 174, y: y + 64, s: l2, size: 62, ff: F.head, w: 700, fill: lc, ls: -1.5 });
      // checkmark box -> tick draws on
      const bx = 966, by = y - (twoLine ? 58 : 42), bs = 46;
      b += rect(bx - bs, by, bs, bs, { r: 12, stroke: checked ? C.mint : C.white, sw: 2.5, op: checked ? 1 : 0.3 });
      if (checked) {
        const cp = easeOut((t - R1_CHECK[i]) / 0.26);
        b += `<path d="M ${bx - bs + 11} ${by + 25} l 9 ${9 * cp} l ${15 * cp} ${-17 * cp}" fill="none" stroke="${C.mint}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="${cp.toFixed(2)}"/>`;
      }
      b += '</g>';
    });
  }

  // ── outro ("Let's build together." VO 8.60 -> scene 9.20)
  if (t >= R1_OUTRO - 0.05) {
    const a = inOut(t, R1_OUTRO, 14 - R1_OUTRO, 0.4);
    if (a > 0) {
      const rise = (1 - easeOut((t - R1_OUTRO) / 0.6)) * 64;
      const pop = easeOutBack((t - R1_OUTRO - 0.3) / 0.5);
      b += `<g transform="translate(0 ${rise.toFixed(2)})" opacity="${a.toFixed(3)}">`;
      // ghost checklist numerals for depth
      b += text({ x: 860, y: 700, s: '05', size: 300, ff: F.head, w: 900, fill: 'none', stroke: C.blue, sw: 2, op: 0.10 });
      b += markImg({ cx: W / 2, y: 420, h: 216 });
      const la = (delay) => easeOut((t - R1_OUTRO - delay) / 0.45);
      b += `<g opacity="${la(0.18).toFixed(3)}" transform="translate(0 ${((1 - la(0.18)) * 34).toFixed(1)})">` +
        text({ x: W / 2, y: 838, s: "Let's build", size: 96, ff: F.head, w: 800, fill: C.white, anchor: 'middle', ls: -2 }) + '</g>';
      b += `<g opacity="${la(0.34).toFixed(3)}" transform="translate(0 ${((1 - la(0.34)) * 34).toFixed(1)})">` +
        text({ x: W / 2, y: 946, s: 'together.', size: 96, ff: F.head, w: 800, fill: 'url(#accent)', anchor: 'middle', ls: -2, italic: true }) + '</g>';
      b += drawRule(W / 2 - 90, 1014, 180, easeOut((t - R1_OUTRO - 0.5) / 0.5), { stroke: C.mint, sw: 5 });
      b += `<g opacity="${la(0.5).toFixed(3)}">` +
        text({ x: W / 2, y: 1086, s: 'TECH · INNOVATE · IMPACT', size: 27, ff: F.mono, w: 500, fill: C.white, ls: 5, anchor: 'middle', op: 0.85 }) + '</g>';
      b += `<g opacity="${la(0.62).toFixed(3)}">` +
        socialRow(W / 2, 1156, { col: C.white, handleCol: C.mint }).svg + '</g>';
      b += `<g opacity="${la(0.72).toFixed(3)}" transform="translate(0 ${((1 - la(0.72)) * 18).toFixed(1)})">` +
        pill(W / 2, 1264, 'SEND US A DM', { fill: C.mint, textColor: C.ink, pop, w: 460 }) + '</g>';
      b += '</g>';
    }
  }
  return { bg: chrome(t), body: b, op: globalOp };
}

/* ── REEL 2: community appreciation (12s) — VO-locked ──
   Measured VO energy envelope (mp3, +0.60s mix delay applied below):
     "To our supporters. Thank you."   0.00–1.46  -> scene 0.60 / thanks 1.45
     "To our clients. Thank you."      1.88–2.71  -> scene 2.48 / thanks 3.00
     "To our partners. Thank you."     3.88–4.69  -> scene 4.48 / thanks 4.98
     "We're grateful you're building with iCube." 5.73–7.47 -> scene 6.33
     "Here's to many more."            7.71–8.59  -> scene 8.31
   The reel opens straight into the first group (no separate hero) so no
   spoken word ever lands on a screen that isn't showing it. */
const R2_GROUPS = ['SUPPORTERS', 'CLIENTS', 'PARTNERS'];
const R2_IN = [0.60, 2.48, 4.48];
const R2_THANKS = [1.45, 3.00, 4.98];
const R2_BRIDGE = 6.33;
const R2_GRATEFUL = 7.30;   // mid-bridge: "your building with iCube"
const R2_OUTRO = 8.31;
const R2_END = 12.0;

function scene2(t) {
  let b = '';
  const intro = easeOut(t / 0.4);
  const outro = 1 - easeInOut((t - (R2_END - 0.45)) / 0.45);
  const globalOp = Math.min(intro, outro, 1);

  b += ghost(t, 'THANK YOU', { y: 1640, size: 200 });
  // slow drifting brand orbs for life
  b += circle(880 + Math.sin(t * 0.5) * 40, 560 + Math.cos(t * 0.42) * 34, 236, { fill: 'url(#gl)', op: 0.30 });
  b += circle(180 + Math.cos(t * 0.38) * 34, 1400 + Math.sin(t * 0.47) * 40, 172, { fill: 'url(#gl)', op: 0.22 });

  // ── persistent eyebrow + original logo lockup (top of frame, never moves)
  // original logo holds for the whole reel; only the eyebrow retires before the bridge
  const logoOp = easeOut((t - 0.15) / 0.5) * Math.max(0, 1 - easeInOut((t - (R2_END - 0.5)) / 0.4));
  if (logoOp > 0.002) b += `<g opacity="${logoOp.toFixed(3)}">${markImg({ cx: W / 2, y: 372, h: 150 })}</g>`;
  const eyeOp = easeOut((t - 0.15) / 0.5) * Math.max(0, 1 - easeInOut((t - (R2_BRIDGE - 0.30)) / 0.40));
  if (eyeOp > 0.002) b += text({ x: W / 2, y: 596, s: 'COMMUNITY APPRECIATION', size: 28, ff: F.mono, w: 600, fill: C.mint, ls: 8, anchor: 'middle', op: eyeOp.toFixed(3) });

  // ── three groups, each on its spoken line; tick stamps on "Thank you"
  R2_GROUPS.forEach((g, i) => {
    const dt = t - R2_IN[i];
    if (dt <= 0) return;
    const exit = i < 2
      ? 1 - easeInOut((t - R2_IN[i + 1] + 0.10) / 0.34)
      : 1 - easeInOut((t - (R2_BRIDGE - 0.55)) / 0.40);   // clear before the bridge
    const a = easeOut(dt / 0.30) * Math.max(exit, 0);
    if (a <= 0.001) return;
    const y = 900 + i * 190;
    const thanks = t >= R2_THANKS[i];
    b += `<g transform="translate(0 ${((1 - easeOut(dt / 0.32)) * 46).toFixed(2)})" opacity="${a.toFixed(3)}">`;
    b += text({ x: 90, y: y, s: g, size: 96, ff: F.head, w: 800, fill: C.white, ls: -2 });
    const pop = thanks ? easeOutBack((t - R2_THANKS[i]) / 0.34) : 0;
    if (pop > 0) {
      const sc = (0.78 + 0.22 * Math.min(pop, 1.06)).toFixed(3);
      b += `<g transform="translate(914 ${y - 34}) scale(${sc}) translate(-914 ${-(y - 34)})" opacity="${clamp01(pop * 1.7).toFixed(2)}">`;
      b += circle(914, y - 34, 36, { fill: C.mint });
      b += `<path d="M 896 ${y - 34} l 12 13 l 26 -27" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      b += '</g>';
      b += `<g opacity="${clamp01(pop * 1.4).toFixed(2)}">` +
        text({ x: 92, y: y + 54, s: 'THANK YOU', size: 27, ff: F.mono, w: 700, fill: C.mint, ls: 6 }) + '</g>';
    } else {
      b += circle(914, y - 34, 36, { stroke: C.white, op: 0.20 });
    }
    b += '</g>';
  });

  // ── bridge: "We're grateful you're building with iCube."
  if (t >= R2_BRIDGE - 0.05) {
    const a = inOut(t, R2_BRIDGE, R2_OUTRO + 0.05 - R2_BRIDGE, 0.30);
    if (a > 0) {
      const pop = easeOutBack((t - R2_BRIDGE) / 0.45);
      b += `<g transform="translate(${W / 2} 900) scale(${(0.94 + 0.06 * Math.min(pop, 1)).toFixed(3)}) translate(${-W / 2} -900)" opacity="${a.toFixed(3)}">`;
      const g2 = easeOut((t - R2_GRATEFUL) / 0.4);
      b += text({ x: W / 2, y: 872, s: "We're grateful", size: 86, ff: F.head, w: 800, fill: C.white, anchor: 'middle', ls: -2 });
      b += `<g opacity="${g2.toFixed(3)}" transform="translate(0 ${((1 - g2) * 26).toFixed(1)})">` +
        text({ x: W / 2, y: 972, s: "you're building with iCube.", size: 66, ff: F.head, w: 700, fill: 'url(#accent)', anchor: 'middle', ls: -1.5, italic: true }) + '</g>';
      b += '</g>';
    }
  }

  // ── outro: "Here's to many more." + original logo + CTAs
  if (t >= R2_OUTRO - 0.05) {
    const a = inOut(t, R2_OUTRO, R2_END - R2_OUTRO, 0.42);
    if (a > 0) {
      const rise = (1 - easeOut((t - R2_OUTRO) / 0.6)) * 58;
      const pop = easeOutBack((t - R2_OUTRO - 0.25) / 0.5);
      const la = (d) => easeOut((t - R2_OUTRO - d) / 0.45);
      b += `<g transform="translate(0 ${rise.toFixed(2)})" opacity="${a.toFixed(3)}">`;
      b += markImg({ cx: W / 2, y: 430, h: 214 });
      b += `<g opacity="${la(0.10).toFixed(3)}" transform="translate(0 ${((1 - la(0.10)) * 32).toFixed(1)})">` +
        text({ x: W / 2, y: 848, s: "Here's to", size: 86, ff: F.head, w: 800, fill: C.white, anchor: 'middle', ls: -2 }) + '</g>';
      b += `<g opacity="${la(0.26).toFixed(3)}" transform="translate(0 ${((1 - la(0.26)) * 32).toFixed(1)})">` +
        text({ x: W / 2, y: 952, s: 'many more.', size: 86, ff: F.head, w: 800, fill: 'url(#accent)', anchor: 'middle', ls: -2, italic: true }) + '</g>';
      b += drawRule(W / 2 - 90, 1016, 180, easeOut((t - R2_OUTRO - 0.40) / 0.5), { stroke: C.mint, sw: 5 });
      b += `<g opacity="${la(0.44).toFixed(3)}">` +
        text({ x: W / 2, y: 1082, s: 'SUPPORTERS · CLIENTS · PARTNERS', size: 27, ff: F.mono, w: 500, fill: C.white, ls: 5, anchor: 'middle', op: 0.85 }) + '</g>';
      b += `<g opacity="${la(0.56).toFixed(3)}">` +
        socialRow(W / 2, 1130, { col: C.white, handleCol: C.mint }).svg + '</g>';
      b += `<g opacity="${la(0.66).toFixed(3)}" transform="translate(0 ${((1 - la(0.66)) * 18).toFixed(1)})">` +
        pill(W / 2, 1240, 'SEND US A DM', { fill: C.mint, textColor: C.ink, pop, w: 460 }) + '</g>';
      b += '</g>';
    }
  }
  return { bg: chrome(t, { pulse: 0.42 }), body: b, op: globalOp };
}
/* ── render pipeline ── */
function fontFiles() {
  const base = path.join(ROOT, 'node_modules', '@expo-google-fonts');
  const files = [];
  for (const pkg of ['poppins', 'space-grotesk', 'jetbrains-mono']) {
    const dir = path.join(base, pkg);
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir)) {
      const dd = path.join(dir, d);
      if (!fs.statSync(dd).isDirectory()) continue;
      const ttf = fs.readdirSync(dd).find((f) => f.endsWith('.ttf'));
      if (ttf) files.push(path.join(dd, ttf));
    }
  }
  return files;
}
const FONTS = fontFiles();
if (FONTS.length < 10) { console.error('fonts missing:', FONTS.length); process.exit(1); }
console.log('fonts:', FONTS.length, 'logo:', MARK_W + 'x' + MARK_H, '(original PNG)');

function frameSvg(scene, t) {
  const { bg, body, op } = scene(t);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    defs + rect(0, 0, W, H, { fill: C.ink }) +
    `<g opacity="${op.toFixed(3)}">` + bg + body + '</g></svg>';
  if (/undefined|NaN/.test(svg)) throw new Error('bad frame at t=' + t);
  return svg;
}

const REELS = {
  '01-technology-partner': { duration: Math.round(14 * TIME_SCALE * 100) / 100, scene: scene1, coverT: 1.6 },
  '02-community-appreciation': { duration: Math.round(12 * TIME_SCALE * 100) / 100, scene: scene2, coverT: 1.8 },
};
const CHUNK = 150;

function frameValid(p) {
  if (!fs.existsSync(p)) return false;
  const st = fs.statSync(p);
  if (st.size < 5000) return false;
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  return buf.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function renderChunk(id, start, end) {
  const { scene, duration } = REELS[id];
  const total = Math.round(duration * FPS);
  const framesDir = path.join(OUT, 'frames-' + id);
  fs.mkdirSync(framesDir, { recursive: true });
  const t0 = Date.now();
  let rendered = 0;
  for (let f = start; f < Math.min(end, total); f++) {
    const p = path.join(framesDir, `f${String(f).padStart(4, '0')}.png`);
    if (frameValid(p)) continue;
    const svg = frameSvg(scene, (f / FPS) / TIME_SCALE);
    const png = new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Space Grotesk' } }).render().asPng();
    fs.writeFileSync(p, png);
    rendered++;
    if (rendered % 50 === 0) console.log(`  ${id} [${start}-${end}) rendered ${rendered} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  console.log(`  ${id} chunk [${start},${end}) done (${rendered} new)`);
}

function encodeReel(id) {
  const { duration, coverT } = REELS[id];
  const framesDir = path.join(OUT, 'frames-' + id);
  const total = Math.round(duration * FPS);
  for (let f = 0; f < total; f++) {
    const p = path.join(framesDir, `f${String(f).padStart(4, '0')}.png`);
    if (!frameValid(p)) throw new Error(`missing/corrupt frame ${f} for ${id}`);
  }
  const coverSvg = frameSvg(REELS[id].scene, coverT / TIME_SCALE);
  fs.writeFileSync(path.join(OUT, `${id}-cover.png`), new Resvg(coverSvg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
  const out = path.join(OUT, `${id}-reel.mp4`);
  const args = ['-y', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', out];
  const r = spawnSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) { console.error(String(r.stderr).slice(-2000)); throw new Error('ffmpeg failed for ' + id); }
  fs.rmSync(framesDir, { recursive: true, force: true });
  const st = fs.statSync(out);
  console.log(`✓ ${out} (${(st.size / 1e6).toFixed(1)} MB, ${total} frames, ${duration}s)`);
}

const mode = process.argv[2];
if (mode === 'still') {
  // node scripts/reels.mjs still <id> <t> <outfile>  — render one frame for review
  const [, , , id, tStr, outFile] = process.argv;
  const { scene } = REELS[id];
  const svg = frameSvg(scene, +tStr / TIME_SCALE);
  fs.writeFileSync(outFile, new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false } }).render().asPng());
  console.log('still ->', outFile);
} else if (mode === 'chunk') {
  renderChunk(process.argv[3], +process.argv[4], +process.argv[5]);
} else {
  fs.mkdirSync(OUT, { recursive: true });
  // v2 always re-renders: purge any v1 frames first (never resume stale content)
  for (const id of Object.keys(REELS)) fs.rmSync(path.join(OUT, 'frames-' + id), { recursive: true, force: true });
  for (const id of Object.keys(REELS)) {
    const total = Math.round(REELS[id].duration * FPS);
    for (let s = 0; s < total; s += CHUNK) {
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'chunk', id, String(s), String(s + CHUNK)], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`chunk failed ${id} ${s}`);
    }
    encodeReel(id);
  }
  console.log('done');
}
