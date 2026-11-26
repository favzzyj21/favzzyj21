// iCube Instagram REELS generator (1080x1920, 30fps, H.264 MP4)
// Frame-by-frame SVG scenes -> PNG frames -> ffmpeg encode.
// Reel 1: "What organisations should consider when choosing a technology partner"
// Reel 2: "Community Appreciation" (thank you: supporters, clients, partners)
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

const C = { ink: '#03050a', navy: '#06195b', blue: '#3c6bff', mint: '#08deaa', white: '#ffffff' };
const F = { head: 'Poppins', body: 'Space Grotesk', mono: 'JetBrains Mono' };
const HANDLE = '@icubeinnovationslab';
const MARK_D = fs.readFileSync(path.join(ASSETS, 'mark.path.txt'), 'utf8').trim();
const MARK_VB = { w: 3693, h: 4251 };

/* ── helpers ── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// window(t, start, dur) -> eased 0..1 in, then out via fadeOut window
function inOut(t, start, dur, fade = 0.3) {
  if (t < start || t > start + dur) return 0;
  const e = t - start;
  const a = easeOut(e / Math.min(fade, dur / 2));
  const b = 1 - easeOut((e - (dur - fade)) / Math.min(fade, dur / 2));
  return Math.min(a, b, 1);
}
function text({ x, y, s, size = 40, ff = F.body, w = 400, fill = C.white, ls = 0, anchor = 'start', op = 1 }) {
  const lsA = ls ? ` letter-spacing="${ls}"` : '';
  const opA = op !== 1 ? ` opacity="${op}"` : '';
  return `<text x="${x}" y="${y}" font-family="${ff}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}"${lsA}${opA}>${esc(s)}</text>`;
}
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 0}" fill="${o.fill ?? 'none'}"` +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 1}"` : '') +
  (o.op !== undefined ? ` opacity="${o.op}"` : '') + '/>';
const line = (x1, y1, x2, y2, stroke, sw = 1, op = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`;
const circle = (cx, cy, r, o = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fill ?? 'none'}"` + (o.op !== undefined ? ` opacity="${o.op}"` : '') + '/>';
function markGroup({ x, y, h, fill, op = 1 }) {
  const s = h / MARK_VB.h;
  return `<g transform="translate(${x} ${y}) scale(${s})" opacity="${op}"><path fill="${fill}" fill-rule="evenodd" d="${MARK_D}"/></g>`;
}
function pill(cx, cy, label, { fill, stroke, textColor, h = 74, fs = 26, ls = 3 }) {
  const tw = label.length * fs * 0.62 + fs * ls * 0.6;
  const wd = tw + 56;
  const x = cx - wd / 2;
  return rect(x, cy - h / 2, wd, h, { r: h / 2, fill: fill ?? 'none', stroke, sw: stroke ? 2 : 0 }) +
    text({ x: cx, y: cy + fs * 0.36, s: label, size: fs, ff: F.mono, w: 700, fill: textColor, anchor: 'middle', ls });
}

/* ── shared chrome ── */
function chrome(t, { pulse = 0.5 } = {}) {
  const dx = (t * 14) % 135;
  let g = `<g opacity="0.05">`;
  for (let x = -135 + dx; x <= W + 135; x += 135) g += line(x, 0, x, H, C.white, 1);
  for (let y = 135; y < H; y += 135) g += line(0, y, W, y, C.white, 1);
  g += '</g>';
  const glowOp = pulse + 0.06 * Math.sin(t * 2.2);
  const glow = `<ellipse cx="${W * 0.82}" cy="${H * 0.24}" rx="${W * 0.6}" ry="${H * 0.24}" fill="url(#gl)" opacity="${glowOp.toFixed(3)}"/>`;
  const dot1 = circle(270, 405, 5, { fill: C.mint, op: 0.85 });
  const dot2 = circle(945, 1515, 5, { fill: C.blue, op: 0.85 });
  return g + glow + dot1 + dot2;
}
const defs = `<defs>
  <radialGradient id="gl" cx="50%" cy="50%"><stop offset="0" stop-color="${C.blue}" stop-opacity=".5"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/></radialGradient>
  <linearGradient id="cta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>
</defs>`;

