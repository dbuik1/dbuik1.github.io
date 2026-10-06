import { readFileSync } from "node:fs";
import MarkdownIt from "markdown-it";

const load = (name) => JSON.parse(readFileSync(new URL(`../texts/${name}.json`, import.meta.url), "utf8"));
const wcf = load("wcf");
const scots = load("scots");
const bsb = load("bsb");
const md = new MarkdownIt({ html: true });

export const stances = [
  { slug: "agree", name: "Agree" },
  { slug: "disagree", name: "Disagree" },
  { slug: "qualified", name: "Qualified" },
  { slug: "note", name: "Note" },
];
const stanceSlugs = stances.map((s) => s.slug);

// Book lookup ignores case and spaces, so "1 John", "1john" and "1 JOHN" all match.
const squash = (s) => s.toLowerCase().replace(/\s+/g, "");
const books = new Map(bsb.books.map((b, i) => [squash(b.name), i]));
for (const [alias, name] of [["psalm", "Psalms"], ["songofsongs", "Song of Solomon"], ["song", "Song of Solomon"]]) {
  books.set(alias, books.get(squash(name)));
}

const REF_HELP = 'Write references like "wcf 1.4", "scots 16", "scots preface" or "John 3:16" (a range like "John 3:16-18" also works).';

// Curly apostrophes and quotes match their straight forms. Each swap is one
// character for one character, so positions in the normalised text are valid in the original.
export const normalise = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Turns a reference string into the passage it names, or throws with a readable reason. */
export function resolve(ref) {
  const r = String(ref).trim();
  let m;
  if ((m = r.match(/^wcf\s+(\d+)\.(\d+)$/i))) {
    const [c, s] = [+m[1], +m[2]];
    const chapter = wcf.chapters[c - 1];
    if (!chapter) throw new Error(`"${r}": the Westminster Confession has chapters 1 to ${wcf.chapters.length}`);
    if (!chapter.sections[s - 1]) throw new Error(`"${r}": Westminster Confession chapter ${c} has sections 1 to ${chapter.sections.length}`);
    return {
      key: `wcf-${c}-${s}`, order: [0, c, s], source: "Westminster Confession",
      label: `Westminster Confession ${c}.${s}`, heading: chapter.title,
      paragraphs: chapter.sections[s - 1].split("\n\n"),
    };
  }
  if ((m = r.match(/^scots\s+(\d+|preface)$/i))) {
    if (m[1].toLowerCase() === "preface") {
      return {
        key: "scots-preface", order: [1, 0, 0], source: "Scots Confession",
        label: "Scots Confession, Preface", heading: "The Preface", paragraphs: scots.preface.split("\n\n"),
      };
    }
    const c = +m[1];
    const chapter = scots.chapters[c - 1];
    if (!chapter) throw new Error(`"${r}": the Scots Confession has chapters 1 to ${scots.chapters.length}, plus "scots preface"`);
    return {
      key: `scots-${c}`, order: [1, c, 0], source: "Scots Confession",
      label: `Scots Confession ${c}`, heading: chapter.title, paragraphs: chapter.text.split("\n\n"),
    };
  }
  if ((m = r.match(/^(.+?)\s+(\d+)[:.](\d+)(?:\s*-\s*(\d+))?$/))) {
    const b = books.get(squash(m[1]));
    if (b === undefined) throw new Error(`"${r}": no Bible book called "${m[1]}". ${REF_HELP}`);
    const book = bsb.books[b];
    const [c, v1] = [+m[2], +m[3]];
    const v2 = m[4] ? +m[4] : v1;
    const chapter = book.chapters[c - 1];
    if (!chapter) throw new Error(`"${r}": ${book.name} has chapters 1 to ${book.chapters.length}`);
    if (v2 < v1 || !chapter[v1 - 1] || !chapter[v2 - 1]) {
      throw new Error(`"${r}": ${book.name} ${c} has verses 1 to ${chapter.length} in the BSB (some verses are omitted)`);
    }
    const verses = chapter.slice(v1 - 1, v2).filter(Boolean);
    const span = v2 > v1 ? `${v1}-${v2}` : `${v1}`;
    return {
      key: slugify(`${book.name} ${c} ${span}`), order: [2, b, c * 1000 + v1], source: "Bible (BSB)",
      label: `${book.name} ${c}:${span.replace("-", "–")}`, heading: "", paragraphs: [verses.join(" ")],
    };
  }
  throw new Error(`"${r}" is not a reference I recognise. ${REF_HELP}`);
}

