// What a commentary responds to: looking a web address up, saving a copy of it
// at the Internet Archive, fetching a video's still image, and the entry for the
// reference library. Runs in the editor's server, on David's computer.
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { video } from "../lib/commentary.js";

const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

async function get(url, { json = false, timeout = 15000, accept } = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": AGENT, accept: accept ?? (json ? "application/json" : "text/html,application/xhtml+xml,*/*;q=0.8"), "accept-language": "en-GB,en;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return json ? res.json() : res;
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const day = (s) => {
  const d = new Date(s);
  return s && !isNaN(d) ? d.toISOString().slice(0, 10) : "";
};
const strip = (html) =>
  clean(
    String(html ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
  );
// Keeps the paragraph breaks a post had.
const postText = (html) =>
  String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/<\/p>\s*<p[^>]*>|\n\s*\n/i)
    .map(strip)
    .filter(Boolean)
    .join("\n\n");

/** Everything the editor can fill in from a web address, plus the text to quote from. */
export async function lookup(rawUrl, html = null) {
  let url;
  try {
    url = new URL(String(rawUrl ?? "").trim()).href;
  } catch {
    throw new Error("That isn't a web address. Copy it from the browser's address bar.");
  }
  const special = await lookupSpecial(url).catch(() => null);
  if (special) return special;
  return lookupPage(url, html);
}

async function lookupSpecial(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  const v = video(url);
  if (v?.site === "YouTube") {
    const o = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { json: true });
    let published = "";
    try {
      const page = await (await get(`https://www.youtube.com/watch?v=${v.id}`)).text();
      published = day(page.match(/itemprop="(?:datePublished|uploadDate)" content="([^"]+)"/)?.[1] ?? page.match(/"publishDate":"([^"]+)"/)?.[1]);
    } catch {}
    return {
      source: { url: `https://www.youtube.com/watch?v=${v.id}`, title: clean(o.title), type: "video", author: clean(o.author_name), site: "YouTube", published },
      paragraphs: [],
      still: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    };
  }
  if (v?.site === "Vimeo") {
    const o = await get(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, { json: true });
    return {
      source: { url, title: clean(o.title), type: "video", author: clean(o.author_name), site: "Vimeo", published: day(o.upload_date) },
      paragraphs: [],
      still: o.thumbnail_url ?? null,
    };
  }
  // Bluesky: bsky.app/profile/<handle or did>/post/<id>
  const bsky = host === "bsky.app" && u.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)/);
  if (bsky) {
    const api = "https://public.api.bsky.app/xrpc";
    const did = bsky[1].startsWith("did:") ? bsky[1] : (await get(`${api}/com.atproto.identity.resolveHandle?handle=${bsky[1]}`, { json: true })).did;
    const { posts } = await get(`${api}/app.bsky.feed.getPosts?uris=${encodeURIComponent(`at://${did}/app.bsky.feed.post/${bsky[2]}`)}`, { json: true });
    const p = posts?.[0];
    if (!p) return null;
    const who = p.author.displayName || p.author.handle;
    return {
      source: { url, title: `${who} on Bluesky`, type: "post", author: `${who} (@${p.author.handle})`, site: "Bluesky", published: day(p.record.createdAt), text: p.record.text ?? "" },
      paragraphs: String(p.record.text ?? "").split(/\n\s*\n/).map(clean).filter(Boolean),
    };
  }
  // Mastodon and other fediverse servers: <server>/@user/<id>
  const toot = u.pathname.match(/^\/@[^/]+\/(\d+)\/?$/);
  if (toot) {
    const s = await get(`${u.origin}/api/v1/statuses/${toot[1]}`, { json: true });
    const who = s.account.display_name || s.account.username;
    const text = postText(s.content);
    return {
      source: { url, title: `${who} on ${host}`, type: "post", author: `${who} (@${s.account.acct})`, site: host, published: day(s.created_at), text },
      paragraphs: text.split("\n\n"),
    };
  }
  // X: its public embed service still returns the text of a post.
  if ((host === "x.com" || host === "twitter.com") && /\/status\/\d+/.test(u.pathname)) {
    const o = await get(`https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url)}`, { json: true });
    const text = postText(o.html.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
    const date = o.html.match(/<a[^>]*>([A-Z][a-z]+ \d{1,2}, \d{4})<\/a>\s*<\/blockquote>/)?.[1];
    return {
      source: { url, title: `${clean(o.author_name)} on X`, type: "post", author: clean(o.author_name), site: "X", published: day(date), text },
      paragraphs: text.split("\n\n").filter(Boolean),
    };
  }
  return null;
}

// Any other page: its own metadata, then the readable text for quoting.
async function lookupPage(url, givenHtml) {
  let html = givenHtml;
  let finalUrl = url;
  if (!html) {
    let res;
    try {
      res = await get(url, { timeout: 20000 });
    } catch (e) {
      throw new Error(`Couldn't open that page (${e.message}). Fill in the details yourself; you can still quote by pasting.`);
    }
    finalUrl = res.url || url;
    const type = res.headers.get("content-type") ?? "";
    if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(finalUrl)) {
      const name = decodeURIComponent(new URL(finalUrl).pathname.split("/").pop() || "").replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
      return { source: { url, title: clean(name), type: "paper", site: new URL(finalUrl).hostname.replace(/^www\./, "") }, paragraphs: [] };
    }
    html = await res.text();
  }
  const { document } = parseHTML(html);
  const metaTag = (...names) => {
    for (const n of names) {
      const el = document.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
      const v = clean(el?.getAttribute("content"));
      if (v) return v;
    }
    return "";
  };

  // schema.org data, which news sites and blogs usually include.
  let ld = {};
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const found = [JSON.parse(s.textContent)].flat().flatMap((x) => x?.["@graph"] ?? [x]);
      const best = found.find((x) => /Article|Posting|Report|Episode|VideoObject|ScholarlyArticle|WebPage/.test([x?.["@type"]].flat().join(" ")) && (x.headline || x.name));
      if (best) {
        ld = best;
        break;
      }
    } catch {}
  }
  const ldType = [ld["@type"]].flat().join(" ");
  const names = (a) => [a].flat().filter(Boolean).map((x) => clean(typeof x === "string" ? x : x.name)).filter(Boolean);
  const authors = [...new Set(names(ld.author))];
  const citationAuthors = [...document.querySelectorAll('meta[name="citation_author"]')].map((m) => clean(m.getAttribute("content"))).filter(Boolean);
  const isPaper = /ScholarlyArticle/.test(ldType) || !!metaTag("citation_title");
  const type = isPaper
    ? "paper"
    : /PodcastEpisode/.test(ldType)
      ? "podcast"
      : /VideoObject/.test(ldType) || /^video/.test(metaTag("og:type"))
        ? "video"
        : "article";
  const site = clean(names(ld.publisher)[0]) || metaTag("og:site_name", "citation_journal_title", "application-name") || new URL(finalUrl).hostname.replace(/^www\./, "");
  let title = metaTag("citation_title") || clean(ld.headline || ld.name) || metaTag("og:title", "twitter:title") || clean(document.querySelector("title")?.textContent);
  // "Headline | Site" titles lose the site part, which is shown separately.
  if (site && title.length > site.length + 3) title = title.replace(new RegExp(`\\s*[|–—-]\\s*${site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "");

  let paragraphs = [];
  let byline = "";
  try {
    const article = new Readability(parseHTML(html).document, { charThreshold: 200 }).parse();
    byline = clean(article?.byline).replace(/^by\s+/i, "");
    if (article?.content) {
      const body = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`).document;
      paragraphs = [...body.querySelectorAll("p, li, blockquote, h2, h3, h4")]
        .filter((el) => !el.querySelector("p, li"))
        .map((el) => clean(el.textContent))
        .filter((t) => t.length > 1)
        .slice(0, 400);
    }
  } catch {}

  const author = (citationAuthors.length ? citationAuthors : authors.length ? authors : [metaTag("author", "article:author", "parsely-author") || byline].filter(Boolean))
    .filter((a) => !/^https?:/.test(a))
    .slice(0, 4)
    .join(", ");
  const published = day(metaTag("citation_publication_date", "citation_date", "article:published_time", "datePublished", "date", "dc.date") || ld.datePublished || ld.uploadDate);
  const doi = metaTag("citation_doi");
  return {
    source: { url, title, type, author, site, published, ...(doi && { doi }) },
    paragraphs,
  };
}