/* ── REEL 1: technology partner (14s) ── */
const R1_POINTS = [
  ['01', 'Understands your mission'],
  ['02', 'Proven experience'],
  ['03', 'Transparent pricing'],
  ['04', 'Security & reliability'],
  ['05', 'Long-term support'],
];
function scene1(t) {
  let b = '';
  const intro = easeOut(t / 0.45); // global fade in
  const outro = 1 - easeInOut((t - 13.55) / 0.45);
  const globalOp = Math.min(intro, outro, 1);

  // ── title beat 0.4 – 2.75
  const tOp = inOut(t, 0.4, 2.35, 0.35);
  if (tOp > 0) {
    const g = (i) => {
      const a = easeOut((t - (0.45 + i * 0.12)) / 0.5);
      return Math.min(a, 1);
    };
    b += `<g opacity="${tOp.toFixed(3)}">`;
    b += `<g transform="translate(0 ${(1 - g(0)) * 50})" opacity="${g(0).toFixed(3)}">${text({ x: 90, y: 470, s: 'TECHNOLOGY PARTNER', size: 30, ff: F.mono, w: 600, fill: C.mint, ls: 8 })}</g>`;
    const lines = [
      ['What organisations', C.white],
      ['should consider', C.white],
      ['when choosing a', C.white],
      ['technology partner.', C.blue],
    ];
    lines.forEach(([s, fill], i) => {
      const a = g(i + 1);
      b += `<g transform="translate(0 ${(1 - a) * 70})" opacity="${a.toFixed(3)}">${text({ x: 90, y: 600 + i * 104, s, size: 78, ff: F.head, w: 700, fill })}</g>`;
    });
    b += line(90, 1060, 330, 1060, C.mint, 4, g(5));
    b += `<g opacity="${g(5).toFixed(3)}">${text({ x: 90, y: 1120, s: 'KEY THINGS TO EVALUATE', size: 26, ff: F.mono, w: 500, fill: C.white, ls: 5, op: 0.7 })}</g>`;
    b += '</g>';
  }

  // ── points beat 2.75 – 10.25 (5 × 1.5s)
  if (t >= 2.7 && t < 10.3) {
    const pOp = inOut(t, 2.7, 7.6, 0.3);
    if (pOp > 0) {
      b += `<g opacity="${pOp.toFixed(3)}">`;
      b += text({ x: 90, y: 470, s: 'CHOOSING A TECHNOLOGY PARTNER', size: 28, ff: F.mono, w: 600, fill: C.mint, ls: 6, op: 0.9 });
      const idx = Math.max(0, Math.min(Math.floor((t - 2.75) / 1.5), 4));
      const local = Math.max(0, t - 2.75 - idx * 1.5);
      const a = inOut(local, 0, 1.5, 0.3);
      if (a > 0) {
        const [num, label] = R1_POINTS[idx];
        const slide = (1 - easeOut(local / 0.45)) * 70;
        b += `<g transform="translate(0 ${slide.toFixed(2)})" opacity="${a.toFixed(3)}">`;
        b += text({ x: 90, y: 800, s: num, size: 150, ff: F.head, w: 800, fill: C.blue, op: 0.95 });
        b += text({ x: 90, y: 930, s: label, size: 64, ff: F.head, w: 600, fill: C.white });
        b += line(90, 990, 90 + 4.2 * label.length * 6, 990, C.mint, 4, 0.95);
        b += '</g>';
      }
      b += '</g>';
    }
  }

  // ── outro beat 10.25 – 14
  if (t >= 10.2) {
    const a = inOut(t, 10.25, 3.75, 0.4);
    if (a > 0) {
      const rise = (1 - easeOut((t - 10.25) / 0.6)) * 60;
      b += `<g transform="translate(0 ${rise.toFixed(2)})" opacity="${a.toFixed(3)}">`;
      const mh = 240;
      b += markGroup({ x: W / 2 - (mh * MARK_VB.w / MARK_VB.h) / 2, y: 430, h: mh, fill: C.white });
      b += text({ x: W / 2, y: 850, s: "Let's build", size: 92, ff: F.head, w: 800, fill: C.white, anchor: 'middle' });
      b += text({ x: W / 2, y: 958, s: 'together.', size: 92, ff: F.head, w: 800, fill: C.mint, anchor: 'middle' });
      b += text({ x: W / 2, y: 1050, s: 'TECH · PRINTING · WEB · SOFTWARE', size: 28, ff: F.mono, w: 500, fill: C.white, ls: 6, anchor: 'middle', op: 0.85 });
      b += pill(W / 2 - 175, 1160, 'DM US', { fill: C.white, textColor: C.navy });
      b += pill(W / 2 + 185, 1160, 'LINK IN BIO', { stroke: C.white, textColor: C.white });
      b += text({ x: W / 2, y: 1300, s: HANDLE, size: 38, ff: F.mono, w: 600, fill: C.white, anchor: 'middle' });
      b += '</g>';
    }
  }
  return { bg: chrome(t), body: b, op: globalOp };
}

