// The reference library and citations.
//
// Sources live in references/library.bib (BibTeX or BibLaTeX, as Zotero's
// Better BibTeX exports it). A post cites one with `[@key]` or `[@key, p. 23]`;
// several go in one note as `[@a, 12; @b]`. Each citation becomes a footnote
// in Chicago notes-and-bibliography style (full first note, short after),
// and the post gets a bibliography of everything it cites.
import { readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Cite, plugins } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-csl";
import CSL from "citeproc";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../references");
export const LIBRARY = path.join(DIR, "library.bib");
const STYLE = readFileSync(path.join(DIR, "chicago-notes-bibliography.csl"), "utf8");
const LOCALE = readFileSync(path.join(DIR, "locales-en-GB.xml"), "utf8");

// ---- The library file ----

// Each entry's raw text, so entries are kept exactly as written or exported.
export function splitEntries(text) {
  const starts = [...text.matchAll(/^[ \t]*@(\w+)\s*\{\s*([^,\s]+)\s*,/gm)].filter(
    (m) => !/^(comment|preamble|string)$/i.test(m[1])
  );
  return starts.map((m, i) => ({
    key: m[2],
    raw: text.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : text.length).trim(),
  }));
}

export function readLibrary() {
  return existsSync(LIBRARY) ? readFileSync(LIBRARY, "utf8") : "";
}

export function writeEntries(entries) {
  const head = "% Reference library. Edit it in the writing editor (npm run write), or by hand.\n\n";
  writeFileSync(LIBRARY, head + entries.map((e) => e.raw).join("\n\n") + "\n");
  cache = null;
}

let cache = null;

// CSL-JSON items by citation key, re-read whenever the file changes.
export function items() {
  const mtime = existsSync(LIBRARY) ? statSync(LIBRARY).mtimeMs : 0;
  if (cache?.mtime === mtime) return cache.items;
  const map = new Map();
  for (const entry of splitEntries(readLibrary())) {
    try {
      const [item] = new Cite(entry.raw).data;
      if (item) map.set(entry.key, { ...item, id: entry.key });
    } catch (e) {
      throw new Error(`references/library.bib: the entry “${entry.key}” couldn't be read (${e.message})`);
    }
  }
  cache = { mtime, items: map };
  return map;
}

// ---- Formatting ----

function engine() {
  const map = items();
  const sys = {
    retrieveLocale: (lang) => (lang === "en-GB" ? LOCALE : plugins.config.get("@csl").locales.get(lang)),
    retrieveItem: (id) => map.get(id),
  };
  const e = new CSL.Engine(sys, STYLE, "en-GB", true);
  e.setOutputFormat("html");
  return e;
}

const LABELS = {
  p: "page", pp: "page", page: "page", pages: "page",
  chap: "chapter", ch: "chapter", chapter: "chapter",
  sec: "section", "§": "section", section: "section",
  para: "paragraph", "¶": "paragraph", paragraph: "paragraph",
  vol: "volume", n: "note", fig: "figure", line: "line", l: "line",
};

// "p. 23", "chap. 4", "§ 2" or a bare "23" (a page).
export function parseLocator(text) {
  const t = (text ?? "").trim();
  if (!t) return {};
  const m = t.match(/^(pp?|pages?|chap|ch|chapter|sec|section|§|para|paragraph|¶|vol|n|fig|line|l)\.?\s*(.+)$/i);
  if (m) return { label: LABELS[m[1].toLowerCase()], locator: m[2].trim() };
  return { label: "page", locator: t };
}

// `[@key, p. 23; @other]` → [{ key, locator }]
const CITATION = /\[(@[^\]\n]+)\]/g;
export function parseCitation(inner) {
  return inner.split(";").map((part) => {
    const m = part.trim().match(/^@([^\s,;\]]+)\s*(?:,\s*(.*))?$/);
    return m ? { key: m[1], locator: (m[2] ?? "").trim() } : null;
  });
}

function unknown(key) {
  const keys = [...items().keys()];
  const near = keys.filter((k) => k.toLowerCase().includes(key.toLowerCase().slice(0, 4))).slice(0, 5);
  return new Error(
    `cites @${key}, which isn't in the reference library (references/library.bib).` +
      (near.length ? ` Did you mean ${near.map((k) => `@${k}`).join(", ")}?` : "")
  );
}

// Escapes characters that would end a footnote early or start Nunjucks tags.
const safeInNote = (html) => html.replace(/\[/g, "&#91;").replace(/\]/g, "&#93;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");

/**
 * Replaces every citation in a post's Markdown with a footnote and appends
 * the bibliography. Plain footnotes (`^[...]`) count towards note numbers, so
 * short forms follow the order a reader sees.
 */
