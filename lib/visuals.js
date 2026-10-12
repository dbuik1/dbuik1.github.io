// Visuals: animations, simulations and interactive diagrams, each one a
// self-contained web page kept in its own folder:
//
//   src/visuals/<slug>/index.md      title, description, tags; the body is your introduction
//   src/visuals/<slug>/visual.html   the visual itself, one HTML file with its script and style inside
//   src/visuals/<slug>/poster.png    optional still image shown before it runs
//
// A visual has its own page at /visuals/<slug>/, can be the subject of a post
// (`visual: <slug>` in the post's front matter), and can be placed in any post
// with {% visual "slug" %} or {% visual "slug", "Your caption" %}.
//
// On the site the visual runs inside a sandboxed frame: it can't read the page
// around it, and it can't load anything from other websites, so a visual can't
// slow the site down or track readers. Libraries it needs are served from
// /js/vendor/ on this site instead.
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as tags from "./tags.js";
import { markdown } from "./markdown.js";

export const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/visuals");
export const FILE = "visual.html";
export const POSTER = "poster.png";
export const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const MAX_BYTES = 2 * 1024 * 1024;

export const url = (slug) => `/visuals/${slug}/`;
export const fileUrl = (slug) => `/visuals/${slug}/${FILE}`;
export const htmlPath = (slug) => path.join(DIR, slug, FILE);
export const posterPath = (slug) => path.join(DIR, slug, POSTER);

/** Problems with a visual's front matter, as readable sentences. */
export function problems(data) {
  const out = [];
  if (!data.title) out.push("missing `title`");
  if (!String(data.description ?? "").trim()) {
    out.push("missing `description`: a few sentences saying what the visual shows, for people who can't see or run it");
  }
  out.push(...tags.problems(data.tags));
  return out;
}

