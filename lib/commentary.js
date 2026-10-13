// Commentary: David's response to one piece of online content (an article, a
// video, a podcast, a social media post, a paper). Each is a Markdown file in
// src/commentary/ named YYYY-MM-DD-short-name.md:
//
//   ---
//   title: Your headline
//   source:
//     url: https://…                    required: where the content is
//     title: The content's own title    required
//     type: article                     article, video, podcast, post, paper or other
//     author: Who made it
//     site: Where it was published
//     published: 2026-10-01
//     text: The post itself, for social media posts
//     archived: https://web.archive.org/web/…   a saved copy, in case the original goes
//     archivedOn: 2026-10-13
//     image: /images/commentary/…       a still for videos, kept on this site
//   tags: [faith]
//   ---
//   Your commentary, with the parts you respond to quoted in place:
//
//   {% excerpt %}Exact words from the source.{% endexcerpt %}
//   {% moment "12:34", "13:10" %}Optional: what is said in that moment.{% endmoment %}
//
// Quotes must sit beside your own words: the build refuses a commentary with
// none, since copyright law allows quoting for criticism and review, not reposting.
import * as tags from "./tags.js";

export const TYPES = [
  { slug: "article", name: "Article" },
  { slug: "video", name: "Video" },
  { slug: "podcast", name: "Podcast" },
  { slug: "post", name: "Post" },
  { slug: "paper", name: "Paper" },
  { slug: "other", name: "Other" },
];
export const typeName = (slug) => TYPES.find((t) => t.slug === slug)?.name ?? "Source";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ""));

export function problems(data, body = "") {
  const out = [];
  if (!data.title) out.push("missing `title` (your headline)");
  const s = data.source;
  if (!s || typeof s !== "object") {
    out.push("missing `source` (url, title and type of what you're commenting on)");
  } else {
    if (!/^https?:\/\/\S+$/.test(s.url ?? "")) out.push("`source.url` must be a web address starting with http:// or https://");
    if (!String(s.title ?? "").trim()) out.push("missing `source.title`");
    if (s.type !== undefined && !TYPES.some((t) => t.slug === s.type)) out.push(`\`source.type\` is "${s.type}", expected one of: ${TYPES.map((t) => t.slug).join(", ")}`);
    for (const f of ["published", "archivedOn"]) {
      if (s[f] !== undefined && !DATE.test(asDate(s[f]))) out.push(`\`source.${f}\` must be a date like 2026-10-01`);
    }
    if (s.archived !== undefined && !/^https?:\/\/\S+$/.test(s.archived)) out.push("`source.archived` must be a web address");
    if (s.image !== undefined && !/^\/images\/\S+$/.test(s.image)) out.push("`source.image` must be an image on this site, starting /images/");
  }
  out.push(...tags.problems(data.tags));
  if (!ownWords(body)) out.push("there are no words of your own yet; add at least a sentence beside the quotes");
  for (const m of body.matchAll(MOMENT_OPEN)) {
    const [start, end] = [seconds(m[2]), m[4] === undefined ? null : seconds(m[4])];
    if (start === null) out.push(`the moment “${m[2]}” isn't a time like 12:34 or 1:02:03`);
    else if (m[4] !== undefined && (end === null || end <= start)) out.push(`the moment ending “${m[4]}” must be a time after ${m[2]}`);
  }
  return out;
}

const EXCERPT = /\{%-?\s*excerpt\s*-?%\}([\s\S]*?)\{%-?\s*endexcerpt\s*-?%\}/g;
const MOMENT = /\{%-?\s*moment\s[\s\S]*?-?%\}([\s\S]*?)\{%-?\s*endmoment\s*-?%\}/g;
const MOMENT_OPEN = /\{%-?\s*moment\s+(["'])([^"']*)\1(?:\s*,\s*(["'])([^"']*)\3)?\s*-?%\}/g;
const words = (text) => (String(text).match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** The commentary's own text: the body without its quotes, shortcodes or markup. */
export function own(body) {
  return String(body)
    .replace(EXCERPT, " ")
    .replace(MOMENT, " ")
    .replace(/\{%[\s\S]*?%\}/g, " ")
    .replace(/^>.*$/gm, " ")
    .replace(/<[^>]+>/g, " ");
}
const ownWords = (body) => words(own(body)) >= 3;

/** How many words are quoted, and how many are David's own. */
export function balance(body) {
  const quoted = [...String(body).matchAll(EXCERPT), ...String(body).matchAll(MOMENT)].map((m) => words(m[1]));
  return { own: words(own(body)), quoted: quoted.reduce((a, b) => a + b, 0), longest: Math.max(0, ...quoted) };
}

/** "12:34" or "1:02:03" or "754" → seconds, or null. */
export function seconds(time) {
  const t = String(time ?? "").trim();
  if (!/^\d+(:[0-5]?\d){0,2}$/.test(t)) return null;
  return t.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
}

/** 754 → "12:34", 3723 → "1:02:03". */
export function clock(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A YouTube or Vimeo video's player, if the address is one. */
export function video(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]+)/)?.[1] ?? null;
  }
  if (id && /^[\w-]{6,}$/.test(id)) return { site: "YouTube", id };
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const vid = u.pathname.match(/(?:^|\/)(\d{5,})(?:\/|$)/)?.[1];
    if (vid) return { site: "Vimeo", id: vid };
  }
  return null;
}

