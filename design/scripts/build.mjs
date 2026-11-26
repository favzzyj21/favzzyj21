// iCube Innovations Lab — Instagram post generator
// Editable SVG sources -> PNG exports via @resvg/resvg-js
// Design language: professionally clean, futuristic — iCube brand tokens
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT_SVG = path.join(ROOT, 'src', 'posts');
const OUT_PNG = path.join(ROOT, 'exports');
fs.mkdirSync(OUT_SVG, { recursive: true });
fs.mkdirSync(OUT_PNG, { recursive: true });

/* ─────────────────────────── tokens ─────────────────────────── */
const C = {
  ink: '#03050a',
  navy: '#06195b',
  blue: '#3c6bff',
  mint: '#08deaa',
  white: '#ffffff',
  fog: '#f4f6fc',
};
const F = { head: 'Poppins', body: 'Space Grotesk', mono: 'JetBrains Mono' };
const HANDLE = '@icubeinnovationslab';
const FULLNAME = 'ICUBE INNOVATIONS LAB LTD.';

const SIZES = [
  { key: 'sq', W: 1080, H: 1080, label: '1080x1080', k: 0.96, M: 72 },
  { key: 'por', W: 1080, H: 1350, label: '1080x1350', k: 1.0, M: 80 },
  { key: 'story', W: 1080, H: 1920, label: '1080x1920', k: 1.12, M: 88 },
];

/* ─────────────────────────── assets ─────────────────────────── */
const MARK_D = fs.readFileSync(path.join(ASSETS, 'mark.path.txt'), 'utf8').trim();
const MARK_VB = { w: 3693, h: 4251 };
function lockupPaths(file) {
  const s = fs.readFileSync(path.join(ASSETS, file), 'utf8');
  return [...s.matchAll(/<path fill="([^"]+)"[^>]*d="([^"]+)"/g)].map((m) => ({ fill: m[1], d: m[2] }));
}
const LOCKUP_WHITE = lockupPaths('lockup-white.svg');
const LOCKUP_NAVY = lockupPaths('lockup-navy.svg');
const LOCKUP_VB = { w: 5664, h: 1944 };

/* ─────────────────────────── helpers ─────────────────────────── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function text({ x, y, s, size = 24, ff = F.body, w = 400, fill = C.white, ls = 0, anchor = 'start', op = 1 }) {
  const lsA = ls ? ` letter-spacing="${ls}"` : '';
  const opA = op !== 1 ? ` opacity="${op}"` : '';
  return `<text x="${x}" y="${y}" font-family="${ff}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}"${lsA}${opA}>${esc(s)}</text>`;
}
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 0}" fill="${o.fill ?? 'none'}"` +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 1}"` : '') +
  (o.op !== undefined ? ` opacity="${o.op}"` : '') +
  (o.dash ? ` stroke-dasharray="${o.dash}"` : '') + '/>';
const line = (x1, y1, x2, y2, stroke, sw = 1, op = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`;
const circle = (cx, cy, r, o = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fill ?? 'none'}"` +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 1}"` : '') +
  (o.op !== undefined ? ` opacity="${o.op}"` : '') + '/>';

function markSvg({ x, y, h, fill, op = 1, id }) {
  const s = h / MARK_VB.h;
  return `<g transform="translate(${x} ${y}) scale(${s})" opacity="${op}"><path fill="${fill}" fill-rule="evenodd" id="${id ?? ''}" d="${MARK_D}"/></g>`;
}
function lockupSvg({ x, y, h, variant = 'white', op = 1 }) {
  const parts = variant === 'white' ? LOCKUP_WHITE : LOCKUP_NAVY;
  const s = h / LOCKUP_VB.h;
  return `<g transform="translate(${x} ${y}) scale(${s})" opacity="${op}">` +
    parts.map((p) => `<path fill="${p.fill}" fill-rule="evenodd" d="${p.d}"/>`).join('') + '</g>';
}
const lockupW = (h) => (h * LOCKUP_VB.w) / LOCKUP_VB.h;

/* ─────────────────────── shared chrome ─────────────────────── */
function defs(id, theme) {
  const g1 = theme === 'light'
    ? `<radialGradient id="glow${id}" cx="50%" cy="50%"><stop offset="0" stop-color="${C.blue}" stop-opacity=".16"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/></radialGradient>`
    : `<radialGradient id="glow${id}" cx="50%" cy="50%"><stop offset="0" stop-color="${C.blue}" stop-opacity=".5"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/></radialGradient>`;
  const g2 = `<linearGradient id="cta${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>`;
  return `<defs>${g1}${g2}</defs>`;
}