const TAGS_WITH_SOURCES = /<(script|link|img|source|video|audio|iframe|embed|object|track|image|use)\b[^>]*?\s(?:src|href|data|poster|srcset)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]+)/gi;
const CSS_URLS = /(?:@import\s+(?:url\()?|url\()\s*["']?\s*((?:https?:)?\/\/[^"')\s]+)/gi;
const SCRIPT_URLS = /\b(?:fetch|import|importScripts|new\s+(?:Worker|WebSocket|EventSource))\s*\(\s*["'`]((?:https?|wss?):\/\/[^"'`]+)/gi;

/** What would stop a visual's HTML working on the site: outside addresses and size. */
export function htmlProblems(html) {
  const out = [];
  const bytes = Buffer.byteLength(html);
  if (bytes > MAX_BYTES) out.push(`it is ${(bytes / 1048576).toFixed(1)} MB; a visual must be under 2 MB`);
  const outside = new Set();
  for (const re of [TAGS_WITH_SOURCES, CSS_URLS, SCRIPT_URLS]) {
    for (const m of html.matchAll(re)) outside.add(m[2] ?? m[1]);
  }
  if (outside.size) {
    const list = [...outside].slice(0, 5).join(", ");
    out.push(
      `it loads files from other websites (${list}${outside.size > 5 ? ", …" : ""}), which the site blocks. ` +
        "Put the code inside the file, or serve the library from /js/vendor/ on this site"
    );
  }
  return out;
}

/** Every problem with a visual folder, given its front matter. */
export function check(slug, data) {
  const out = [];
  if (!SLUG.test(slug)) out.push(`the folder name “${slug}” must be lower-case letters, numbers and hyphens`);
  out.push(...problems(data));
  if (!existsSync(htmlPath(slug))) out.push(`there's no ${FILE} in src/visuals/${slug}/`);
  else out.push(...htmlProblems(readFileSync(htmlPath(slug), "utf8")));
  return out;
}

// Inside the frame, 'self' means this site: the visual may load scripts, data
// and fonts from here and nothing else.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const FONT_FACES = [
  ["400", "normal"],
  ["400", "italic"],
  ["500", "normal"],
  ["700", "normal"],
]
  .map(
    ([weight, style]) =>
      `@font-face{font-family:"Alegreya Sans";font-style:${style};font-weight:${weight};font-display:swap;src:url(/fonts/alegreya-sans-latin-${weight}-${style}.woff2) format("woff2")}`
  )
  .join("");

// Tells the page around the frame how tall the visual is, and takes the site's
// light or dark setting when the page sends one.
const BRIDGE = `(function(){var last=0;function send(){var b=document.body;if(!b)return;var cs=getComputedStyle(b);var h=Math.ceil(b.scrollHeight+parseFloat(cs.marginTop)+parseFloat(cs.marginBottom));if(h!==last){last=h;try{parent.postMessage({type:"davidbuik:height",height:h},"*")}catch(e){}}}addEventListener("load",function(){send();if(window.ResizeObserver)new ResizeObserver(send).observe(document.body)});addEventListener("message",function(e){var d=e.data;if(d&&d.type==="davidbuik:theme"&&(d.theme==="light"||d.theme==="dark"))document.documentElement.setAttribute("data-theme",d.theme)})})();`;

/** The visual as the site serves it: its own HTML with the security policy, the site font and the frame bridge added. */
export function prepare(html) {
  const head = `<meta http-equiv="Content-Security-Policy" content="${CSP}"><style>${FONT_FACES}</style><script>${BRIDGE}</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${html}</body></html>`;
}

/** Writes each visual's prepared HTML into the built site. */
export function write(outputDir, slugs) {
  for (const slug of slugs) {
    const out = path.join(outputDir, "visuals", slug, FILE);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, prepare(readFileSync(htmlPath(slug), "utf8")));
  }
}

/** Width and height of a PNG, read from its header, or null. */
export function pngSize(file) {
  try {
    const buf = readFileSync(file);
    if (buf.toString("latin1", 1, 4) !== "PNG") return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

// {% visual "slug" %} and {% visual "slug", "caption" %}; quotes may be " or '.
export const SHORTCODE = /\{%-?\s*visual\s+(["'])([a-z0-9-]+)\1(?:\s*,\s*(["'])([\s\S]*?)\3)?\s*-?%\}/g;

/** The slugs a source file places with {% visual %}. */
export const placedIn = (source) => [...source.matchAll(SHORTCODE)].map((m) => m[2]);

/** slug → the posts, projects and notes that show the visual, newest first. */
export function uses(items) {
  const map = {};
  for (const item of items) {
    const slugs = new Set(placedIn(readFileSync(item.inputPath, "utf8")));
    if (item.data.visual) slugs.add(item.data.visual);
    for (const slug of slugs) (map[slug] ??= []).push(item);
  }
  return map;
}

/** Fails the build when a post shows a visual that doesn't exist. */
export function checkUses(items, known) {
  for (const item of items) {
    const slugs = placedIn(readFileSync(item.inputPath, "utf8"));
    if (item.data.visual !== undefined) slugs.push(item.data.visual);
    for (const slug of slugs) {
      if (!known.has(slug)) {
        const list = [...known].join(", ") || "none yet";
        throw new Error(`${item.inputPath}: there's no visual called “${slug}” (or it is still a draft). Visuals: ${list}`);
      }
    }
  }
}

const escape = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The HTML for a visual. `live` runs it straight away (its own page); otherwise
 * it shows the poster with a Run button and loads nothing until that is pressed.
 */
export function figure(visual, { caption = "", live = false } = {}) {
  const { slug, title, description } = visual;
  const poster = existsSync(posterPath(slug)) ? pngSize(posterPath(slug)) : null;
  const ratio = poster ? `${poster.width} / ${poster.height}` : "16 / 10";
  const src = fileUrl(slug);
  const stage = live
    ? `<iframe class="visual-frame" src="${src}" title="${escape(title)}" sandbox="allow-scripts" allow="fullscreen" style="aspect-ratio: ${ratio}"></iframe>`
    : `<div class="visual-stage" style="aspect-ratio: ${ratio}">` +
      (poster ? `<img class="visual-poster" src="/visuals/${slug}/${POSTER}" alt="" width="${poster.width}" height="${poster.height}" loading="lazy" decoding="async">` : "") +
      `<a class="visual-run" href="${url(slug)}" data-src="${src}" data-title="${escape(title)}" data-ratio="${ratio}">Run<span class="visually-hidden"> “${escape(title)}”</span></a>` +
      `</div>`;
  const captionHtml = caption ? `<span class="visual-caption">${markdown.renderInline(caption)}</span>` : "";
  const links = live
    ? `<a href="${src}" target="_blank" rel="noopener">Open on its own</a>`
    : `<a href="${url(slug)}">About this visual</a>`;
  return (
    `<figure class="visual${live ? " is-live" : ""}">${stage}` +
    `<figcaption>${captionHtml}<span class="visual-links">${links}</span>` +
    `<details class="visual-description"><summary>Text description</summary>${markdown.render(String(description ?? ""))}</details>` +
    `</figcaption></figure>`
  );
}