/**
 * Asks the Internet Archive to save a copy of the page now, and returns where it
 * is. If it can't make a new one, the newest copy it already has will do.
 */
export async function archive(url, { wait = 90000 } = {}) {
  const stamp = (ts) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  try {
    const res = await fetch(`https://web.archive.org/save/${url}`, { headers: { "user-agent": AGENT }, redirect: "manual", signal: AbortSignal.timeout(wait) });
    const where = res.headers.get("content-location") || res.headers.get("location") || "";
    const ts = where.match(/\/web\/(\d{14})/)?.[1];
    if (ts) return { archived: `https://web.archive.org/web/${ts}/${url}`, archivedOn: stamp(ts) };
  } catch {}
  try {
    const found = await get(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, { json: true, timeout: 20000 });
    const snap = found?.archived_snapshots?.closest;
    if (snap?.available && snap.timestamp) return { archived: `https://web.archive.org/web/${snap.timestamp}/${url}`, archivedOn: stamp(snap.timestamp) };
  } catch {}
  return null;
}

/** A video's still image, as bytes, or null. */
export async function still(source) {
  const v = video(source.url);
  let from = null;
  if (v?.site === "YouTube") from = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  else if (v?.site === "Vimeo") {
    try {
      from = (await get(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(source.url)}`, { json: true })).thumbnail_url;
    } catch {}
  }
  if (!from) return null;
  try {
    const res = await get(from, { accept: "image/*" });
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const brace = (s) => String(s).replace(/[{}\\]/g, "");
const isPerson = (name) => /^[\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]*){1,3}$/u.test(name) && !/\b(News|Times|Post|Press|Media|Channel|Institute|University|Society|Church)\b/.test(name);
const bibName = (name) => {
  const n = brace(name.replace(/\s*\(@[^)]*\)$/, "").trim());
  if (!isPerson(n)) return `{${n}}`;
  const parts = n.split(/\s+/);
  return `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}`;
};

/** The source as a reference library entry, so posts can cite it with [@key]. */
export function bibtex(source, today) {
  const authors = String(source.author ?? "")
    .split(/,\s*(?![^()]*\))/)
    .map((a) => a.trim())
    .filter(Boolean);
  const first = authors[0] ? brace(authors[0].replace(/\s*\(@[^)]*\)$/, "")).split(/\s+/).at(-1) : brace(source.site || "source");
  const year = String(source.published || today).slice(0, 4);
  const word = brace(source.title).split(/\s+/).find((w) => w.length > 3 && !/^(the|and|with|from|that|this|what|when|into|about)$/i.test(w)) ?? "";
  const key = `${first}${year}${word}`.normalize("NFKD").replace(/[^\w]/g, "") || `source${year}`;
  const fields = [
    ["title", `{${brace(source.title)}}`],
    authors.length && ["author", `{${authors.map(bibName).join(" and ")}}`],
    source.site && ["organization", `{${brace(source.site)}}`],
    source.published && ["date", `{${String(source.published).slice(0, 10)}}`],
    source.doi && ["doi", `{${brace(source.doi)}}`],
    ["url", `{${source.url}}`],
    ["urldate", `{${today}}`],
  ].filter(Boolean);
  return { key, raw: `@online{${key},\n${fields.map(([k, v]) => `  ${k} = ${v},`).join("\n")}\n}` };
}