export function cite(markdown) {
  if (!/\[@/.test(markdown)) return markdown;
  const map = items();
  const e = engine();
  const done = [];
  const out = new Map();
  let noteIndex = 0;
  let n = 0;

  // Walk the text once, tracking plain footnotes so nested citations stay inline.
  let result = "";
  let i = 0;
  let depth = 0; // inside ^[ ... ]
  let bracket = 0;
  while (i < markdown.length) {
    if (markdown.startsWith("^[", i)) {
      if (depth === 0) noteIndex++;
      depth++;
      bracket = 0;
      result += "^[";
      i += 2;
      continue;
    }
    CITATION.lastIndex = i;
    const m = markdown[i] === "[" && markdown[i + 1] === "@" ? CITATION.exec(markdown) : null;
    if (m && m.index === i) {
      const parts = parseCitation(m[1]);
      if (parts.some((p) => !p)) throw new Error(`has a citation it can't read: ${m[0]}`);
      for (const p of parts) if (!map.has(p.key)) throw unknown(p.key);
      if (depth === 0) noteIndex++;
      const id = `c${n++}`;
      const citation = {
        citationID: id,
        citationItems: parts.map((p) => ({ id: p.key, ...parseLocator(p.locator) })),
        properties: { noteIndex },
      };
      const [, updates] = e.processCitationCluster(citation, done, []);
      done.push([id, noteIndex]);
      for (const [, html, cid] of updates) out.set(cid, html);
      // Inside a plain footnote the citation is part of a sentence, so it drops its full stop.
      result += depth === 0 ? `^[\u0000${id}\u0000]` : `\u0000${id}.\u0000`;
      i += m[0].length;
      continue;
    }
    if (depth > 0) {
      if (markdown[i] === "[") bracket++;
      else if (markdown[i] === "]") {
        if (bracket === 0) depth--;
        else bracket--;
      }
    }
    result += markdown[i++];
  }

  result = result.replace(/\u0000(c\d+)(\.?)\u0000/g, (_, id, inner) => {
    const html = out.get(id) ?? "";
    return safeInNote(inner ? html.replace(/\.$/, "") : html);
  });
  const [, entries] = e.makeBibliography();
  const bib = entries.map((h) => h.trim()).join("\n");
  return `${result}\n\n<section class="bibliography" aria-labelledby="bibliography-heading">\n<h2 id="bibliography-heading">Bibliography</h2>\n${safeInNote(bib)}\n</section>\n`;
}

// The bibliography goes after the notes; Markdown puts notes last, so move it.
export function placeBibliography(html) {
  const bib = html.match(/<section class="bibliography"[\s\S]*?<\/section>/);
  if (!bib || !html.includes('<section class="footnotes"')) return html;
  const without = html.replace(bib[0], "");
  return without.replace(/(<section class="footnotes"[\s\S]*?<\/section>)/, `$1\n${bib[0]}`);
}

// ---- For the editor ----

// Each source with its bibliography entry, for lists and the Cite picker.
export function list() {
  const e = engine();
  const entries = splitEntries(readLibrary());
  const keys = entries.map((x) => x.key).filter((k) => items().has(k));
  e.updateItems(keys);
  const formatted = new Map();
  if (keys.length) {
    const [info, html] = e.makeBibliography();
    info.entry_ids.forEach(([id], i) => formatted.set(id, html[i]?.trim()));
  }
  return entries.map(({ key, raw }) => {
    const item = items().get(key);
    const author = item?.author?.[0]?.family ?? item?.author?.[0]?.literal ?? item?.editor?.[0]?.family ?? "";
    const year = item?.issued?.["date-parts"]?.[0]?.[0] ?? "";
    return { key, raw, title: item?.title ?? "", author, year: year ? String(year) : "", html: formatted.get(key) ?? "" };
  });
}

// A short label for a citation, e.g. "Calvin, Institutes, 23", shown in the editor.
export function preview(key, locator) {
  if (!items().has(key)) return null;
  const e = engine();
  const id = "p";
  const run = (noteIndex, cid) =>
    e.processCitationCluster(
      { citationID: cid, citationItems: [{ id: key, ...parseLocator(locator) }], properties: { noteIndex } },
      noteIndex > 1 ? [["p0", 1]] : [],
      []
    )[1];
  const full = run(1, "p0").find((u) => u[2] === "p0")?.[1];
  const short = run(2, id).find((u) => u[2] === id)?.[1];
  return { full, short };
}

// Turns a DOI, ISBN, BibTeX or CSL-JSON into BibTeX entries with unique keys.
export async function toEntries(input, existingKeys = new Set()) {
  const text = input.trim();
  let raws;
  if (/^@\w+\s*\{/.test(text)) {
    raws = splitEntries(text);
  } else {
    await import("@citation-js/plugin-doi");
    await import("@citation-js/plugin-isbn");
    const doi = text.match(/10\.\d{4,9}\/\S+/);
    const isbn = text.replace(/[-\s]/g, "").match(/^(97[89])?\d{9}[\dXx]$/);
    const source = doi ? doi[0] : isbn ? isbn[0] : text;
    let cite;
    try {
      cite = await Cite.async(source);
    } catch (e) {
      throw new Error(`Couldn't find that source (${e.message}). Check the DOI or ISBN, or paste a BibTeX entry instead.`);
    }
    if (!cite.data.length) throw new Error("Couldn't find that source. Check the DOI or ISBN, or paste a BibTeX entry instead.");
    raws = splitEntries(cite.format("bibtex"));
  }
  if (!raws.length) throw new Error("That doesn't look like a BibTeX entry, DOI or ISBN.");
  const taken = new Set(existingKeys);
  return raws.map(({ key, raw }) => {
    let k = key.replace(/[^\w:.-]/g, "");
    if (taken.has(k)) {
      let s = 2;
      while (taken.has(`${k}${s}`)) s++;
      k = `${k}${s}`;
    }
    taken.add(k);
    return { key: k, raw: raw.replace(/^(\s*@\w+\s*\{\s*)[^,\s]+/, `$1${k}`) };
  });
}