/* ── REEL 2: community appreciation (12s) ── */
function scene2(t) {
  let b = '';
  const intro = easeOut(t / 0.45);
  const outro = 1 - easeInOut((t - 11.55) / 0.45);
  const globalOp = Math.min(intro, outro, 1);

  // ── hero 0 – 3.2
  const hOp = inOut(t, 0.3, 2.9, 0.4);
  if (hOp > 0) {
    const a = easeOut((t - 0.35) / 0.6);
    b += `<g opacity="${hOp.toFixed(3)}">`;
    const mh = 220;
    b += `<g opacity="${a.toFixed(3)}">${markGroup({ x: W / 2 - (mh * MARK_VB.w / MARK_VB.h) / 2, y: 420, h: mh, fill: C.white })}</g>`;
    const a2 = easeOut((t - 0.7) / 0.55);
    b += `<g transform="translate(0 ${((1 - a2) * 50).toFixed(2)})" opacity="${a2.toFixed(3)}">${text({ x: W / 2, y: 800, s: 'COMMUNITY APPRECIATION', size: 30, ff: F.mono, w: 600, fill: C.mint, ls: 8, anchor: 'middle' })}</g>`;
    const a3 = easeOut((t - 0.95) / 0.6);
    b += `<g transform="translate(0 ${((1 - a3) * 70).toFixed(2)})" opacity="${a3.toFixed(3)}">${text({ x: W / 2, y: 960, s: 'Thank you.', size: 110, ff: F.head, w: 800, fill: C.white, anchor: 'middle' })}</g>`;
    const a4 = easeOut((t - 1.3) / 0.6);
    b += `<g opacity="${a4.toFixed(3)}">${line(W / 2 - 60, 1040, W / 2 + 60, 1040, C.mint, 5)}</g>`;
    b += '</g>';
  }

  // ── three beats 3.2 – 7.6 (1.45s each)
  const beats = ['To our supporters.', 'To our clients.', 'To our partners.'];
  if (t >= 3.15 && t < 7.7) {
    const wrap = inOut(t, 3.15, 4.55, 0.3);
    if (wrap > 0) {
      b += `<g opacity="${wrap.toFixed(3)}">`;
      b += text({ x: W / 2, y: 560, s: 'COMMUNITY APPRECIATION', size: 28, ff: F.mono, w: 600, fill: C.mint, ls: 7, anchor: 'middle', op: 0.9 });
      const idx = Math.max(0, Math.min(Math.floor((t - 3.2) / 1.45), 2));
      const local = Math.max(0, t - 3.2 - idx * 1.45);
      const a = inOut(local, 0, 1.45, 0.3);
      if (a > 0) {
        const slide = (1 - easeOut(local / 0.4)) * 60;
        b += `<g transform="translate(0 ${slide.toFixed(2)})" opacity="${a.toFixed(3)}">`;
        b += text({ x: W / 2, y: 940, s: beats[idx], size: 76, ff: F.head, w: 700, fill: C.white, anchor: 'middle' });
        b += line(W / 2 - 70, 1010, W / 2 + 70, 1010, C.mint, 5);
        b += '</g>';
      }
      b += '</g>';
    }
  }

  // ── outro 7.65 – 12
  if (t >= 7.6) {
    const a = inOut(t, 7.65, 4.35, 0.45);
    if (a > 0) {
      const rise = (1 - easeOut((t - 7.65) / 0.6)) * 60;
      b += `<g transform="translate(0 ${rise.toFixed(2)})" opacity="${a.toFixed(3)}">`;
      const mh = 200;
      b += markGroup({ x: W / 2 - (mh * MARK_VB.w / MARK_VB.h) / 2, y: 450, h: mh, fill: C.white });
      b += text({ x: W / 2, y: 850, s: 'Thank you for', size: 84, ff: F.head, w: 800, fill: C.white, anchor: 'middle' });
      b += text({ x: W / 2, y: 952, s: 'building with iCube.', size: 84, ff: F.head, w: 800, fill: C.mint, anchor: 'middle' });
      b += text({ x: W / 2, y: 1055, s: 'SUPPORTERS · CLIENTS · PARTNERS', size: 28, ff: F.mono, w: 500, fill: C.white, ls: 6, anchor: 'middle', op: 0.85 });
      b += pill(W / 2 - 175, 1170, 'DM US', { fill: C.white, textColor: C.navy });
      b += pill(W / 2 + 185, 1170, 'LINK IN BIO', { stroke: C.white, textColor: C.white });
      b += text({ x: W / 2, y: 1310, s: HANDLE, size: 38, ff: F.mono, w: 600, fill: C.white, anchor: 'middle' });
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
      const ttf = fs.readdirSync(dd).find((f) => f.endsWith('.ttf') && !/Italic/.test(f));
      if (ttf) files.push(path.join(dd, ttf));
    }
  }
  return files;
}
const FONTS = fontFiles();
if (FONTS.length < 10) { console.error('fonts missing:', FONTS.length); process.exit(1); }
console.log('fonts:', FONTS.length);

function frameSvg(scene, t) {
  const { bg, body, op } = scene(t);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    defs + rect(0, 0, W, H, { fill: C.ink }) +
    `<g opacity="${op.toFixed(3)}">` + bg + body + '</g></svg>';
  if (/undefined|NaN/.test(svg)) throw new Error('bad frame at t=' + t);
  return svg;
}

const REELS = {
  '01-technology-partner': { duration: 14, scene: scene1, coverT: 1.6 },
  '02-community-appreciation': { duration: 12, scene: scene2, coverT: 1.8 },
};
const CHUNK = 150; // resvg native memory accumulates per instance — keep child processes small

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
    const svg = frameSvg(scene, f / FPS);
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
  const coverSvg = frameSvg(REELS[id].scene, coverT);
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
if (mode === 'chunk') {
  renderChunk(process.argv[3], +process.argv[4], +process.argv[5]);
} else {
  fs.mkdirSync(OUT, { recursive: true });
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
