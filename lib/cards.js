// Share images: the picture a link preview shows when a page is posted on social
// media or in a chat, and the image search engines may show beside a result.
// Each post, project, note and visual gets its own 1200×630 card with its title;
// every other page uses the site card.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { createRequire } from "node:module";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import site from "../src/_data/site.js";

const require = createRequire(import.meta.url);
const font = (weight) => woffToSfnt(readFileSync(require.resolve(`@fontsource/alegreya-sans/files/alegreya-sans-latin-${weight}-normal.woff`)));

/**
 * Unpacks a WOFF font into the plain TrueType/OpenType font inside it. The card
 * renderer reads plain fonts directly but can't reliably decompress WOFF itself.
 */
function woffToSfnt(woff) {
  if (woff.toString("latin1", 0, 4) !== "wOFF") throw new Error("not a WOFF font");
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const at = 44 + i * 20;
    const [offset, compLength, origLength] = [woff.readUInt32BE(at + 4), woff.readUInt32BE(at + 8), woff.readUInt32BE(at + 12)];
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({ tag: woff.subarray(at, at + 4), checksum: woff.readUInt32BE(at + 16), data: compLength < origLength ? inflateSync(raw) : raw });
  }
  const pad = (n) => (n + 3) & ~3;
  const headerSize = 12 + 16 * numTables;
  const out = Buffer.alloc(headerSize + tables.reduce((sum, t) => sum + pad(t.data.length), 0));
  const power = 2 ** Math.floor(Math.log2(numTables));
  out.writeUInt32BE(woff.readUInt32BE(4), 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(power * 16, 6);
  out.writeUInt16BE(Math.log2(power), 8);
  out.writeUInt16BE(numTables * 16 - power * 16, 10);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    t.tag.copy(out, at);
    out.writeUInt32BE(t.checksum, at + 4);
    out.writeUInt32BE(offset, at + 8);
    out.writeUInt32BE(t.data.length, at + 12);
    t.data.copy(out, offset);
    offset += pad(t.data.length);
  });
  return out;
}

// The site's light colours, from src/css/style.css.
const COLOURS = { bg: "#fcfcfb", fg: "#1a1a1c", muted: "#66646a", rule: "#e2e0e2", accent: "#a3182b" };
export const WIDTH = 1200;
export const HEIGHT = 630;

let fonts;
const loadFonts = () =>
  (fonts ??= [
    { name: "Alegreya Sans", data: font(400), weight: 400, style: "normal" },
    { name: "Alegreya Sans", data: font(700), weight: 700, style: "normal" },
  ]);

const el = (type, style, children) => ({ type, props: { style, children } });

/** Long titles get smaller type so they still fit in four lines. */
function titleSize(title, quote) {
  const n = title.length;
  if (n <= 40) return quote ? 72 : 84;
  if (n <= 80) return 64;
  if (n <= 140) return 52;
  return 42;
}

function layout({ title, label, credit, quote }) {
  const shown = title.length > 220 ? `${title.slice(0, 217).replace(/\s+\S*$/, "")}…` : title;
  return el(
    "div",
    { width: WIDTH, height: HEIGHT, boxSizing: "border-box", display: "flex", flexDirection: "column", backgroundColor: COLOURS.bg, paddingTop: 64, paddingBottom: 64, paddingLeft: 80, paddingRight: 80, fontFamily: "Alegreya Sans" },
    [
      el("div", { display: "flex", fontSize: 34, color: COLOURS.muted }, label || " "),
      el("div", { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }, [
        el(
          "div",
          { display: "flex", fontSize: titleSize(shown, quote), fontWeight: 700, lineHeight: 1.12, color: quote ? COLOURS.fg : COLOURS.accent },
          quote ? `“${shown}”` : shown
        ),
        ...(credit ? [el("div", { display: "flex", marginTop: 28, fontSize: 36, color: COLOURS.muted }, `– ${credit}`)] : []),
      ]),
      el(
        "div",
        { display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: `3px solid ${COLOURS.accent}`, paddingTop: 24, fontSize: 36 },
        [el("div", { display: "flex", fontWeight: 700, color: COLOURS.fg }, site.author), el("div", { display: "flex", color: COLOURS.muted }, new URL(site.url).host)]
      ),
    ]
  );
}

const rendered = new Map();
/** A PNG card. `card` is { title, label?, credit?, quote? }. */
export async function render(card) {
  const key = JSON.stringify(card);
  if (!rendered.has(key)) {
    const svg = await satori(layout(card), { width: WIDTH, height: HEIGHT, fonts: loadFonts() });
    rendered.set(key, new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng());
  }
  return rendered.get(key);
}

/** Writes each card to the built site, at `${url}card.png`, or /card.png for the site card. */
export async function write(outputDir, cards) {
  for (const card of cards) {
    const file = path.join(outputDir, ...card.url.split("/").filter(Boolean), "card.png");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, await render(card));
  }
}
