// What search engines and AI crawlers read about each page: descriptions,
// last-modified dates, structured data (schema.org JSON-LD) and the sitemap.
import { execFileSync } from "node:child_process";
import site from "../src/_data/site.js";

const DESCRIPTION_LENGTH = 160;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const decode = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => ENTITIES[name] ?? m);

/** Plain text from a piece of HTML, without footnote markers. */
export const plain = (html = "") =>
  decode(
    String(html)
      .replace(/<sup class="footnote-ref">[\s\S]*?<\/sup>/g, "")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

/** Shortens text to a search-result-sized description, ending at a word. */
export function clip(text, max = DESCRIPTION_LENGTH) {
  const t = plain(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max / 2 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/**
 * The first real paragraph of a page, shortened, for when no description was written.
 * Placeholders for text not yet written are skipped, so they never reach search results.
 */
export function excerpt(html = "") {
  for (const [, attrs, inner] of String(html).matchAll(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/g)) {
    if (/class="[^"]*placeholder/.test(attrs ?? "")) continue;
    const text = plain(inner);
    if (text.length >= 20 && !/^\[.*\]$/.test(text)) return clip(text);
  }
  // Inline site text (a single line with no paragraph) is used whole.
  const text = plain(html);
  return text && !/<p[\s>]/.test(html) && !/^\[.*\]$/.test(text) && !/class="[^"]*placeholder/.test(html) ? clip(text) : "";
}

const commitDates = new Map();
/** When a source file was last committed, or null when git can't say (not committed yet, or no git). */
export function lastModified(inputPath) {
  if (!inputPath) return null;
  if (!commitDates.has(inputPath)) {
    let date = null;
    try {
      const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", inputPath], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (out) date = new Date(out);
    } catch {}
    commitDates.set(inputPath, date);
  }
  return commitDates.get(inputPath);
}

/** The later of a page's own date and its last commit. */
export function modified(inputPath, date) {
  const committed = lastModified(inputPath);
  return committed && (!date || committed > new Date(date)) ? committed : date ? new Date(date) : null;
}

/** post, project or note for the site's own content, otherwise page. */
export function kind(inputPath = "") {
  const p = inputPath.replace(/\\/g, "/");
  if (/\/src\/blog\/\d{4}-\d\d-\d\d-[^/]+\.md$/.test(p)) return "post";
  if (/\/src\/projects\/[^/]+\.md$/.test(p)) return "project";
  if (/\/src\/notes\/[^/]+\.md$/.test(p)) return "note";
  return "page";
}

/** Where a page's share image is: content pages get their own card, everything else the site card. */
export const cardUrl = (pageKind, url) => (pageKind === "page" ? "/card.png" : `${url}card.png`);

const abs = (url) => new URL(url, site.url).href;
const PERSON_ID = `${site.url}/#person`;
const WEBSITE_ID = `${site.url}/#website`;
const iso = (d) => (d ? new Date(d).toISOString() : undefined);

function person(description) {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: site.author,
    url: `${site.url}/`,
    ...(description && { description }),
    ...(site.profiles?.length && { sameAs: site.profiles.map((p) => p.url) }),
  };
}

const author = { "@type": "Person", "@id": PERSON_ID, name: site.author, url: `${site.url}/` };

/**
 * schema.org structured data for a page, as a JSON-LD string, or "" when the page has none.
 * `d` carries what the page template knows: kind, url, title, description, dates, tags, and so on.
 */
export function structuredData(d) {
  const url = abs(d.url);
  const image = abs(d.image);
  const graph = [];

  if (d.url === "/") {
    graph.push(
      { "@type": "WebSite", "@id": WEBSITE_ID, url, name: site.title, description: d.description, inLanguage: site.language, publisher: { "@id": PERSON_ID } },
      { ...person(d.description), mainEntityOfPage: url }
    );
  } else if (d.kind === "post") {
    graph.push(
      {
        "@type": "BlogPosting",
        "@id": `${url}#article`,
        headline: d.title,
        description: d.description,
        url,
        mainEntityOfPage: url,
        image,
        datePublished: iso(d.date),
        dateModified: iso(d.modified ?? d.date),
        inLanguage: site.language,
        author,
        publisher: author,
        isPartOf: { "@id": WEBSITE_ID },
        ...(d.section && { articleSection: d.section }),
        ...(d.tags?.length && { keywords: d.tags.map((t) => t.replace(/\//g, " / ")).join(", ") }),
        ...(d.wordCount && { wordCount: d.wordCount }),
      },
      breadcrumbs([
        ["Writing", "/blog/"],
        ...(d.section && d.sectionUrl ? [[d.section, d.sectionUrl]] : []),
        [d.title, d.url],
      ])
    );
  } else if (d.kind === "project") {
    graph.push(
      {
        "@type": "CreativeWork",
        "@id": `${url}#project`,
        name: d.title,
        description: d.description,
        url,
        image,
        author,
        ...(d.section && { creativeWorkStatus: d.section }),
        ...(d.modified && { dateModified: iso(d.modified) }),
      },
      breadcrumbs([["Projects", "/projects/"], [d.title, d.url]])
    );
  } else if (d.kind === "note") {
    graph.push(
      d.by
        ? { "@type": "Quotation", "@id": `${url}#note`, text: d.title, url, creator: { "@type": "Person", name: d.by }, ...(d.source && { isBasedOn: d.source }), datePublished: iso(d.date), publisher: author }
        : { "@type": "CreativeWork", "@id": `${url}#note`, text: d.title, url, author, datePublished: iso(d.date) },
      breadcrumbs([["Notes", "/notes/"], [d.title.length > 60 ? clip(d.title, 60) : d.title, d.url]])
    );
  } else {
    return "";
  }
  // "</" can't appear inside the script element that carries this.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/<\//g, "<\\/");
}

function breadcrumbs(trail) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"], ...trail].map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(url) })),
  };
}

/** Pages for the sitemap: every HTML page that isn't kept out of search, with its last change where known. */
export function sitemap(items) {
  return items
    .filter((item) => item.url && item.url.endsWith("/") && !item.data.noindex && !item.data.draft)
    .map((item) => {
      const k = kind(item.inputPath);
      return { url: abs(item.url), lastmod: k === "page" ? null : iso(modified(item.inputPath, item.date))?.slice(0, 10) };
    })
    .sort((a, b) => a.url.localeCompare(b.url));
}
