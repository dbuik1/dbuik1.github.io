// What Lia is told about the site's Markdown, and the checks its answers pass
// before the owner sees them. Built from the same lists and checks the build
// uses, so the guide and the checks can't drift from what publishes.
import * as annotations from "../lib/annotations.js";
import * as references from "../lib/references.js";
import * as xref from "../lib/xref.js";
import levels from "../src/_data/levels.js";
import importances from "../src/_data/importances.js";

// hubctl refuses format notes over 8,000 bytes; lists fill what the rules leave.
const FORMAT_MAX = 7900;

const slugs = (xs) => xs.map((x) => x.slug).join(", ");

function rules({ commentary = false } = {}) {
  return [
    "Markdown for an Eleventy site, edited in a rich-text editor. The title and the details (level, importance, tags, description) are separate fields, never in the text.",
    "Headings: # (Heading 1) to ###### (Heading 6), without skipping a level.",
    "Footnote: ^[note text] straight after the word it belongs to.",
    "Citation: [@key] or [@key, p. 23] (also chap., sec., para.), with a key from the reference library below; several sources share one note as [@a, p. 2; @b]. Citations become Chicago-style footnotes. For a source not in the library, write [@doi:DOI] or [@isbn:ISBN] with its real DOI or ISBN, and the editor adds it. Never make one up.",
    "Cross-link to the owner's own pages: [[slug]], [[slug|link text]], or [[slug#\"exact words\"|link text]] to link to words that appear once on that page. Use a slug from the list below.",
    "Image, on its own line: ![What the image shows](/images/… \"Optional caption\"). Every image needs the description; keep existing image paths as they are.",
    "Visual, on its own line: {% visual \"slug\" %} or {% visual \"slug\", \"Caption\" %}, with a slug from the visuals below.",
    `Annotation of a confession or Bible passage, on its own lines after the paragraph it belongs to:\n{% annotate "wcf 1.4", "exact words from the passage", "agree" %}The owner's note.{% endannotate %}\nPassages: "wcf 1.4" (Westminster Confession chapter.section), "scots 16" or "scots preface" (Scots Confession), or a Bible reference such as "John 3:16" or "John 3:16-18" (BSB). The words must appear exactly once in the passage. Stance: ${slugs(annotations.stances)}.`,
    commentary
      ? "Commentary quotes its source in place: {% excerpt %}exact words from the source{% endexcerpt %}, and for a video or podcast {% moment \"12:34\", \"13:10\" %}what is said then{% endmoment %}."
      : "",
    "Tables, superscript (<sup>), subscript (<sub>) and HTML blocks are allowed. Keep HTML, images, annotations, visuals and other markup exactly as they are unless asked to change them.",
    `For reference, a post's level is one of ${slugs(levels)} and its importance one of ${slugs(importances)}; both are the owner's choice.`,
  ].filter(Boolean);
}

// Adds as many lines of a list as fit in the budget, and says how many were left out.
function fitList(title, lines, budget) {
  if (!lines.length || budget < title.length + 40) return "";
  const kept = [];
  let used = title.length + 1;
  for (const line of lines) {
    if (used + line.length + 1 > budget - 30) break;
    kept.push(line);
    used += line.length + 1;
  }
  const more = lines.length - kept.length;
  return `${title}\n${kept.join("\n")}${more ? `\n(and ${more} more)` : ""}`;
}

/** The format notes for one request: rules, then the owner's sources, pages and visuals as space allows. */
export function format({ kind = "post", tags = null } = {}) {
  const head = rules({ commentary: kind === "commentary" }).join("\n\n");
  const all = [...xref.targets().values()].filter((t) => !t.draft);
  const visuals = all.filter((t) => t.kind === "visual").map((t) => `${t.slug}: ${t.title}`);
  const pages = all.filter((t) => t.kind !== "visual").map((t) => `${t.slug}: ${t.title}`);
  const library = references.list().map((r) => `@${r.key}: ${[r.author, r.year, r.title].filter(Boolean).join(", ")}`.slice(0, 160));
  const parts = [head];
  let left = FORMAT_MAX - Buffer.byteLength(head);
  const lists = [
    tags ? ["Tags already in use (nest with a slash, like theology/church):", tags] : null,
    ["Reference library:", library],
    ["Visuals:", visuals],
    ["The owner's pages:", pages],
  ].filter(Boolean);
  lists.forEach(([title, lines], i) => {
    // Each list gets an even share of what's left, so a long library can't crowd out the pages.
    const text = fitList(title, lines, Math.floor(left / (lists.length - i)));
    if (text) parts.push(text);
    left -= text ? Buffer.byteLength(text) + 2 : 0;
  });
  if (!library.length) parts.push("The reference library is empty.");
  return parts.join("\n\n");
}

const ANNOTATE = /\{%-?\s*annotate\s+(["'])(.*?)\1\s*,\s*(["'])(.*?)\3\s*,\s*(["'])(.*?)\5\s*-?%\}/g;
const VISUAL = /\{%-?\s*visual\s+(["'])(.*?)\1/g;
const CITATION = /\[(@[^\]\n]+)\]/g;
const IMAGE = /!\[([^\]]*)\]\(([^)\s]*)/g;

/**
 * Problems that would stop the build or leave a reader without something,
 * in one line each. Citations by DOI or ISBN are the editor's to resolve.
 */
export function problems(text) {
  const out = [];
  const opened = (text.match(/\{%-?\s*annotate\s/g) ?? []).length;
  const closed = (text.match(/\{%-?\s*endannotate\s*-?%\}/g) ?? []).length;
  if (opened !== closed) out.push(`Each {% annotate … %} needs its own {% endannotate %}: there are ${opened} and ${closed}.`);
  for (const m of text.matchAll(ANNOTATE)) {
    try {
      annotations.check(m[2], m[4], m[6]);
    } catch (e) {
      // The build's message ends with the whole passage, which Lia needs to copy the words exactly.
      out.push(`Annotation ${e.message}`);
    }
  }
  const library = references.items();
  for (const m of text.matchAll(CITATION)) {
    for (const c of references.parseCitation(m[1])) {
      if (c && !/^(doi|isbn):/i.test(c.key) && !library.has(c.key)) out.push(`[@${c.key}] isn't in the reference library. Use a key from the list, or [@doi:…] or [@isbn:…].`);
    }
  }
  for (const m of text.matchAll(xref.XREF)) {
    try {
      xref.resolve(m[1], m[2]);
    } catch (e) {
      out.push(`Cross-link: ${e.message}`);
    }
  }
  const targets = xref.targets();
  for (const m of text.matchAll(VISUAL)) {
    if (targets.get(m[2])?.kind !== "visual") out.push(`There's no visual called “${m[2]}”.`);
  }
  for (const m of text.matchAll(IMAGE)) {
    if (!m[1].trim()) out.push(`The image ${m[2] || ""} needs a description of what it shows.`.replace("  ", " "));
  }
  return [...new Set(out)];
}
