// Checks that the sources commentary responds to are still there, and that the
// words it quotes still appear in them. Run monthly by .github/workflows/check-sources.yml,
// or by hand: node tools/check-sources.js
//
// Results go in src/_data/sourceChecks.json, keyed by commentary file:
//   { "2026-10-13-short-name.md": { "status": "gone" | "changed", "since": "2026-11-01", "missing": ["…"] } }
// Sources that are fine aren't listed. A source that couldn't be checked (the site
// refused, or timed out) keeps whatever it had before, since that says nothing new.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { video } from "../lib/commentary.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "src/commentary");
const OUT = path.join(ROOT, "src/_data/sourceChecks.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const today = new Date().toISOString().slice(0, 10);

function matter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m ? { data: yaml.load(m[1]) ?? {}, content: m[2] } : { data: {}, content: raw };
}

const EXCERPT = /\{%-?\s*excerpt\s*-?%\}([\s\S]*?)\{%-?\s*endexcerpt\s*-?%\}/g;
const ENTITIES = { amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', mdash: "-", ndash: "-", hellip: "..." };

/** Text compared loosely: case, spacing, curly quotes and dashes don't count. */
const loose = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();

const pageText = (html) =>
  loose(
    html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
        e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m
      )
  );

async function get(url) {
  return fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
}

/** "ok", "gone", "changed" (with the quotes not found), or null when it couldn't be told. */
async function check(source, body) {
  const v = video(source.url);
  try {
    if (v) {
      // Video sites answer every address, so their embed service says whether the video is still there.
      const oembed = v.site === "YouTube" ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(source.url)}` : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(source.url)}`;
      const res = await get(oembed);
      if (res.ok) return { status: "ok" };
      return [400, 401, 403, 404].includes(res.status) ? { status: "gone" } : null;
    }
    const res = await get(source.url);
    if (res.status === 404 || res.status === 410) return { status: "gone" };
    if (!res.ok) return null;
    const quotes = [...body.matchAll(EXCERPT)].flatMap((m) => m[1].split(/\n\s*\n/)).map((q) => q.trim()).filter(Boolean);
    if (!quotes.length || !/html/.test(res.headers.get("content-type") ?? "")) return { status: "ok" };
    const text = pageText(await res.text());
    const missing = quotes.filter((q) => !text.includes(loose(q)));
    return missing.length ? { status: "changed", missing: missing.map((q) => (q.split(/\s+/).length > 12 ? `${q.split(/\s+/).slice(0, 12).join(" ")}…` : q)) } : { status: "ok" };
  } catch (e) {
    // A name that no longer resolves means the whole site has gone.
    return e.cause?.code === "ENOTFOUND" ? { status: "gone" } : null;
  }
}

const before = JSON.parse(await readFile(OUT, "utf8").catch(() => "{}"));
const after = {};
const files = (await readdir(DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)).sort();
for (const file of files) {
  const { data, content } = matter(await readFile(path.join(DIR, file), "utf8"));
  if (!data.source?.url) continue;
  const result = await check(data.source, content);
  const was = before[file];
  if (!result) {
    if (was) after[file] = was;
    console.log(`?  ${file}: couldn't check ${data.source.url}`);
    continue;
  }
  console.log(`${result.status === "ok" ? "ok" : "!!"} ${file}: ${result.status}${result.missing ? ` (${result.missing.length} quote(s) not found)` : ""}`);
  if (result.status === "ok") continue;
  after[file] = { status: result.status, since: was?.status === result.status ? was.since : today, ...(result.missing && { missing: result.missing }) };
}
const json = JSON.stringify(after, null, 2) + "\n";
if (json !== JSON.stringify(before, null, 2) + "\n") {
  await writeFile(OUT, json);
  console.log("Updated src/_data/sourceChecks.json");
}
