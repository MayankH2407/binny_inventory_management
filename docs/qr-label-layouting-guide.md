# QR Label Layouting — Practical Guide & Hand-off

A self-contained reference for building **printable QR labels that vary per client** — different sizes, layouts, fields, and info on the same engine. Written from a production system (Binny Footwear inventory) that prints child-box and master-carton QR labels on thermal label printers, tuned against real client feedback and real hardware.

> **How to use this doc:** Read §1–§3 first (approach + the requirements you must pull from each client). §4–§7 are the "how it actually works on real printers" knowledge. §8 is the pattern that makes one codebase serve many clients. §9–§11 are verification, pitfalls, and copy-paste starter code. Hand this whole file to Claude along with the client's label spec.

---

## 1. TL;DR — the approach that works

- **Render the label as HTML + CSS, then `window.print()`** into a popup window sized exactly to the label. Do **not** try to draw labels on a `<canvas>` or generate a PDF by hand — HTML/CSS gives you text wrapping, auto-fit, and easy per-client layout for free, and thermal drivers print HTML crisply.
- **Lay everything out in millimetres (`mm`), never pixels.** Label hardware is specified in mm; `@page { size: W mm H mm }` + `mm` on every box makes the print physically correct regardless of screen DPI.
- **Generate the QR as an inline SVG** (`qrcode.react`'s `QRCodeSVG`, or `qrcode` → SVG string). SVG scales to any mm size without blur; PNG can soften at small module sizes.
- **Make the layout data-driven / config-driven** (§8) so a new client = a new config object, not a new code file.
- **The only authoritative test is a real printed sticker** on the client's actual printer. Headless-browser previews catch layout/clipping bugs but not thermal density, smearing, or scanner behaviour (§9).

---

## 2. The one-paragraph mental model

A label is: a **fixed physical rectangle** (e.g. 48×48 mm) divided into **blocks** (article name, colour, size, MRP, QR + human-readable code, manufacturer footer). Each block has a **fixed height in mm**. Text inside a block must **fill it without clipping** — which means fonts are not hard-coded; they're **auto-fit** at render time (grow to fill, or shrink so long values still fit). The QR block is sized so the QR module size stays scannable. Everything else (which blocks, their order/heights, what fields, the page size) is what changes per client — so it lives in a **config**, and a single **renderer** turns config + data into the print HTML.

---

## 3. Requirements checklist — pull ALL of this from each client BEFORE coding

Hand this list to the client. Missing any one of these causes a reprint cycle.

### 3.1 Physical label & printer
- [ ] **Label dimensions** (width × height in mm). Get the *printable* area, not just the paper.
- [ ] **Printer make/model + type** (direct-thermal vs thermal-transfer vs laser/inkjet). Thermal is the norm for these; know the model.
- [ ] **Printer DPI** (203 dpi ≈ 8 dots/mm is most common; 300 dpi exists). This sets the smallest reliable line/QR module.
- [ ] **Roll/gap layout**: single label per row, or 2-up / 3-up across a wide roll? Gap between labels? Gutter/margin at the edges? (Binny: 48 mm labels on a 100 mm roll, 2-up, 1 mm margin each side → 2 mm between adjacent borders.)
- [ ] **Border?** Some clients want a printed black border around each label; some don't (and a border eats ~1 mm of content on each side).
- [ ] **Media orientation** (portrait/landscape) and whether the printer auto-rotates.

### 3.2 Content / fields
- [ ] **Exact field list** and the **label** (caption) for each (e.g. "M.R.P.", "Size:", "Packed on:").
- [ ] **Priority / hierarchy** — which field is largest/boldest, what can shrink, what must never wrap vs what may wrap.
- [ ] **Fixed text** (manufacturer name/address, "Inc. of all taxes", customer-care number, statutory text).
- [ ] **Formatting rules**: currency symbol & decimals, date format, uppercase/title-case, units (e.g. "2N (1 Pair)").
- [ ] **Max lengths / worst-case values** — get the *longest* real article name, colour, size code they'll ever print. Design for the worst case, not the demo value. (A 3-char size like `12K` clipped a label tuned for 2-char sizes — a real bug here.)
- [ ] **Logo / image?** If yes, get it as SVG or high-res; it must be embedded (data URI) for printing.
- [ ] **Language / script** (Devanagari, Arabic, etc.) — affects font choice and RTL.

### 3.3 QR / barcode
- [ ] **What does the QR encode?** A bare barcode string? A URL? JSON? Keep it as short as possible (shorter = fewer modules = larger, more scannable modules at a fixed size).
- [ ] **Is there also a linear barcode** (Code128/EAN) or human-readable text under the QR?
- [ ] **Scanner** they'll use (phone camera vs dedicated 1D/2D scanner) and scan distance — drives minimum QR size and error-correction level.
- [ ] **Error-correction level** (L/M/Q/H) — see §6.

### 3.4 Volume & workflow
- [ ] **How many labels per run** (10? 1500?). High volume changes the generation strategy (batch, not per-item network calls — see §11).
- [ ] **Reprint** support and whether a reprint must keep the *original* data (e.g. original packed-date, not today's).
- [ ] Where printing is triggered from (which screens/roles).

> Tip: ask for a **photo/scan of an existing/approved label** and a **hand-drawn or dimensioned mock** with mm on each block. That single artefact resolves most ambiguity.

---

## 4. Core technique — HTML → print

```
┌ popup window ────────────────┐
│  @page { size: WxH mm; margin:0 } │  ← physical page = the label (or the row of labels)
│  .label { width/height in mm } │  ← the label rectangle
│    blocks in mm …             │
│    <svg> QR </svg>            │
│  <script> auto-fit; print()   │  ← fit fonts, THEN window.print()
└──────────────────────────────┘
```

Key rules (all learned the hard way):

- **`@page { size: <W>mm <H>mm; margin: 0; }`** — makes the print page exactly the label/row. `margin:0` is essential or the driver adds its own and shifts everything.
- **`* { box-sizing: border-box; margin:0; padding:0 }`** — borders/padding must not add to your mm dimensions.
- **Every dimension in mm.** Font sizes can be `pt` or `px`; at print time both map to physical size. (This guide's auto-fit works in `px` because it measures the DOM.)
- **Open a popup, `document.write(html)`, `document.close()`, then let an embedded `window.onload` run auto-fit and call `window.print()`.** Closing flushes the write buffer; onload guarantees layout is done before measuring.
- **Popup blocked?** Detect `window.open` returning null and tell the user to allow popups.

Minimal shell:
```js
const w = window.open('', '_blank');
w.document.write(htmlString);   // htmlString contains <style>, the labels, and the fit+print <script>
w.document.close();
w.focus();
```

---

## 5. Thermal-printer & print-engine realities (the non-obvious stuff)

These are the gotchas that make print output differ from what you see on screen:

1. **Prefer `inline-block` over `flexbox` for the top-level label grid.** Flex's cross-axis *stretch* is implemented inconsistently in **print** contexts across browsers/drivers; inline-block is boringly reliable. (Flex is fine *inside* a block for centering — just not as the page-level label layout.)
2. **`font-size: 0` on an inline-block container** kills the whitespace gap between inline-block children (otherwise the newline between two `<div>`s renders as a real space and pushes a 2-up row to a 3rd column). Reset font-size on the children.
3. **Page breaks for multi-label runs:** wrap each printed page/row in an element with `page-break-after: always; page-break-inside: avoid;` and set `page-break-after: avoid` on the last one (else you get a trailing blank label).
4. **CSS table rows don't enforce max-height.** A `<tr>`/cell grows to fit its content. If you rely on a block being exactly N mm tall (so an auto-fit height check is meaningful), give the *inner* content wrapper a **fixed height in mm** — don't trust the row. (This is why every fitted block below sits in a fixed-height `.fit-box` wrapper.)
5. **203 dpi ≈ 8 dots/mm.** A hairline "1px" border may render as ~0.125 mm and can drop out or double; use explicit small mm/pt values and test. Thin light-grey lines often won't print at all on direct-thermal.
6. **Direct-thermal has no greys** — it's essentially 1-bit. Avoid relying on colour or subtle shading; use bold/borders/size for hierarchy.
7. **Leave a quiet margin** — thermal heads and label registration drift ~0.5–1 mm; don't put critical glyphs hard against the edge.
8. **Test the actual worst-case data**, and print a **full sheet/roll**, not one label — 2-up/3-up spacing bugs only show across a row.

---

## 6. QR-code specifics for print scannability

- **Encode the minimum.** Fewer characters → lower QR "version" → fewer/larger modules → easier scan at a fixed physical size. If you only need an ID, encode the ID, not a full URL.
- **Error-correction level (ECC):**
  - `L` (7%) → smallest/most data, least robust.
  - `M` (15%) → **good default for clean printed labels** (used here).
  - `Q` (25%) / `H` (30%) → use if labels get smudged, curved, or partially covered, or if you overlay a logo. Higher ECC = more modules = needs more physical size to stay scannable.
- **Module size (the little squares) is what actually determines scannability.** Aim for a printed module ≥ ~0.33 mm (≈ 4 dots at 203 dpi is comfortable; the EAN/QR practical floor is often quoted around 0.25–0.33 mm/module). Bigger is safer. If a dense QR won't scan, either encode less data, raise the physical QR size, or lower ECC.
- **Quiet zone:** keep a clear (blank) margin of ≥ ~2–4 modules around the QR. `qrcode.react` adds a small quiet zone; don't crowd the QR with a tight border.
- **Render as SVG** at an explicit mm size (`svg { width: 15mm; height: 15mm }`). SVG stays crisp; a scaled PNG can blur module edges.
- **Human-readable fallback:** print the encoded string as text under the QR (bold, monospace-ish, uppercase) so it's usable if a scan fails.
- **Always test the printed QR with the client's real scanner**, not just the phone you have on your desk.

---

## 7. Auto-fitting text so it fills the block and never clips

Client labels almost always have variable-length values (short article name vs long one) that must look full but never overflow. Don't hand-tune font sizes — **measure and fit at render time.**

Two primitives (vanilla JS in the print window's `<script>`; run in `window.onload` before `print()`):

**`fitFill` — binary-search the largest font that fits width AND height** (use for values that should *fill* their block, and may wrap):
```js
function fitFill(selector, maxPx, minPx) {
  document.querySelectorAll(selector).forEach(function (el) {
    function fits(px) {
      el.style.fontSize = px + 'px';
      return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
    }
    var lo = minPx, hi = maxPx, best = minPx;
    for (var i = 0; i < 30 && hi - lo > 0.25; i++) {
      var mid = (lo + hi) / 2;
      if (fits(mid)) { best = mid; lo = mid; } else { hi = mid; }
    }
    el.style.fontSize = best + 'px';
  });
}
```

**`fitShrink` — keep a chosen large font, only shrink if it overflows** (use when you want a fixed big look, e.g. a size numeral, and only degrade for the rare long value):
```js
function fitShrink(selector, minPx) {
  document.querySelectorAll(selector).forEach(function (el) {
    var px = parseFloat(getComputedStyle(el).fontSize), g = 0;
    while ((el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && px > minPx && g < 400) {
      px -= 0.5; el.style.fontSize = px + 'px'; g++;
    }
  });
}
```

**The critical prerequisite:** the fitted element's `clientHeight` must be **deterministic** — i.e. it sits in a **fixed-height wrapper** (height in mm), or is a `flex:1; min-height:0; overflow:hidden` row inside a fixed-height flex column. If the element can grow with its content (default table/inline behaviour), the height half of `fits()` is meaningless and text silently clips or balloons.

**Wrap vs no-wrap per block:**
- Fixed-format, bounded text (dates, "Content: 2N (1 Pair)") → **single line**, `white-space:nowrap`, `fitFill` on width only effectively.
- Free-text that can be long (product name, colour) → **allow wrap** (`white-space:normal; word-break:break-word`) + `fitFill` so it shrinks across multiple lines and never clips.
- A big hero numeral (size) → `fitShrink` from a large inline start.
- To remove vertical blank space above/below a big glyph, set a **tight `line-height`** (≈ the glyph's cap-height, e.g. `0.62–0.85`) so `fitFill` grows the actual digits to the cell edges rather than the em box's blank ascender/descender.

---

## 8. Making ONE engine serve MANY clients (the important part)

Separate **config** (varies per client) from **renderer** (shared code). A client is a data object; the renderer turns `config + rowData` into print HTML.

### 8.1 A label-config schema (starting point)
```ts
type Unit = 'mm';
interface LabelConfig {
  clientId: string;
  page:  { width: number; height: number; unit: Unit; margin: number }; // physical label (or per-label cell)
  layout:{ perRow: number; gap: number; border: boolean };              // 1-up / 2-up …, gap, border on/off
  qr:    { field: string; sizeMm: number; ecc: 'L'|'M'|'Q'|'H'; showText: boolean };
  blocks: Block[];        // ordered top→bottom (or a grid) — this IS the layout
  fixedTexts?: Record<string,string>;  // manufacturer line, tax note, etc.
  fonts?: { family: string };
}
interface Block {
  key: string;                 // maps to a field in rowData, or a fixedTexts key
  heightMm: number;
  caption?: string;            // e.g. "M.R.P."
  align?: 'left'|'center'|'right';
  weight?: 'normal'|'bold'|'900';
  transform?: 'upper'|'title'|'none';
  wrap?: boolean;              // true → fitFill multiline; false → single line
  fit?: 'fill'|'shrink'|'none';
  maxPx?: number; minPx?: number;
  format?: 'currency'|'date'|'raw';
}
```
A new client requirement becomes a new `LabelConfig` (often just tweaked block heights, a different page size, added/removed blocks) — **no renderer change**. Store configs per client (JSON/DB) and pick by `clientId`.

### 8.2 The renderer's job (pure function)
`renderLabelHTML(config, rows) → htmlString` that:
1. emits `@page { size }` + a stylesheet derived from `config` (block heights, borders, per-row layout),
2. for each row, emits the blocks in order, formatting each field per its `format`/`transform`, embedding the QR SVG for `config.qr.field`,
3. appends the `fitFill`/`fitShrink` calls (driven by which blocks have `fit:'fill'|'shrink'`),
4. calls `window.print()` in `onload`.

Because layout is config-driven, "the label sizing, layout, info — everything changed for multiple clients" is handled by swapping the config, and the hard-won print/fit logic stays in one tested place.

### 8.3 Migration path from "just a QR"
The coworker's current label is *only* a QR + barcode text. That's just a `LabelConfig` with one QR block and one text block. Growing to full client labels = adding blocks to the config and setting their heights — the renderer already knows how to fit and print them.

---

## 9. Verification workflow

1. **Headless preview (fast, catches layout/clipping):** render the print HTML and screenshot it in headless Chrome (Playwright/Puppeteer) at the label's mm size. Assert no element `scrollWidth/Height` exceeds its box (i.e. nothing clipped) across **short AND worst-case long** values. This project has a Playwright suite that opens the popup DOM and checks the auto-fit results.
2. **Print-to-PDF preview:** browsers' "Save as PDF" with the exact `@page` size shows real pagination/margins.
3. **Authoritative: a real printed sticker on the client's actual printer.** Only this reveals thermal density, line dropout, smearing, registration drift, and real scanner behaviour. Nothing on screen substitutes for it — always gate go-live on a client-printed sample.
4. **Scan test** the printed QR with the client's real scanner at real distance.

---

## 10. Pitfalls & lessons learned (from this codebase)

- **Design for the longest real value, not the demo.** A size cell tuned for 1–2 chars clipped `12K`; fixed by auto-fit + testing worst-case strings.
- **A "fixed 3-line" block wastes space** when text is short and clips when long — prefer wrap + fit-to-fill so the block is always packed with the largest font that fits.
- **Rowspan/percentage-height children have no definite height** in table layout → auto-fit's height check breaks. Give fitted content an explicit mm height.
- **Reprints must preserve original data** (e.g. the original packed-on date), not regenerate "today". Derive dynamic fields from the record, not `new Date()`.
- **High-volume generation:** don't do a network/QR round-trip per label. Batch the data, render all QRs client-side (SVG), build the HTML once. A per-box loop with a 30 s HTTP timeout failed at ~120 labels here; batching fixed it.
- **Casing/normalisation:** decide upper/title-case rules up front and normalise on write; inconsistent casing caused duplicate/again-printed variants elsewhere in this system.
- **Popup blockers** silently kill printing — always handle `window.open() === null`.
- **`line-height` is your friend** for removing the blank band around big glyphs.

---

## 11. Copy-paste starter (config-driven, single client to begin)

A minimal, dependency-light renderer the coworker can drop in and grow. Uses the `qrcode` npm package to make an SVG string (framework-agnostic); swap for `qrcode.react` in React.

```ts
import QRCode from 'qrcode';

// 1) A client config (the ONLY thing that changes per client)
const config /*: LabelConfig */ = {
  clientId: 'demo',
  page: { width: 50, height: 30, unit: 'mm', margin: 1 },
  layout: { perRow: 1, gap: 2, border: true },
  qr: { field: 'code', sizeMm: 18, ecc: 'M', showText: true },
  fonts: { family: 'Arial, Helvetica, sans-serif' },
  blocks: [
    { key: 'title', heightMm: 6, align: 'center', weight: 'bold', transform: 'upper', wrap: true, fit: 'fill', maxPx: 26, minPx: 6 },
    { key: 'code',  heightMm: 18, align: 'center' }, // QR block (rendered specially)
  ],
  fixedTexts: {},
};

// 2) Render (pure): config + rows -> HTML string
async function renderLabelHTML(cfg, rows) {
  const labels = await Promise.all(rows.map(async (row) => {
    const qrSvg = await QRCode.toString(String(row[cfg.qr.field]), {
      type: 'svg', errorCorrectionLevel: cfg.qr.ecc, margin: 2,
    });
    const blocks = cfg.blocks.map((b) => {
      if (b.key === cfg.qr.field) {
        return `<div class="qr"><div class="qrbox">${qrSvg}</div>${cfg.qr.showText ? `<div class="qrtext">${row[b.key]}</div>` : ''}</div>`;
      }
      const val = format(row[b.key] ?? cfg.fixedTexts?.[b.key] ?? '', b);
      return `<div class="blk ${b.wrap ? 'wrap' : 'nowrap'}" data-fit="${b.fit||'none'}"
                   data-max="${b.maxPx||24}" data-min="${b.minPx||6}"
                   style="height:${b.heightMm}mm;text-align:${b.align||'left'};font-weight:${b.weight||'normal'}">
                <span class="fit">${val}</span></div>`;
    }).join('');
    return `<div class="label">${blocks}</div>`;
  }));

  return `<html><head><style>
    @page { size:${cfg.page.width}mm ${cfg.page.height}mm; margin:0 }
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:${cfg.fonts?.family || 'Arial'}}
    .label{width:${cfg.page.width}mm;height:${cfg.page.height}mm;
           ${cfg.layout.border ? 'border:1px solid #000;' : ''}
           padding:${cfg.page.margin}mm;overflow:hidden;
           page-break-after:always;page-break-inside:avoid;display:flex;flex-direction:column}
    .blk{overflow:hidden;display:flex;align-items:center}
    .blk.wrap .fit{white-space:normal;word-break:break-word}
    .blk.nowrap .fit{white-space:nowrap}
    .qr{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .qr svg{width:${cfg.qr.sizeMm}mm;height:${cfg.qr.sizeMm}mm}
    .qrtext{font-size:7pt;font-weight:bold;text-transform:uppercase;margin-top:0.5mm}
  </style></head><body>
    ${labels.join('')}
    <script>
      function fitFill(el,maxPx,minPx){function fits(px){el.style.fontSize=px+'px';
        return el.scrollWidth<=el.parentElement.clientWidth+1 && el.scrollHeight<=el.parentElement.clientHeight+1;}
        var lo=minPx,hi=maxPx,best=minPx;for(var i=0;i<30&&hi-lo>0.25;i++){var m=(lo+hi)/2;if(fits(m)){best=m;lo=m;}else hi=m;}
        el.style.fontSize=best+'px';}
      window.onload=function(){
        document.querySelectorAll('.blk[data-fit="fill"] .fit').forEach(function(el){
          fitFill(el, +el.parentElement.dataset.max, +el.parentElement.dataset.min);});
        window.print();
      };
    </script></body></html>`;

  function format(v, b){
    v = String(v);
    if (b.transform==='upper') v = v.toUpperCase();
    if (b.format==='currency') v = '₹ ' + Number(v).toFixed(2);
    if (b.caption) v = b.caption + ' ' + v;
    return v;
  }
}

// 3) Print
async function print(rows) {
  const html = await renderLabelHTML(config, rows);
  const w = window.open('', '_blank');
  if (!w) return alert('Please allow popups to print labels');
  w.document.write(html); w.document.close(); w.focus();
}
```

Grow it by: adding blocks to `config.blocks`, supporting `perRow > 1` (wrap labels in a `.row` with `font-size:0` + `page-break`), adding `fitShrink`, and loading `config` per client. The reference implementation with the full 6-block footwear label (mm heights 10/7/10/5/5/10, rowspan size + QR cells, `fitFill`/`fitShrink`, MRP block) is in this repo at `frontend/src/lib/childBoxLabel.ts` — a good worked example to copy patterns from.

---

## 12. Quick-start for the coworker's Claude

Give Claude: **(a)** this file, **(b)** the client's completed §3 checklist, **(c)** a photo/mock of the target label. Then: define the `LabelConfig`, adapt the §11 renderer, preview headless against short + worst-case values (§9), and iterate to a **client-printed sample** before shipping. Keep the print/fit engine shared; express every client difference as config.