function grid(W, H, light) {
  const st = light ? C.navy : C.white;
  const op = light ? 0.06 : 0.045;
  const step = 135;
  let out = `<g opacity="${op}">`;
  for (let x = step; x < W; x += step) out += line(x, 0, x, H, st, 1);
  for (let y = step; y < H; y += step) out += line(0, y, W, y, st, 1);
  out += '</g>';
  // sparse node dots at two intersections
  out += circle(step * 2, step * 2, 5, { fill: C.mint, op: 0.9 });
  out += circle(step * 7, step * (Math.floor(H / step) - 2), 5, { fill: C.blue, op: 0.9 });
  return out;
}

function cornerTicks(M, light) {
  const col = light ? C.navy : C.white;
  const a = light ? 0.35 : 0.28, L = 26, W = 1080; // ticks drawn by caller with real W/H
  return { col, a, L, W };
}
function ticks(W, H, M, light) {
  const col = light ? C.navy : C.white, a = light ? 0.4 : 0.3, L = 26;
  const t = (x, y, sx, sy) => line(x, y, x + sx * L, y, col, 2, a) + line(x, y, x, y + sy * L, col, 2, a);
  return t(M - 24, M - 24, 1, 1) + t(W - M + 24, H - M + 24, -1, -1);
}

function pill(xRight, cy, label, { fill, stroke, textColor, h = 46, fs = 20, ff = F.mono, w = 700, ls = 2 }) {
  const tw = label.length * fs * 0.62 + fs * ls * 0.6;
  const wd = tw + 44;
  const x = xRight - wd;
  const body = rect(x, cy - h / 2, wd, h, { r: h / 2, fill: fill ?? 'none', stroke, sw: stroke ? 1.6 : 0 });
  const t = text({ x: x + wd / 2, y: cy + fs * 0.36, s: label, size: fs, ff, w, fill: textColor, anchor: 'middle', ls });
  return body + t;
}
const pillW = (label, fs = 20, ls = 2) => label.length * fs * 0.62 + fs * ls * 0.6 + 44;

function header(W, M, idx, { light, variant }) {
  const h = 40;
  const lock = lockupSvg({ x: M, y: M, h, variant });
  const idxT = text({ x: W - M, y: M + 30, s: `${idx} / 06`, size: 22, ff: F.mono, w: 500, fill: light ? C.navy : C.white, ls: 4, anchor: 'end', op: 0.65 });
  return lock + idxT;
}

function footer(W, H, M, { light, pills = true, id }) {
  const col = light ? C.navy : C.white;
  const yLine = H - M - 76;
  let out = line(M, yLine, W - M, yLine, col, 1, light ? 0.16 : 0.14);
  const cy = H - M - 34;
  out += text({ x: M, y: cy + 7, s: HANDLE, size: 23, ff: F.mono, w: 500, fill: col, ls: 1, op: 0.85 });
  if (pills) {
    const p2 = pillW('LINK IN BIO');
    const p1 = pillW('DM US');
    out += pill(W - M, cy, 'LINK IN BIO', { stroke: light ? C.navy : C.white, textColor: col });
    out += pill(W - M - p2 - 12, cy, 'DM US', { fill: C.blue, textColor: C.white });
  } else {
    out += text({ x: W - M, y: cy + 7, s: FULLNAME, size: 18, ff: F.mono, w: 500, fill: col, ls: 3, anchor: 'end', op: 0.5 });
  }
  return out;
}