/** Resolves a passage and checks the stance and that the phrase occurs exactly once in it. */
export function check(ref, phrase, stance) {
  const passage = resolve(ref);
  if (!stanceSlugs.includes(stance)) {
    throw new Error(`stance "${stance ?? ""}" for "${ref}" should be one of: ${stanceSlugs.join(", ")}`);
  }
  const needle = normalise(String(phrase ?? ""));
  if (!needle.trim()) throw new Error(`"${ref}": the phrase is empty`);
  const hits = passage.paragraphs.reduce((n, p) => n + normalise(p).split(needle).length - 1, 0);
  if (hits !== 1) {
    const why = hits === 0 ? "does not appear in" : `appears ${hits} times in`;
    const fix = hits === 0 ? "Copy it exactly" : "Use a longer phrase so it appears once";
    throw new Error(`"${ref}": the phrase "${phrase}" ${why} ${passage.label}. ${fix}. The passage reads:\n${passage.paragraphs.join("\n\n")}`);
  }
  return passage;
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function passageHtml(passage, phrase) {
  const needle = normalise(phrase);
  return passage.paragraphs.map((p) => {
    const at = normalise(p).indexOf(needle);
    if (at < 0) return `<p>${escape(p)}</p>`;
    const end = at + needle.length;
    return `<p>${escape(p.slice(0, at))}<mark>${escape(p.slice(at, end))}</mark>${escape(p.slice(end))}</p>`;
  }).join("");
}

export const stanceName = (slug) => stances.find((s) => s.slug === slug)?.name ?? slug;
export const passageUrl = (passage) => `/annotations/${passage.key}/`;

const hash = (s) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h.toString(36);
};

const annotationId = (passage, pageUrl, phrase) => `anno-${passage.key}-${hash(pageUrl + phrase)}`;

/**
 * Renders one annotation as a self-contained figure, which is what feeds and
 * readers without JavaScript see. js/annotations.js builds the Compact view
 * (popups) from this markup. The output must contain no blank lines, or
 * Markdown would end the HTML block early.
 */
export function render(note, ref, phrase, stance, pageUrl) {
  const passage = check(ref, phrase, stance);
  const id = annotationId(passage, pageUrl, phrase);
  const noteHtml = md.render(String(note).trim()).replace(/\n+/g, "\n").trim();
  return [
    `<figure class="annotation" id="${id}" data-phrase="${escape(normalise(phrase))}">`,
    `<blockquote>${passageHtml(passage, phrase)}</blockquote>`,
    `<figcaption><a href="${passageUrl(passage)}">${escape(passage.label)}</a> <span class="stance stance-${stance}">${stanceName(stance)}</span></figcaption>`,
    noteHtml ? `<div class="anno-note">${noteHtml}</div>` : "",
    `</figure>`,
  ].join("");
}

/**
 * Where the paragraph just before an annotation quotes its phrase, marks that
 * first match so it can be highlighted, and in the Compact view open the popup.
 */
export function linkInlinePhrases(html) {
  if (!html.includes('class="annotation"')) return html;
  return html.replace(
    /(<p>)((?:(?!<\/?p[\s>])[\s\S])*?)(<\/p>\s*)(<figure class="annotation" id="([^"]+)" data-phrase="([^"]*)">)/g,
    (all, open, inner, close, figure, id, phrase) => {
      const needle = normalise(phrase).toLowerCase();
      const at = normalise(inner).toLowerCase().indexOf(needle);
      if (at < 0) return all;
      const end = at + needle.length;
      const span = `<span class="anno-phrase" data-anno="${id}">${inner.slice(at, end)}</span>`;
      return `${open}${inner.slice(0, at)}${span}${inner.slice(end)}${close}${figure}`;
    }
  );
}

const TAG = /\{%-?\s*annotate\s+(["'])(.*?)\1\s*,\s*(["'])(.*?)\3\s*,\s*(["'])(.*?)\5\s*-?%\}/g;

/** Groups every annotation in the given posts by passage, in confession then Bible order. */
export function collect(posts) {
  const byKey = new Map();
  for (const post of posts) {
    const source = readFileSync(post.inputPath, "utf8");
    for (const m of source.matchAll(TAG)) {
      let passage;
      try {
        passage = check(m[2], m[4], m[6]);
      } catch (e) {
        throw new Error(`Post ${post.inputPath}: annotation ${e.message}`);
      }
      if (!byKey.has(passage.key)) byKey.set(passage.key, { ...passage, url: passageUrl(passage), entries: [] });
      byKey.get(passage.key).entries.push({ post, phrase: m[4], stance: m[6], id: annotationId(passage, post.url, m[4]) });
    }
  }
  const cmp = (a, b) => a.order.findIndex((x, i) => x !== b.order[i]);
  return [...byKey.values()].sort((a, b) => {
    const i = cmp(a, b);
    return i < 0 ? 0 : a.order[i] - b.order[i];
  });
}
