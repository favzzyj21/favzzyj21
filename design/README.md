# iCube Innovations Lab — Instagram Post Kit

Six editable post designs × three Instagram sizes, built from the official brand
assets and rendered with the iCube palette. Professionally clean, futuristic
direction (design-system skeleton adapted from the
[awesome-design-skills](https://github.com/bergside/awesome-design-skills) “futuristic”
skill, re-tokenized to iCube's own colours and fonts).

## The six designs

| # | File stem | Message |
|---|-----------|---------|
| 01 | `01-intro` | Brand hero — lockup + “TECH · INNOVATE · IMPACT” |
| 02 | `02-services` | Four cards: Tech Solutions, Web Solutions, Software, Innovation |
| 03 | `03-web` | Web solutions spotlight with browser mockup |
| 04 | `04-software` | Custom software spotlight with terminal motif |
| 05 | `05-impact` | Impact spotlight — light theme, rising bars |
| 06 | `06-cta` | Call to action — social row + link in bio |

**Revised after client review (2026-11-26):** printing was removed from the
storyline and the “DM US” pill was replaced with Instagram · LinkedIn · X marks
with `@icubeinnovationslab` written beside them, matching the client's flyers.
`05-printing` became `05-impact`. Do not reintroduce printing or a DM prompt.

**Reels corrected to match (2026-11-27).** Both reels carried the old
`TECH · PRINTING · WEB · SOFTWARE` line and a `DM US · LINK IN BIO` pill in
their outros; they now use `TECH · INNOVATE · IMPACT` plus the same
Instagram · LinkedIn · X row with the handle, and a plain `LINK IN BIO` outline
pill. Picture was re-rendered; the VO + bed mix was re-created unchanged
(audio MD5 identical to the approved mix). `mux.sh` was also fixed — it used to
rebuild from a stale `reels/_clean/` backup and would silently restore the old
outro over a fresh render. It now detects a silent (freshly rendered) video and
uses that as the picture source.

Every design is exported at:

- `1080 × 1080` — feed square
- `1080 × 1350` — feed portrait
- `1080 × 1920` — story / reel cover

## Layout

```
design/
├── assets/            # brand elements (vector + source PNGs)
│   ├── mark-{blue,white,navy}.svg   # traced logo mark, 3 colourways
│   ├── mark.path.txt                # shared path data
│   ├── lockup-{white,navy}.svg      # mark + wordmark, 2 colourways
│   └── *.png / palette.jpg          # original uploads (reference)
├── src/posts/*.svg    # EDITABLE sources — one file per design × size
├── exports/*.png      # rendered posts, ready to upload
├── scripts/build.mjs  # generator: SVG assembly + PNG rendering
└── preview.jpg        # contact sheet of all 18 outputs
```

## Editing

**Copy / colours / layout** — edit `scripts/build.mjs`:

- `C` — brand tokens: `#03050a` ink, `#06195b` navy, `#3c6bff` blue, `#08deaa` mint
- `HANDLE` / `FULLNAME` — footer identity strings
- `POSTS` + the `post0N()` functions — each design's content and composition
- `SIZES` — margins and type scale per format

Then re-render:

```bash
npm run build     # writes src/posts/*.svg and exports/*.png
```

**Directly in Figma / Illustrator** — open any file from `src/posts/`. Text is
live `<text>` with font-family names; install the free Google fonts to match:

- **Poppins** (600/700/800) — headlines, wordmark-style display
- **Space Grotesk** (400/500) — body copy
- **JetBrains Mono** (500/600) — labels, index numbers, terminal motif

The logo artwork is embedded as vector paths, so marks and lockups scale and
recolor without any external files.

## Element usage per design

- **01** — white lockup hero, ghost mark, mint rule, services line
- **02** — navy surface, line icons (chip / printer / browser / code), numbered
  cards, gradient highlight on Software
- **03** — blue glow, browser chrome mockup, abstract wireframe blocks
- **04** — mint terminal window, mono syntax lines
- **05** — light surface, navy lockup, stacked print sheets, crop marks,
  palette swatches
- **06** — full blue→navy gradient, white mark, oversized CTA chips