/* ─────────────────────── icons (48 grid, stroke) ─────────────────────── */
function icon(kind, x, y, col = C.mint, s = 1) {
  const st = `stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const p = {
    tech: `<rect x="14" y="14" width="20" height="20" rx="3" ${st}/><path d="M20 8v6M28 8v6M20 34v6M28 34v6M8 20h6M8 28h6M34 20h6M34 28h6" ${st}/>`,
    print: `<path d="M14 18V8h20v10" ${st}/><rect x="8" y="18" width="32" height="14" rx="3" ${st}/><rect x="14" y="28" width="20" height="12" rx="2" ${st}/><path d="M34 24h2" ${st}/>`,
    web: `<rect x="6" y="10" width="36" height="28" rx="4" ${st}/><path d="M6 19h36" ${st}/><circle cx="12" cy="14.5" r="1.6" fill="${col}"/><circle cx="18" cy="14.5" r="1.6" fill="${col}"/><path d="M14 27h8M14 32h20" ${st}/>`,
    code: `<path d="M16 16 8 24l8 8M32 16l8 8-8 8M27 12l-6 24" ${st}/>`,
  }[kind];
  return `<g transform="translate(${x} ${y}) scale(${s})">${p}</g>`;
}

/* ─────────────────────── post layouts ─────────────────────── */
// Each returns { theme, body } given (S, id). Chrome added centrally.

function post01(S) { // brand intro / hero
  const { W, H, M, k } = S;
  const cx = W / 2;
  const theme = 'dark';
  let b = `<ellipse cx="${W * 0.78}" cy="${H * 0.2}" rx="${W * 0.55}" ry="${H * 0.38}" fill="url(#glow01)"/>`;
  // ghost mark
  b += markSvg({ x: W * 0.62, y: H * 0.42, h: H * 0.5, fill: C.blue, op: 0.07 });
  const zoneTop = S.key === 'story' ? H * 0.30 : H * 0.30;
  const lw = W * (S.key === 'story' ? 0.74 : 0.72);
  const lh = (lw * LOCKUP_VB.h) / LOCKUP_VB.w;
  b += `<g>${lockupSvg({ x: cx - lw / 2, y: zoneTop, h: lh, variant: 'white' })}</g>`;
  const yRule = zoneTop + lh + 56 * k;
  b += line(cx - 40, yRule, cx + 40, yRule, C.mint, 3, 1);
  b += text({ x: cx, y: yRule + 64 * k, s: 'EVERYTHING TECH · PRINTING · WEB · SOFTWARE', size: Math.round(24 * k), ff: F.mono, w: 500, fill: C.white, ls: 4, anchor: 'middle', op: 0.92 });
  b += text({ x: cx, y: yRule + 130 * k, s: 'One lab. Every solution.', size: Math.round(46 * k), ff: F.head, w: 600, fill: C.white, anchor: 'middle', op: 0.95 });
  return { theme, body: b, glowId: '01' };
}

function post02(S) { // services grid
  const { W, H, M, k } = S;
  const theme = 'navy';
  let b = `<ellipse cx="${W * 0.15}" cy="${H * 0.1}" rx="${W * 0.5}" ry="${H * 0.3}" fill="url(#glow02)"/>`;
  const y0 = M + 130;
  b += text({ x: M, y: y0, s: '02 — SERVICES', size: Math.round(21 * k), ff: F.mono, w: 600, fill: C.mint, ls: 6 });
  b += text({ x: M, y: y0 + 74 * k, s: 'What we do', size: Math.round(64 * k), ff: F.head, w: 700, fill: C.white });
  b += text({ x: M, y: y0 + 128 * k, s: 'Everything tech, under one roof.', size: Math.round(26 * k), ff: F.body, w: 400, fill: C.white, op: 0.72 });

  const cards = [
    ['tech', 'TECH SOLUTIONS', 'EVERYTHING TECH'],
    ['print', 'PRINTING', 'PRINT THAT POPS'],
    ['web', 'WEB SOLUTIONS', 'DESIGN · BUILD · LAUNCH'],
    ['code', 'SOFTWARE', 'APPS · TOOLS · SYSTEMS'],
  ];
  const top = y0 + 190 * k;
  const bottom = H - M - 130;
  const gap = 22;
  const story = S.key === 'story';
  const cols = story ? 1 : 2;
  const rows = story ? 4 : 2;
  const cw = (W - 2 * M - (cols - 1) * gap) / cols;
  const ch = (bottom - top - (rows - 1) * gap) / rows;
  cards.forEach((c, i) => {
    const col = story ? 0 : i % 2;
    const row = story ? i : Math.floor(i / 2);
    const x = M + col * (cw + gap);
    const y = top + row * (ch + gap);
    const accent = i === 3;
    b += rect(x, y, cw, ch, { r: 26, fill: accent ? 'url(#cta02)' : C.white, op: accent ? 1 : 0.05 });
    b += rect(x, y, cw, ch, { r: 26, stroke: accent ? 'none' : C.white, sw: 1.4, op: accent ? 0 : 0.14 });
    const ix = x + 34, iy = y + 34;
    b += icon(c[0], ix, iy, accent ? C.white : C.mint, 1.05);
    b += text({ x: x + cw - 30, y: y + 52, s: `0${i + 1}`, size: 22, ff: F.mono, w: 600, fill: accent ? C.white : C.mint, ls: 2, anchor: 'end', op: 0.85 });
    b += text({ x: ix, y: y + ch - 74, s: c[1], size: Math.round(30 * k), ff: F.head, w: 700, fill: C.white });
    b += text({ x: ix, y: y + ch - 36, s: c[2], size: Math.round(17 * k), ff: F.mono, w: 500, fill: accent ? C.white : C.mint, ls: 2.5, op: accent ? 0.9 : 0.8 });
  });
  return { theme, body: b, glowId: '02' };
}

function post03(S) { // web solutions
  const { W, H, M, k } = S;
  const theme = 'dark';
  let b = `<ellipse cx="${W * 0.85}" cy="${H * 0.75}" rx="${W * 0.6}" ry="${H * 0.45}" fill="url(#glow03)"/>`;
  const y0 = M + 140;
  b += text({ x: M, y: y0, s: '03 — WEB SOLUTIONS', size: Math.round(21 * k), ff: F.mono, w: 600, fill: C.mint, ls: 6 });
  b += text({ x: M, y: y0 + 78 * k, s: 'Web solutions', size: Math.round(62 * k), ff: F.head, w: 700, fill: C.white });
  b += text({ x: M, y: y0 + 150 * k, s: 'that work.', size: Math.round(62 * k), ff: F.head, w: 700, fill: C.blue });
  b += text({ x: M, y: y0 + 210 * k, s: 'Modern sites & web apps — designed,', size: Math.round(25 * k), ff: F.body, w: 400, fill: C.white, op: 0.72 });
  b += text({ x: M, y: y0 + 248 * k, s: 'built and launched by iCube.', size: Math.round(25 * k), ff: F.body, w: 400, fill: C.white, op: 0.72 });

  // browser mockup
  const bw = W - 2 * M;
  const bh = S.key === 'story' ? H * 0.40 : S.key === 'por' ? H * 0.36 : H * 0.34;
  const by = H - M - 110 - bh;
  b += rect(M, by, bw, bh, { r: 24, fill: C.white, op: 0.05 });
  b += rect(M, by, bw, bh, { r: 24, stroke: C.white, sw: 1.4, op: 0.16 });
  b += line(M, by + 64, M + bw, by + 64, C.white, 1.4, 0.16);
  [0, 1, 2].forEach((i) => (b += circle(M + 34 + i * 26, by + 32, 7, { fill: i === 0 ? C.blue : C.mint, op: i === 0 ? 1 : 0.55 })));
  b += rect(M + 130, by + 17, bw - 260, 30, { r: 15, fill: C.white, op: 0.07 });
  b += circle(M + 152, by + 32, 5, { fill: C.mint });
  b += text({ x: M + 168, y: by + 38, s: 'icubeinnovationslab', size: 17, ff: F.mono, w: 500, fill: C.white, op: 0.7 });
  // wireframe inside
  const px = M + 34, py = by + 96, pw = bw - 68, ph = bh - 130;
  b += rect(px, py, pw * 0.56, ph * 0.52, { r: 14, fill: 'url(#cta03)', op: 0.9 });
  b += rect(px + pw * 0.62, py, pw * 0.38, ph * 0.24, { r: 10, fill: C.mint, op: 0.85 });
  b += rect(px + pw * 0.62, py + ph * 0.3, pw * 0.38, ph * 0.22, { r: 10, fill: C.white, op: 0.12 });
  for (let i = 0; i < 3; i++) b += rect(px, py + ph * 0.6 + i * 26, pw * (i === 2 ? 0.4 : 0.74 - i * 0.1), 12, { r: 6, fill: C.white, op: 0.2 });
  return { theme, body: b, glowId: '03' };
}

function post04(S) { // software
  const { W, H, M, k } = S;
  const theme = 'dark';
  let b = `<ellipse cx="${W * 0.2}" cy="${H * 0.85}" rx="${W * 0.55}" ry="${H * 0.4}" fill="url(#glow04)"/>`;
  const y0 = M + 140;
  b += text({ x: M, y: y0, s: '04 — SOFTWARE', size: Math.round(21 * k), ff: F.mono, w: 600, fill: C.mint, ls: 6 });
  b += text({ x: M, y: y0 + 78 * k, s: 'Software', size: Math.round(62 * k), ff: F.head, w: 700, fill: C.white });
  b += text({ x: M, y: y0 + 150 * k, s: 'that fits.', size: Math.round(62 * k), ff: F.head, w: 700, fill: C.mint });
  b += text({ x: M, y: y0 + 210 * k, s: 'Custom apps shaped around', size: Math.round(25 * k), ff: F.body, w: 400, fill: C.white, op: 0.72 });
  b += text({ x: M, y: y0 + 248 * k, s: 'the way you work.', size: Math.round(25 * k), ff: F.body, w: 400, fill: C.white, op: 0.72 });

  // terminal
  const bw = W - 2 * M;
  const bh = S.key === 'story' ? H * 0.42 : S.key === 'por' ? H * 0.36 : H * 0.36;
  const by = H - M - 110 - bh;
  b += rect(M, by, bw, bh, { r: 24, fill: C.ink });
  b += rect(M, by, bw, bh, { r: 24, stroke: C.mint, sw: 1.4, op: 0.35 });
  b += line(M, by + 60, M + bw, by + 60, C.mint, 1.4, 0.3);
  [0, 1, 2].forEach((i) => (b += circle(M + 34 + i * 26, by + 30, 7, { fill: i === 2 ? C.mint : C.blue, op: i === 2 ? 1 : 0.7 })));
  b += text({ x: M + bw / 2, y: by + 37, s: 'icube — build', size: 18, ff: F.mono, w: 500, fill: C.white, op: 0.55, anchor: 'middle' });
  const lines = [
    ['$ icube init --custom', C.blue],
    ['> gathering requirements', C.white],
    ['> building software', C.white],
    ['✓ web apps  ✓ tools  ✓ systems', C.mint],
    ['$ ready_', C.mint],
  ];
  lines.forEach((L, i) => {
    b += text({ x: M + 40, y: by + 118 + i * 52, s: L[0], size: Math.round(26 * k), ff: F.mono, w: i === 0 || i === 4 ? 700 : 400, fill: L[1], op: L[1] === C.white ? 0.85 : 1 });
  });
  return { theme, body: b, glowId: '04' };
}

function post05(S) { // printing — light theme
  const { W, H, M, k } = S;
  const theme = 'light';
  let b = `<ellipse cx="${W * 0.85}" cy="${H * 0.15}" rx="${W * 0.5}" ry="${H * 0.3}" fill="url(#glow05)"/>`;
  const y0 = M + 140;
  b += text({ x: M, y: y0, s: '05 — PRINTING', size: Math.round(21 * k), ff: F.mono, w: 600, fill: C.blue, ls: 6 });
  b += text({ x: M, y: y0 + 78 * k, s: 'Print that', size: Math.round(62 * k), ff: F.head, w: 700, fill: C.navy });
  b += text({ x: M, y: y0 + 150 * k, s: 'pops.', size: Math.round(62 * k), ff: F.head, w: 700, fill: C.blue });
  b += text({ x: M, y: y0 + 210 * k, s: 'Vivid colour. Crisp detail.', size: Math.round(25 * k), ff: F.body, w: 400, fill: C.navy, op: 0.75 });
  b += text({ x: M, y: y0 + 248 * k, s: 'On brand, every time.', size: Math.round(25 * k), ff: F.body, w: 400, fill: C.navy, op: 0.75 });

  // stacked sheets — centered in the region between body text and footer
  const cx = W / 2;
  const regionTop = y0 + 248 * k + 44;
  const regionBottom = H - M - 120;
  const sw = W * (S.key === 'story' ? 0.70 : S.key === 'por' ? 0.60 : 0.54);
  const sh = sw * 0.62;
  const zoneTop = (regionTop + regionBottom) / 2; // vertical center of stack
  const rot = (deg, dx, dy, inner) => `<g transform="translate(${cx + dx} ${zoneTop + dy}) rotate(${deg}) translate(${-sw / 2} ${-sh / 2})">${inner}</g>`;
  b += rot(-7, -18, 14, rect(0, 0, sw, sh, { r: 18, fill: C.navy }));
  b += rot(4, 16, 6, rect(0, 0, sw, sh, { r: 18, fill: C.blue }));
  b += rot(-1.5, 0, -6, rect(0, 0, sw, sh, { r: 18, fill: C.white, stroke: C.navy, sw: 1.5, op: 1 }) +
    rect(0, 0, sw, sh, { r: 18, fill: 'none' }) +
    // print content on top sheet
    rect(36, 40, sw * 0.5, 26, { r: 8, fill: C.navy, op: 0.9 }) +
    rect(36, 86, sw * 0.72, 12, { r: 6, fill: C.navy, op: 0.25 }) +
    rect(36, 110, sw * 0.6, 12, { r: 6, fill: C.navy, op: 0.25 }) +
    [C.blue, C.mint, C.navy, C.ink].map((col, i) => rect(36 + i * 54, sh - 76, 44, 30, { r: 6, fill: col })).join('') +
    markSvg({ x: sw - 96, y: sh - 96, h: 56, fill: C.blue })
  );
  // registration / crop marks at stack bounds
  const cm = (x, y, sx, sy) => line(x, y, x + sx * 34, y, C.navy, 2, 0.5) + line(x, y, x, y + sy * 34, C.navy, 2, 0.5);
  const yTop = zoneTop - sh / 2 - 36, yBot = zoneTop + sh / 2 + 36;
  b += cm(M, yTop, 1, 1) + cm(W - M, yTop, -1, 1) + cm(M, yBot, 1, -1) + cm(W - M, yBot, -1, -1);
  return { theme, body: b, glowId: '05' };
}

function post06(S) { // CTA
  const { W, H, M, k } = S;
  const theme = 'dark';
  let b = rect(0, 0, W, H, { fill: 'url(#cta06)' });
  b += `<ellipse cx="${W * 0.8}" cy="${H * 0.25}" rx="${W * 0.55}" ry="${H * 0.3}" fill="url(#glow06)" opacity=".8"/>`;
  b += grid(W, H, false);
  const cx = W / 2;
  const mh = Math.min(210, H * 0.14);
  b += markSvg({ x: cx - (mh * MARK_VB.w / MARK_VB.h) / 2, y: H * (S.key === 'story' ? 0.30 : 0.24), h: mh, fill: C.white });
  const ty = H * (S.key === 'story' ? 0.30 : 0.24) + mh + 90 * k;
  b += text({ x: cx, y: ty, s: "Let's build", size: Math.round(74 * k), ff: F.head, w: 800, fill: C.white, anchor: 'middle' });
  b += text({ x: cx, y: ty + 84 * k, s: 'together.', size: Math.round(74 * k), ff: F.head, w: 800, fill: C.mint, anchor: 'middle' });
  b += text({ x: cx, y: ty + 156 * k, s: 'TECH · PRINTING · WEB · SOFTWARE', size: Math.round(22 * k), ff: F.mono, w: 500, fill: C.white, ls: 5, anchor: 'middle', op: 0.85 });
  // big chips
  const cy = ty + 240 * k;
  const fs = Math.round(26 * k);
  const w1 = pillW('DM US', fs, 3), w2 = pillW('LINK IN BIO', fs, 3);
  const total = w1 + 18 + w2;
  b += pill(cx - total / 2 + w1, cy, 'DM US', { fill: C.white, textColor: C.navy, h: 74, fs, ff: F.mono, w: 700, ls: 3 });
  b += pill(cx + total / 2, cy, 'LINK IN BIO', { stroke: C.white, textColor: C.white, h: 74, fs, ff: F.mono, w: 700, ls: 3 });
  b += text({ x: cx, y: cy + 130 * k, s: HANDLE, size: Math.round(30 * k), ff: F.mono, w: 600, fill: C.white, anchor: 'middle', ls: 1 });
  return { theme, body: b, glowId: '06', footerPills: false };
}

const POSTS = [
  { id: '01-intro', fn: post01 },
  { id: '02-services', fn: post02 },
  { id: '03-web', fn: post03 },
  { id: '04-software', fn: post04 },
  { id: '05-printing', fn: post05 },
  { id: '06-cta', fn: post06 },
];

/* ─────────────────────── assembly ─────────────────────── */
function buildPost(post, S) {
  const { W, H, M } = S;
  const idx = post.id.slice(0, 2);
  const { theme, body, footerPills = true } = post.fn(S);
  const light = theme === 'light';
  const bg = theme === 'navy' ? C.navy : light ? C.fog : C.ink;
  const variant = light ? 'navy' : 'white';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += defs(idx, theme);
  svg += rect(0, 0, W, H, { fill: bg });
  if (post.id !== '06-cta') svg += grid(W, H, light);
  svg += body;
  if (post.id !== '06-cta') {
    svg += ticks(W, H, M, light);
    svg += header(W, M, idx, { light, variant });
    svg += footer(W, H, M, { light, pills: footerPills });
  } else {
    // minimal chrome for CTA: handle at very bottom
    svg += text({ x: W / 2, y: H - 56, s: FULLNAME, size: 18, ff: F.mono, w: 500, fill: C.white, ls: 4, anchor: 'middle', op: 0.6 });
    svg += text({ x: W / 2, y: 70, s: '06 — GET IN TOUCH', size: 21, ff: F.mono, w: 600, fill: C.white, ls: 6, anchor: 'middle', op: 0.75 });
  }
  svg += '</svg>';
  if (/undefined|NaN/.test(svg)) {
    throw new Error(`${post.id}-${S.label}: generated SVG contains undefined/NaN`);
  }
  return svg;
}

/* ─────────────────────── render ─────────────────────── */
function fontFiles() {
  const base = path.join(ROOT, 'node_modules', '@expo-google-fonts');
  const files = [];
  const walk = (pkg, filter) => {
    const dir = path.join(base, pkg);
    for (const d of fs.readdirSync(dir)) {
      if (!filter(d)) continue;
      const ttf = path.join(dir, d, fs.readdirSync(path.join(dir, d)).find((f) => f.endsWith('.ttf')));
      if (ttf) files.push(ttf);
    }
  };
  walk('poppins', (d) => /^(400Regular|500Medium|600SemiBold|700Bold|800ExtraBold)$/.test(d));
  walk('space-grotesk', (d) => /^(400Regular|500Medium|600SemiBold|700Bold)$/.test(d));
  walk('jetbrains-mono', (d) => /^(400Regular|500Medium|600SemiBold|700Bold)$/.test(d));
  return files;
}

const FONTS = fontFiles();
console.log('fonts:', FONTS.length);

let count = 0;
for (const post of POSTS) {
  for (const S of SIZES) {
    const svg = buildPost(post, S);
    const svgPath = path.join(OUT_SVG, `${post.id}-${S.label}.svg`);
    fs.writeFileSync(svgPath, svg);
    const resvg = new Resvg(svg, {
      font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Space Grotesk' },
    });
    const png = resvg.render().asPng();
    const pngPath = path.join(OUT_PNG, `${post.id}-${S.label}.png`);
    fs.writeFileSync(pngPath, png);
    count++;
    console.log('✓', path.basename(svgPath), '/', path.basename(pngPath), `${(svg.length / 1024).toFixed(0)}KB svg, ${(png.length / 1024).toFixed(0)}KB png`);
  }
}
console.log(`done: ${count} SVG + ${count} PNG`);