/** Where a player loads from, starting (and ending) at the given seconds. */
export function embedUrl(v, start = null, end = null) {
  if (v.site === "YouTube") {
    const q = new URLSearchParams({ autoplay: "1", rel: "0" });
    if (start) q.set("start", String(start));
    if (end) q.set("end", String(end));
    return `https://www.youtube-nocookie.com/embed/${v.id}?${q}`;
  }
  return `https://player.vimeo.com/video/${v.id}?autoplay=1&dnt=1${start ? `#t=${start}s` : ""}`;
}

/** The original at a moment: YouTube's ?t=, otherwise a media fragment. */
export function atTime(url, start) {
  if (!start) return url;
  const v = video(url);
  if (v?.site === "YouTube") return `https://www.youtube.com/watch?v=${v.id}&t=${start}s`;
  if (v?.site === "Vimeo") return `https://vimeo.com/${v.id}#t=${start}s`;
  return `${url.replace(/#.*$/, "")}#t=${start}`;
}

/**
 * A link that opens the original scrolled to the quoted words (a text fragment).
 * Long quotes use their first and last few words, which browsers match as a range.
 */
export function fragmentUrl(url, quoted) {
  const text = String(quoted).replace(/\s+/g, " ").trim();
  if (!text) return url;
  const enc = (s) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C").replace(/&/g, "%26");
  const w = text.split(" ");
  const target = w.length > 10 ? `${enc(w.slice(0, 5).join(" "))},${enc(w.slice(-5).join(" "))}` : enc(text);
  const base = url.replace(/#.*$/, "");
  return `${base}#:~:text=${target}`;
}

const escape = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paragraphsOf = (text) =>
  String(text)
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escape(p.replace(/\s+/g, " ").trim())}</p>`)
    .join("");

/**
 * A click-to-load player: a still with a Play button. Nothing loads from the
 * video site until the reader presses it, so the page sets no third-party cookies.
 */
export function player(source, { start = null, end = null } = {}) {
  const v = video(source.url);
  if (!v) return "";
  const still = source.image ? `<img class="player-still" src="${escape(source.image)}" alt="" loading="lazy" decoding="async">` : "";
  const label = start ? `Play from ${clock(start)}` : "Play";
  return (
    `<div class="player" data-src="${escape(embedUrl(v, start, end))}" data-title="${escape(source.title)}">${still}` +
    `<button type="button" class="player-play">${label}<span class="player-site">loads ${v.site}</span></button></div>`
  );
}

/** {% excerpt %}words{% endexcerpt %}: a quote from the source, linked to where it is. */
export function excerpt(words, source) {
  if (!source?.url) throw new Error("an excerpt needs the page's `source` (only commentary has one)");
  const text = String(words).trim();
  if (!text) throw new Error("an excerpt is empty");
  return (
    `<figure class="excerpt"><blockquote cite="${escape(source.url)}">${paragraphsOf(text)}</blockquote>` +
    `<figcaption><a href="${escape(fragmentUrl(source.url, text))}" rel="noopener">In the original</a></figcaption></figure>`
  );
}

/** {% moment "12:34", "13:10" %}words{% endmoment %}: a stretch of a video or podcast. */
export function moment(words, startText, endText, source) {
  if (!source?.url) throw new Error("a moment needs the page's `source` (only commentary has one)");
  const start = seconds(startText);
  if (start === null) throw new Error(`the moment “${startText}” isn't a time like 12:34 or 1:02:03`);
  const end = endText === undefined || endText === "" ? null : seconds(endText);
  if (endText && (end === null || end <= start)) throw new Error(`the moment ending “${endText}” must be a time after ${startText}`);
  const span = end ? `${clock(start)} to ${clock(end)}` : clock(start);
  const text = String(words ?? "").trim();
  return (
    `<figure class="moment">${player(source, { start, end })}` +
    (text ? `<blockquote cite="${escape(source.url)}">${paragraphsOf(text)}</blockquote>` : "") +
    `<figcaption><a class="moment-time" href="${escape(atTime(source.url, start))}" rel="noopener">${span}</a></figcaption></figure>`
  );
}

/** A stable identity for a source, so several commentaries on it meet in the graph. */
export const sourceId = (url) => {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid|si|ref)$/.test(k)) u.searchParams.delete(k);
    return `source:${u.href.replace(/\/$/, "")}`;
  } catch {
    return `source:${url}`;
  }
};

/**
 * A captured quote as it is written in a commentary: words selected on the page
 * become an excerpt, and a time in a video or recording becomes a moment.
 */
export function quoteMarkdown({ text = "", time = null } = {}) {
  const words = String(text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  if (Number.isFinite(time) && time >= 0) return `{% moment "${clock(Math.floor(time))}" %}${words ? `\n${words}\n` : ""}{% endmoment %}`;
  return words ? `{% excerpt %}\n${words}\n{% endexcerpt %}` : "";
}
