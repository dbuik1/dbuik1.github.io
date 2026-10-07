// Fragments: one-line thoughts and quotes, each a Markdown file in src/fragments/
// named YYYY-MM-DD-short-name.md. The title is the line itself; `kind` is any
// word you like (quote, question, …), and each kind gets its own page.
import slugifyText from "@sindresorhus/slugify";
import * as tags from "./tags.js";
import * as references from "./references.js";
import { markdown } from "./markdown.js";

export function problems(data) {
  const out = [];
  if (!data.title) out.push("missing `title` (the line itself)");
  for (const field of ["kind", "by", "source"]) {
    if (data[field] !== undefined && typeof data[field] !== "string") out.push(`\`${field}\` must be text`);
  }
  out.push(...tags.problems(data.tags));
  return out;
}

export const kindUrl = (kind) => `/fragments/kinds/${slugifyText(kind)}/`;

/** Every kind in use, most used first. */
export function kinds(fragments) {
  const counts = new Map();
  for (const f of fragments) if (f.data.kind) counts.set(f.data.kind, (counts.get(f.data.kind) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count, url: kindUrl(name) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Where a fragment comes from, as HTML. A citation such as [@calvin1559, 1.1.1]
 * is written out from the reference library; anything else is shown as written.
 */
export function source(text) {
  if (!text) return "";
  const m = text.trim().match(/^\[(@[^\]]+)\]$/);
  if (!m) return markdown.renderInline(text);
  const [cite] = references.parseCitation(m[1]);
  const found = cite && references.preview(cite.key, cite.locator);
  if (!found) throw new Error(`the source ${text} isn't in the reference library (references/library.bib)`);
  return found.full.replace(/\.$/, "");
}
