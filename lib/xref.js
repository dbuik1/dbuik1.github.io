// Cross-links between posts and projects, written as
//   [[slug]]                         the whole post
//   [[slug|link text]]               with your own link text
//   [[slug#"exact words"|link text]] to exact words in it
// where slug is the post's address (/blog/<slug>/) or a project's file name.
// The build checks that the target exists and that the words appear in it
// exactly once, so a link can't quietly point at nothing.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import MarkdownIt from "markdown-it";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const BLOG = path.join(SRC, "blog");
const PROJECTS = path.join(SRC, "projects");
const POST_FILE = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/;

// [[target#"quote"|text]]; the quote may contain | but not a double quote.
export const XREF = /\[\[([a-z0-9][a-z0-9-]*)(?:#"([^"\n]+)")?(?:\|([^\]\n]+))?\]\]/g;

const plain = new MarkdownIt({ html: true });
const normalise = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

function frontMatter(source) {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m ? { data: yaml.load(m[1]) ?? {}, body: m[2] } : { data: {}, body: source };
}

// The readable paragraphs of a post body: Markdown and shortcodes removed.
export function paragraphs(body) {
  const withoutShortcodes = body
    .replace(/\{%-?\s*annotate[\s\S]*?endannotate\s*-?%\}/g, "")
    .replace(/\^\[[^\]]*\]/g, "")
    .replace(/\[@[^\]]+\]/g, "")
    .replace(XREF, (_, slug, quote, text) => text ?? slug);
  const html = plain.render(withoutShortcodes);
  return [...html.matchAll(/<(p|h[2-6]|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => normalise(m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")))
    .filter(Boolean);
}

let cache = { stamp: "", targets: new Map() };

function stampOf(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => `${f}:${statSync(path.join(dir, f)).mtimeMs}`)
    .join("|");
}

// slug → { slug, kind, url, title, file, paragraphs }
export function targets() {
  const stamp = stampOf(BLOG) + "#" + stampOf(PROJECTS);
  if (cache.stamp === stamp) return cache.targets;
  const map = new Map();
  const add = (slug, entry) => {
    if (map.has(slug)) {
      throw new Error(`The address “${slug}” is used by both ${map.get(slug).file} and ${entry.file}, so [[${slug}]] is ambiguous.`);
    }
    map.set(slug, entry);
  };
  for (const f of readdirSync(BLOG).filter((x) => POST_FILE.test(x))) {
    const { data, body } = frontMatter(readFileSync(path.join(BLOG, f), "utf8"));
    const slug = f.match(POST_FILE)[2];
    add(slug, { slug, kind: "post", url: `/blog/${slug}/`, title: data.title ?? slug, file: `src/blog/${f}`, draft: !!data.draft, paragraphs: paragraphs(body) });
  }
  for (const f of readdirSync(PROJECTS).filter((x) => x.endsWith(".md"))) {
    const { data, body } = frontMatter(readFileSync(path.join(PROJECTS, f), "utf8"));
    const slug = f.replace(/\.md$/, "");
    add(slug, { slug, kind: "project", url: `/projects/${slug}/`, title: data.title ?? slug, file: `src/projects/${f}`, draft: !!data.draft, paragraphs: paragraphs(body) });
  }
  cache = { stamp, targets: map };
  return map;
}

const count = (haystack, needle) => {
  let n = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) n++;
  return n;
};

/** Checks a link and returns where it goes. Throws a readable error if it can't work. */
export function resolve(slug, quote) {
  const t = targets().get(slug);
  if (!t) {
    const near = [...targets().keys()].filter((k) => k.includes(slug.slice(0, 5))).slice(0, 5);
    throw new Error(`no post or project has the address in [[${slug}]].${near.length ? ` Did you mean ${near.join(", ")}?` : ""}`);
  }
  // Drafts aren't on the live site, so only the local preview may link to them.
  if (t.draft && process.env.ELEVENTY_ENV !== "development") {
    throw new Error(`[[${slug}]] is still a draft. Publish it first, or remove the link.`);
  }
  if (!quote) return { ...t, href: t.url };
  const q = normalise(quote);
  const n = t.paragraphs.reduce((sum, p) => sum + count(p, q), 0);
  if (n === 0) throw new Error(`the words “${quote}” aren't in [[${slug}]].`);
  if (n > 1) throw new Error(`the words “${quote}” appear ${n} times in [[${slug}]]. Use more of the sentence.`);
  return { ...t, href: `${t.url}#:~:text=${encodeURIComponent(q).replace(/-/g, "%2D")}` };
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// markdown-it rule: [[...]] becomes a checked link with data for previews.
export function plugin(md) {
  md.inline.ruler.before("link", "xref", (state, silent) => {
    if (!state.src.startsWith("[[", state.pos)) return false;
    XREF.lastIndex = state.pos;
    const m = XREF.exec(state.src);
    if (!m || m.index !== state.pos) return false;
    if (!silent) {
      const [, slug, quote, text] = m;
      let t;
      try {
        t = resolve(slug, quote);
      } catch (e) {
        throw new Error(`Cross-link problem: ${e.message}`);
      }
      const open = state.push("xref_open", "a", 1);
      open.attrs = [
        ["href", t.href],
        ["class", "xref"],
        ["data-xref", slug],
      ];
      if (quote) open.attrs.push(["data-quote", normalise(quote)]);
      const label = state.push("text", "", 0);
      label.content = text?.trim() || t.title;
      state.push("xref_close", "a", -1);
    }
    state.pos += m[0].length;
    return true;
  });
  md.renderer.rules.xref_open = (tokens, idx) => `<a ${tokens[idx].attrs.map(([k, v]) => `${k}="${escape(v)}"`).join(" ")}>`;
  md.renderer.rules.xref_close = () => "</a>";
}

// Every [[slug]] in a source, for "Linked from" lists.
export const linksIn = (source) => [...source.matchAll(XREF)].map((m) => m[1]);
