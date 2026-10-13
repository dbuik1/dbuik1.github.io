// Local writing editor: `npm run write`, then open the printed address.
// Serves the editor UI (through Vite) and a small JSON API that reads and writes
// files in this repository. It listens on 127.0.0.1 only and rejects requests
// from other origins, because anything that can reach it can commit to the site.
// The one exception is the capture extension in extension/, which may only hand
// over a page to write about.
import { createServer as createHttpServer } from "node:http";
import { readFile, writeFile, readdir, mkdir, unlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { createServer as createViteServer } from "vite";
import sharp from "sharp";
import * as annotations from "../lib/annotations.js";
import * as references from "../lib/references.js";
import * as texts from "../lib/texts.js";
import * as xref from "../lib/xref.js";
import * as tagTools from "../lib/tags.js";
import * as visuals from "../lib/visuals.js";
import * as commentary from "../lib/commentary.js";
import * as sources from "./sources.js";
import site from "../src/_data/site.js";
import levels from "../src/_data/levels.js";
import statuses from "../src/_data/statuses.js";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG = path.join(ROOT, "src/blog");
const PROJECTS = path.join(ROOT, "src/projects");
const NOTES = path.join(ROOT, "src/notes");
const COMMENTARY = path.join(ROOT, "src/commentary");
const DRAFTS = path.join(ROOT, "drafts");
const CAPTURES = path.join(ROOT, "drafts/saved-for-later");
const IMAGES = path.join(ROOT, "src/images");
const PORT = Number(process.env.PORT) || 8081;
const ELEVENTY = path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs");
const ORIGIN = `http://127.0.0.1:${PORT}`;
// The capture extension's fixed ID comes from the key in extension/manifest.json.
const EXTENSION_ORIGIN = "chrome-extension://lobdfgckjpmceechmamhekieahplcbnn";
const EXTENSION_ROUTES = new Set(["POST /api/capture"]);

const POST_FILE = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/;
const slugify = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

class UserError extends Error {}

// Splits a Markdown file into its YAML front matter and body.
function matter(source) {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, content: source };
  return { data: yaml.load(m[1]) ?? {}, content: m[2] };
}

// ---- Posts and drafts ----

async function listPosts() {
  const files = (await readdir(BLOG)).filter((f) => POST_FILE.test(f)).sort().reverse();
  return Promise.all(
    files.map(async (file) => {
      const { data } = matter(await readFile(path.join(BLOG, file), "utf8"));
      return { file, title: data.title ?? file, date: file.match(POST_FILE)[1], level: data.level, draft: !!data.draft };
    })
  );
}

async function listDrafts() {
  if (!existsSync(DRAFTS)) return [];
  const files = (await readdir(DRAFTS)).filter((f) => f.endsWith(".json"));
  const drafts = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(DRAFTS, f), "utf8"))));
  return drafts
    .map((d) => ({
      id: d.id,
      kind: d.kind ?? "post",
      title: d.kind === "text" ? texts.texts.find((t) => t.name === d.file)?.label ?? d.file : d.meta?.title || (d.meta?.source?.title ? `On ${d.meta.source.title}` : "Untitled"),
      updated: d.updated,
      file: d.file ?? null,
    }))
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
}

const draftPath = (id) => {
  if (!/^[a-z0-9-]+$/.test(id)) throw new UserError("That draft name isn't valid.");
  return path.join(DRAFTS, `${id}.json`);
};

const postPath = (file) => {
  if (!POST_FILE.test(file)) throw new UserError("That post file name isn't valid.");
  return path.join(BLOG, file);
};

async function readPost(file) {
  const { data, content } = matter(await readFile(postPath(file), "utf8"));
  const [, date, slug] = file.match(POST_FILE);
  return { meta: { ...data, date, slug }, body: content.replace(/^\n+/, "") };
}

// Opening a published post starts (or resumes) a private draft of the edit,
// so nothing changes on the site until it is published again.
async function openPost(file) {
  const id = `edit-${slugify(file.replace(/\.md$/, ""))}`;
  const p = draftPath(id);
  if (existsSync(p)) return JSON.parse(await readFile(p, "utf8"));
  const { meta, body } = await readPost(file);
  return { id, kind: "post", file, meta, body, updated: null };
}

// ---- The live version ----

const hash = (text) => createHash("sha1").update(text).digest("hex");

function liveFile(kind, file) {
  if (!file) return null;
  const full = { post: postPath, note: notePath, project: projectPath, text: texts.file, visual: visualPath, commentary: commentaryPath }[kind ?? "post"](file);
  return existsSync(full) ? full : null;
}

// Adds what the site shows now, so the editor can show it next to a draft.
// `base` is the live file a draft started from; if the live file has changed
// since (published from another computer, or edited on GitHub), publishing
// the draft would overwrite that newer version.
function withLive(doc) {
  const kind = doc.kind ?? "post";
  const full = liveFile(kind, doc.file);
  if (!full) return doc;
  const raw = readFileSync(full, "utf8");
  const { data, content } = kind === "text" ? { data: {}, content: raw } : matter(raw);
  const live = { title: data.title ?? null, body: content.replace(/^\n+/, "").trim(), hash: hash(raw) };
  const out = { ...doc, live, base: doc.base ?? (doc.updated ? null : live.hash) };
  if (kind === "post") out.liveLevel = data.level ?? null;
  if (kind === "commentary") out.check = sourceChecks()[doc.file] ?? null;
  out.liveMoved = !!(doc.updated && doc.base && doc.base !== live.hash);
  return out;
}

// ---- Notes ----

const notePath = (file) => {
  if (!POST_FILE.test(file ?? "")) throw new UserError("That note file name isn't valid.");
  return path.join(NOTES, file);
};

async function listNotes() {
  if (!existsSync(NOTES)) return [];
  const files = (await readdir(NOTES)).filter((f) => POST_FILE.test(f)).sort().reverse();
  return Promise.all(
    files.map(async (file) => {
      const { data } = matter(await readFile(path.join(NOTES, file), "utf8"));
      return { file, title: data.title ?? file, date: file.match(POST_FILE)[1], kind: data.kind ?? "", draft: !!data.draft };
    })
  );
}

async function openNote(file) {
  const id = `note-${slugify(file.replace(/\.md$/, ""))}`;
  const p = draftPath(id);
  if (existsSync(p)) return JSON.parse(await readFile(p, "utf8"));
  const { data, content } = matter(await readFile(notePath(file), "utf8"));
  const [, date, slug] = file.match(POST_FILE);
  return { id, kind: "note", file, meta: { ...data, date, slug }, body: content.replace(/^\n+/, ""), updated: null };
}

// A note's address comes from its first few words, so long lines still get short addresses.
const noteSlug = (text) => slugify(String(text).split(/\s+/).slice(0, 8).join(" ")).slice(0, 60).replace(/-$/, "");

// ---- Commentary ----
// Like posts, each is a dated file; the source it responds to is in its front matter.

const commentaryPath = (file) => {
  if (!POST_FILE.test(file ?? "")) throw new UserError("That commentary's file name isn't valid.");
  return path.join(COMMENTARY, file);
};

// What the monthly check (tools/check-sources.js) last found wrong with each source.
const sourceChecks = () => {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, "src/_data/sourceChecks.json"), "utf8"));
  } catch {
    return {};
  }
};

async function listCommentary() {
  if (!existsSync(COMMENTARY)) return [];
  const checks = sourceChecks();
  const files = (await readdir(COMMENTARY)).filter((f) => POST_FILE.test(f)).sort().reverse();
  return Promise.all(
    files.map(async (file) => {
      const { data } = matter(await readFile(path.join(COMMENTARY, file), "utf8"));
      return { file, title: data.title ?? file, date: file.match(POST_FILE)[1], on: data.source?.title ?? "", type: data.source?.type ?? "", draft: !!data.draft, check: checks[file]?.status ?? null };
    })
  );
}

const dateText = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

async function openCommentary(file) {
  const id = `commentary-${slugify(file.replace(/\.md$/, ""))}`;
  const p = draftPath(id);
  if (existsSync(p)) return JSON.parse(await readFile(p, "utf8"));
  const { data, content } = matter(await readFile(commentaryPath(file), "utf8"));
  const [, date, slug] = file.match(POST_FILE);
  const source = Object.fromEntries(Object.entries(data.source ?? {}).map(([k, v]) => [k, dateText(v)]));
  return { id, kind: "commentary", file, meta: { ...data, source, date, slug }, body: content.replace(/^\n+/, ""), updated: null };
}

// Fills in what publishing adds to a commentary's source: a saved copy at the
// Internet Archive, a still image for a video, and its reference library entry.
// None of these is essential, so a failure (offline, say) never stops publishing.
async function completeSource(doc, slug) {
  const s = { ...(doc.meta.source ?? {}) };
  if (!s.archived && /^https?:/.test(s.url ?? "")) Object.assign(s, (await sources.archive(s.url, { wait: 30000 })) ?? {});
  let stillFile = null;
  if (!s.image && commentary.video(s.url ?? "")) {
    const bytes = await sources.still(s);
    if (bytes) {
      const dir = path.join(IMAGES, "commentary");
      await mkdir(dir, { recursive: true });
      stillFile = path.join(dir, `${slug}.jpg`);
      await writeFile(stillFile, await sharp(bytes).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer());
      s.image = `/images/commentary/${slug}.jpg`;
    }
  }
  if (!s.key && s.title && s.url) {
    const entries = references.splitEntries(references.readLibrary());
    const same = entries.find((e) => e.raw.includes(`url = {${s.url}}`));
    if (same) s.key = same.key;
    else {
      const [entry] = await references.toEntries(sources.bibtex(s, today()).raw, new Set(entries.map((e) => e.key)));
      references.writeEntries([...entries, entry]);
      try {
        references.items();
        s.key = entry.key;
      } catch {
        references.writeEntries(entries);
      }
    }
  }
  return { source: s, stillFile };
}

// ---- Captures from the browser extension ----
// "Write now" opens a commentary draft straight away; "Save for later" keeps the
// page, looked up while it was open, on the start screen until David writes it.

const capturePath = (id) => {
  if (!/^[a-z0-9-]+$/.test(id ?? "")) throw new UserError("That saved item isn't valid.");
  return path.join(CAPTURES, `${id}.json`);
};

async function capture({ url, title, html, selection, time, mode, capturedAt }) {
  if (!/^https?:\/\//.test(url ?? "")) throw new UserError("Only web pages can be captured.");
  let found;
  try {
    found = await sources.lookup(url, html || null);
  } catch {
    found = { source: { url, title: String(title ?? "").trim() || url }, paragraphs: [] };
  }
  const item = {
    id: `${slugify(found.source.title ?? "").slice(0, 40).replace(/-$/, "") || "commentary"}-${Date.now().toString(36)}`,
    capturedAt: capturedAt || new Date().toISOString(),
    source: found.source,
    sourceText: found.paragraphs ?? [],
    quote: commentary.quoteMarkdown({ text: selection, time: time ?? null }),
  };
  if (mode === "write") {
    const draft = await draftFromCapture(item);
    return { draft: draft.id, open: `${ORIGIN}/?draft=${draft.id}` };
  }
  await mkdir(CAPTURES, { recursive: true });
  await writeFile(capturePath(item.id), JSON.stringify(item, null, 2));
  keepCopy(item.id, item.source.url);
  return { saved: item.id };
}

// The Internet Archive can take a minute, so a saved item gets its copy in the background.
async function keepCopy(id, url) {
  const copy = await sources.archive(url).catch(() => null);
  if (!copy?.archived || !existsSync(capturePath(id))) return;
  const item = JSON.parse(await readFile(capturePath(id), "utf8"));
  if (item.source.url !== url) return;
  Object.assign(item.source, copy);
  await writeFile(capturePath(id), JSON.stringify(item, null, 2));
}

const draftFromCapture = (item) =>
  saveDraft({
    id: item.id,
    kind: "commentary",
    meta: { title: "", tags: [], source: item.source, sourceText: item.sourceText },
    body: item.quote ? `${item.quote}\n` : "",
  });

async function listCaptures() {
  if (!existsSync(CAPTURES)) return [];
  const files = (await readdir(CAPTURES)).filter((f) => f.endsWith(".json"));
  const items = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(CAPTURES, f), "utf8"))));
  return items
    .map(({ id, capturedAt, source, quote }) => {
      const time = quote?.match(/^\{% moment "([^"]+)"/)?.[1];
      return { id, capturedAt, title: source.title, site: source.site ?? "", type: source.type ?? "", quote: time ? `from ${time}` : quote ? "with a quote" : "" };
    })
    .sort((a, b) => (b.capturedAt ?? "").localeCompare(a.capturedAt ?? ""));
}

async function writeCapture({ id }) {
  const item = JSON.parse(await readFile(capturePath(id), "utf8"));
  const draft = await draftFromCapture(item);
  await unlink(capturePath(id));
  return draft;
}

// ---- Projects ----

const PROJECT_FILE = /^([a-z0-9][a-z0-9-]*)\.md$/;
const projectPath = (slug) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug ?? "")) throw new UserError("That project address isn't valid.");
  return path.join(PROJECTS, `${slug}.md`);
};

async function listProjects() {
  const files = (await readdir(PROJECTS)).filter((f) => PROJECT_FILE.test(f));
  const projects = await Promise.all(
    files.map(async (f) => {
      const { data } = matter(await readFile(path.join(PROJECTS, f), "utf8"));
      return { slug: f.replace(/\.md$/, ""), title: data.title ?? f, status: data.status ?? "", draft: !!data.draft };
    })
  );
  return projects.sort((a, b) => a.title.localeCompare(b.title));
}

async function openProject(slug) {
  const id = `project-${slug}`;
  const p = draftPath(id);
  if (existsSync(p)) return JSON.parse(await readFile(p, "utf8"));
  const { data, content } = matter(await readFile(projectPath(slug), "utf8"));
  return { id, kind: "project", file: slug, meta: { ...data, slug }, body: content.replace(/^\n+/, ""), updated: null };
}

// ---- Visuals ----
// Each visual is a folder in src/visuals/ (see lib/visuals.js). The editor keeps
// the HTML file in the draft, so nothing reaches the site until it is published.

const visualPath = (slug) => {
  if (!visuals.SLUG.test(slug ?? "")) throw new UserError("That visual's address isn't valid.");
  return path.join(visuals.DIR, slug, "index.md");
};

async function listVisuals() {
  if (!existsSync(visuals.DIR)) return [];
  const slugs = (await readdir(visuals.DIR)).filter((f) => visuals.SLUG.test(f) && existsSync(path.join(visuals.DIR, f, "index.md")));
  const list = await Promise.all(
    slugs.map(async (slug) => {
      const { data } = matter(await readFile(visualPath(slug), "utf8"));
      return { slug, title: data.title ?? slug, draft: !!data.draft, poster: existsSync(visuals.posterPath(slug)) };
    })
  );
  return list.sort((a, b) => a.title.localeCompare(b.title));
}

async function openVisual(slug) {
  const id = `visual-${slug}`;
  const p = draftPath(id);
  if (existsSync(p)) return JSON.parse(await readFile(p, "utf8"));
  const { data, content } = matter(await readFile(visualPath(slug), "utf8"));
  const html = existsSync(visuals.htmlPath(slug)) ? await readFile(visuals.htmlPath(slug), "utf8") : "";
  return { id, kind: "visual", file: slug, meta: { ...data, slug, html }, body: content.replace(/^\n+/, ""), updated: null };
}

// A still image of the visual for posts to show before it runs. It is taken
// with the Edge or Chrome already on this computer; without either, the visual
// shows a plain Run button instead, which works just as well.
async function capturePoster(slug) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return null;
  }
  const html = visuals.prepare(await readFile(visuals.htmlPath(slug), "utf8"));
  for (const options of [{ channel: "msedge" }, { channel: "chrome" }, {}]) {
    let browser;
    try {
      browser = await chromium.launch({ ...options, headless: true });
      const page = await browser.newPage({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2, colorScheme: "light" });
      await page.setContent(html, { waitUntil: "load", timeout: 15000 });
      await page.waitForTimeout(2500);
      const height = await page.evaluate(() => {
        const cs = getComputedStyle(document.body);
        return Math.ceil(document.body.scrollHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom));
      });
      await page.setViewportSize({ width: 720, height: Math.min(1200, Math.max(240, height)) });
      await page.waitForTimeout(400);
      const shot = await page.screenshot({ type: "png" });
      await writeFile(visuals.posterPath(slug), await sharp(shot).png({ compressionLevel: 9 }).toBuffer());
      return visuals.posterPath(slug);
    } catch {
      // Try the next browser.
    } finally {
      await browser?.close().catch(() => {});
    }
  }
  return null;
}

// ---- Site text ----

// Each text with the start of what the site shows now, and whether it has unpublished changes.
async function listTexts() {
  return texts.texts.map((t) => {
    const current = texts.read(t.name).replace(/\s+/g, " ");
    return {
      name: t.name,
      preview: current.length > 90 ? `${current.slice(0, 90).replace(/\s\S*$/, "")}…` : current,
      draft: existsSync(draftPath(`text-${t.name}`)),
    };
  });
}

async function openText(name) {
  if (!texts.texts.some((t) => t.name === name)) throw new UserError("There's no site text with that name.");
  const id = `text-${name}`;
  const p = draftPath(id);
  if (existsSync(p)) return JSON.parse(await readFile(p, "utf8"));
  return { id, kind: "text", file: name, meta: {}, body: texts.read(name), updated: null };
}

async function saveDraft({ id, kind, file, meta, body, base }) {
  await mkdir(DRAFTS, { recursive: true });
  const draftId = id || `${slugify(meta?.title || "untitled") || "untitled"}-${Date.now().toString(36)}`;
  const draft = { id: draftId, kind: kind ?? "post", file: file ?? null, base: base ?? null, meta, body, updated: new Date().toISOString() };
  await writeFile(draftPath(draftId), JSON.stringify(draft, null, 2));
  return draft;
}

// ---- Front matter ----

const FIELD_ORDER = ["title", "kind", "by", "source", "description", "level", "history", "tags", "project", "series", "visual", "status", "summary", "links"];
const yamlString = (s) => (/^[A-Za-z0-9][\w .,'’()?!-]*$/.test(s) && !/: /.test(s) ? s : JSON.stringify(s));

function frontMatter(meta) {
  const lines = [];
  const extra = Object.keys(meta).filter((k) => !FIELD_ORDER.includes(k) && !["date", "slug", "draft"].includes(k));
  for (const key of [...FIELD_ORDER, ...extra]) {
    const v = meta[key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (!Array.isArray(v) && typeof v === "object") {
      lines.push(`${key}:`);
      for (const [k, x] of Object.entries(v)) {
        if (x === undefined || x === null || x === "") continue;
        if (typeof x === "string" && x.includes("\n")) lines.push(`  ${k}: |-`, ...x.split("\n").map((l) => (l ? `    ${l}` : "")));
        else lines.push(`  ${k}: ${yamlString(String(x))}`);
      }
    } else if (Array.isArray(v) && typeof v[0] === "object") {
      lines.push(`${key}:`);
      for (const item of v) {
        Object.entries(item).forEach(([k, x], i) => lines.push(`${i ? "    " : "  - "}${k}: ${yamlString(String(x))}`));
      }
    } else if (Array.isArray(v)) lines.push(`${key}: [${v.map((t) => yamlString(String(t))).join(", ")}]`);
    else if (typeof v === "string") lines.push(`${key}: ${yamlString(v)}`);
    else lines.push(`${key}: ${JSON.stringify(v)}`);
  }
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function checkProject(meta) {
  const problems = [];
  if (!meta.title?.trim()) problems.push("Add a title.");
  if (!statuses.some((x) => x.slug === meta.status)) problems.push("Choose a status.");
  if (!slugify(meta.slug || meta.title || "")) problems.push("The address can't be empty.");
  for (const l of meta.links ?? []) {
    if (!l.label?.trim() || !l.url?.trim()) problems.push("Every link needs both a label and an address.");
  }
  if (problems.length) throw new UserError([...new Set(problems)].join(" "));
}

function checkMeta(meta) {
  const problems = [];
  if (!meta.title?.trim()) problems.push("Add a title.");
  if (!levels.some((l) => l.slug === meta.level)) problems.push("Choose a research level.");
  problems.push(...tagTools.problems(meta.tags).map((p) => `Tags: ${p}.`));
  if (!slugify(meta.slug || meta.title || "")) problems.push("The address can't be empty.");
  if (problems.length) throw new UserError(problems.join(" "));
}

// ---- Publishing ----

// GIT_TERMINAL_PROMPT=0: a missing login fails with a message instead of waiting for input nobody sees.
const git = async (...args) => (await run("git", args, { cwd: ROOT, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } })).stdout.trim();

// Eleventy's own error lines, without the stack trace.
function buildError(e) {
  const out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
  const lines = out.split("\n").map((l) => l.replace(/^\[11ty\]\s?/, "")).filter((l) => l.trim());
  const start = lines.findIndex((l) => /Post |annotation|Cross-link|Error/.test(l));
  const useful = (start >= 0 ? lines.slice(start) : lines).filter((l) => !/^\s+at |Original error stack|Eleventy Fatal Error/.test(l));
  // Eleventy repeats the same error several times; show each line once.
  return [...new Set(useful)].slice(0, 8).join("\n") || e.message;
}

// What publishing a document writes: its file, contents, commit message and live address.
function plan({ kind = "post", file, meta, body }) {
  if (kind === "text") {
    const t = texts.texts.find((x) => x.name === file);
    if (!t) throw new UserError("There's no site text with that name.");
    const content = t.inline ? body.replace(/\s*\n\s*/g, " ").trim() : body.trim();
    return {
      full: texts.file(file),
      content: content ? `${content}\n` : "",
      message: `Update ${t.label.charAt(0).toLowerCase()}${t.label.slice(1)}`,
      url: `${site.url}${t.url}`,
      isNew: false,
    };
  }
  if (kind === "note") {
    const problems = [];
    if (!meta.title?.trim()) problems.push("Write the note in one line in the title.");
    problems.push(...tagTools.problems(meta.tags).map((p) => `Tags: ${p}.`));
    const slug = noteSlug(meta.slug || meta.title || "");
    if (!slug) problems.push("The line needs at least one letter or number.");
    if (problems.length) throw new UserError(problems.join(" "));
    const target = file ?? `${today()}-${slug}.md`;
    const full = notePath(target);
    if (!file && existsSync(full)) throw new UserError(`A note called ${target} already exists. Change a word or two.`);
    const { date, slug: _slug, draft, ...fields } = meta;
    for (const k of ["kind", "by", "source"]) fields[k] = String(fields[k] ?? "").trim();
    if (draft) fields.draft = true;
    return {
      full,
      content: frontMatter(fields) + body.trim() + "\n",
      message: `${file ? "Update" : "Add"} note “${meta.title.trim()}”`,
      url: `${site.url}/notes/${target.match(POST_FILE)[2]}/`,
      file: target,
      isNew: !file,
    };
  }
  if (kind === "commentary") {
    const problems = [];
    const s = meta.source ?? {};
    if (!meta.title?.trim()) problems.push("Write your headline.");
    if (!/^https?:\/\/\S+$/.test(s.url?.trim() ?? "")) problems.push("Add the web address of what you're responding to.");
    if (!s.title?.trim()) problems.push("Add the source's title.");
    if (s.published && !/^\d{4}-\d{2}-\d{2}$/.test(s.published)) problems.push("Write the source's date like 2026-10-01, or leave it empty.");
    if (commentary.balance(body).own < 3) problems.push("Write at least a sentence of your own beside the quotes.");
    problems.push(...tagTools.problems(meta.tags).map((p) => `Tags: ${p}.`));
    const slug = (file ? file.match(POST_FILE)[2] : slugify(meta.slug || meta.title || "").slice(0, 60).replace(/-$/, ""));
    if (!slug) problems.push("The headline needs at least one letter or number.");
    if (problems.length) throw new UserError(problems.join(" "));
    const target = file ?? `${today()}-${slug}.md`;
    const full = commentaryPath(target);
    if (!file && existsSync(full)) throw new UserError(`A commentary called ${target} already exists. Change the address under More details.`);
    const { date, slug: _slug, draft, sourceText: _text, ...fields } = meta;
    const order = ["url", "title", "type", "author", "site", "published", "text", "doi", "archived", "archivedOn", "image", "key"];
    fields.source = Object.fromEntries(order.filter((k) => String(s[k] ?? "").trim()).map((k) => [k, k === "text" ? String(s[k]).trim() : String(s[k]).replace(/\s+/g, " ").trim()]));
    if (draft) fields.draft = true;
    return {
      full,
      content: frontMatter(fields) + body.trim() + "\n",
      message: `${file ? "Update" : "Add"} commentary “${meta.title.trim()}”`,
      url: `${site.url}/commentary/${slug}/`,
      file: target,
      isNew: !file,
    };
  }
  if (kind === "visual") {
    const problems = [];
    if (!meta.title?.trim()) problems.push("Give the visual a title.");
    if (!meta.description?.trim()) problems.push("Write the text description: a few sentences saying what the visual shows, for people who can't see or run it.");
    if (!meta.html?.trim()) problems.push("Add the visual's HTML file.");
    else problems.push(...visuals.htmlProblems(meta.html).map((p) => `The HTML file won't work on the site: ${p}.`));
    problems.push(...tagTools.problems(meta.tags).map((p) => `Tags: ${p}.`));
    const slug = file ?? slugify(meta.slug || meta.title || "");
    if (!slug) problems.push("The title needs at least one letter or number.");
    if (problems.length) throw new UserError(problems.join(" "));
    const full = visualPath(slug);
    if (!file && existsSync(path.dirname(full))) throw new UserError(`A visual at /visuals/${slug}/ already exists. Change the address under More details.`);
    const { slug: _s, html, draft, ...fields } = meta;
    fields.description = fields.description.trim();
    if (draft) fields.draft = true;
    return {
      full,
      content: frontMatter(fields) + body.trim() + "\n",
      files: [{ full: visuals.htmlPath(slug), content: html }],
      poster: slug,
      message: `${file ? "Update" : "Add"} visual “${meta.title.trim()}”`,
      url: `${site.url}/visuals/${slug}/`,
      file: slug,
      isNew: !file,
    };
  }
  if (kind === "project") {
    checkProject(meta);
    const slug = file ?? slugify(meta.slug || meta.title);
    const full = projectPath(slug);
    if (!file && existsSync(full)) throw new UserError(`A project at /projects/${slug}/ already exists. Change the address under More details.`);
    const { slug: _s, draft, ...fields } = meta;
    fields.links = (fields.links ?? []).map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
    if (draft) fields.draft = true;
    return {
      full,
      content: frontMatter(fields) + body.trim() + "\n",
      message: `${file ? "Update" : "Add"} project “${meta.title.trim()}”`,
      url: `${site.url}/projects/${slug}/`,
      isNew: !file,
    };
  }
  checkMeta(meta);
  const slug = slugify(meta.slug || meta.title);
  const target = file ?? `${meta.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date) ? meta.date : today()}-${slug}.md`;
  const full = postPath(target);
  if (!file && existsSync(full)) throw new UserError(`A post called ${target} already exists. Change the address under More details.`);
  const { date, slug: _slug, draft, category: _category, ...fields } = meta;
  fields.history = growth(file, meta.level, fields.history);
  return {
    full,
    content: frontMatter(fields) + body.trim() + "\n",
    message: `${file ? "Update" : "Publish"} “${meta.title.trim()}”`,
    url: `${site.url}/blog/${target.match(POST_FILE)[2]}/`,
    file: target,
    isNew: !file,
  };
}

// When a published post moves to another research level, the date it got there
// is kept in `history`, so the post can say how long it has been at that level.
function growth(file, level, history = []) {
  const kept = (Array.isArray(history) ? history : []).map((h) => ({ level: h.level, date: String(h.date instanceof Date ? h.date.toISOString() : h.date).slice(0, 10) }));
  if (!file || !existsSync(postPath(file))) return kept;
  const was = matter(readFileSync(postPath(file), "utf8")).data.level;
  return was && was !== level ? [...kept, { level, date: today() }] : kept;
}

// Images the document uses that aren't committed yet go with it.
function imagesIn(content) {
  const paths = [...content.matchAll(/\]\((\/images\/[^\s)"]+)/g)].map((m) => path.join(ROOT, "src", decodeURI(m[1])));
  return [...new Set(paths)].filter((p) => p.startsWith(IMAGES) && existsSync(p));
}

async function libraryChanged() {
  return !!(await git("status", "--porcelain", "--", path.relative(ROOT, references.LIBRARY)));
}

async function commitAndPush(paths, message) {
  const rels = paths.map((p) => path.relative(ROOT, p));
  await git("add", "--", ...rels);
  try {
    await git("commit", "-m", message, "--", ...rels);
  } catch (e) {
    if (/nothing to commit|no changes added/.test(`${e.stdout}${e.stderr}`)) return { unchanged: true };
    throw new UserError(`Couldn't commit: ${e.stderr || e.message}`);
  }
  try {
    await git("push", "--quiet");
    return { pushed: true };
  } catch (e) {
    return { pushed: false, pushError: (e.stderr || e.message).trim() };
  }
}

// The editor reads the files on this computer, so it fetches the latest
// version of the site from GitHub before listing or opening anything; otherwise
// it would show text that has since been changed elsewhere. At most every 20
// seconds, and never fatal: offline, it carries on with what's here.
const sync = { at: 0, error: null, editorChanged: false, running: null };
const EDITOR_CODE = /^(editor\/|lib\/|src\/_data\/|package(-lock)?\.json$)/;

async function syncSite() {
  if (sync.running) return sync.running;
  if (Date.now() - sync.at < 20000) return sync;
  sync.running = (async () => {
    try {
      const branch = await git("rev-parse", "--abbrev-ref", "HEAD");
      if (branch !== "main") {
        sync.error = `The site folder is on the branch “${branch}”, so the latest version wasn't fetched.`;
        return sync;
      }
      await git("fetch", "--quiet");
      const before = await git("rev-parse", "HEAD");
      if (Number(await git("rev-list", "--count", "HEAD..@{u}"))) {
        await git("pull", "--rebase", "--autostash", "--quiet");
        const changed = (await git("diff", "--name-only", before, "HEAD")).split("\n");
        if (changed.some((f) => EDITOR_CODE.test(f))) sync.editorChanged = true;
      }
      sync.error = null;
    } catch (e) {
      sync.error = `Couldn't fetch the latest version from GitHub, so this shows the copy on this computer. ${(e.stderr || e.message).trim()}`;
    } finally {
      sync.at = Date.now();
      sync.running = null;
    }
    return sync;
  })();
  return sync.running;
}
const syncState = () => ({ error: sync.error, editorChanged: sync.editorChanged });

async function readyToPublish() {
  const branch = await git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") throw new UserError(`The repository is on the branch “${branch}”. Switch to main to publish.`);
  try {
    await git("pull", "--rebase", "--autostash", "--quiet");
  } catch (e) {
    throw new UserError(`Couldn't fetch the latest version of the site from GitHub: ${e.stderr || e.message}`);
  }
}

async function checkBuild(restore) {
  try {
    // Node runs Eleventy's own script directly, which works on Windows too (npx there is npx.cmd).
    await run(process.execPath, [ELEVENTY, "--dryrun", "--quiet"], { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    await restore();
    throw new UserError(`The site wouldn't build with this change, so nothing was published.\n\n${buildError(e)}`);
  }
}

async function publish(doc) {
  let p = plan(doc);
  await readyToPublish();
  let extra = [];
  if (doc.kind === "commentary") {
    const { source, stillFile } = await completeSource(doc, p.url.split("/").at(-2));
    doc = { ...doc, meta: { ...doc.meta, source } };
    p = plan(doc);
    if (stillFile) extra.push(stillFile);
  }
  if (p.isNew && existsSync(p.full)) throw new UserError(`${path.relative(ROOT, p.full)} already exists. Change the address under More details.`);

  const files = [{ full: p.full, content: p.content }, ...(p.files ?? [])];
  const previous = await Promise.all(files.map(async (f) => (existsSync(f.full) ? readFile(f.full, "utf8") : null)));
  for (const f of files) {
    await mkdir(path.dirname(f.full), { recursive: true });
    await writeFile(f.full, f.content);
  }
  await checkBuild(() => Promise.all(files.map((f, i) => (previous[i] === null ? unlink(f.full) : writeFile(f.full, previous[i])))));

  const paths = [...files.map((f) => f.full), ...imagesIn(p.content), ...extra];
  let posterMissing = false;
  if (p.poster) {
    const poster = await capturePoster(p.poster);
    if (poster) paths.push(poster);
    else posterMissing = !existsSync(visuals.posterPath(p.poster));
  }
  if (await libraryChanged()) paths.push(references.LIBRARY);
  const result = await commitAndPush(paths, p.message);
  if (doc.id) await unlink(draftPath(doc.id)).catch(() => {});
  const unsaved = doc.kind === "commentary" && !doc.meta.source?.archived;
  return { ...result, url: p.url, file: p.file, posterMissing, unsaved, actions: `${site.repo}/actions` };
}

// ---- Images ----

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

// Saves an image under src/images/<year>/, shrunk to at most 2400 pixels a side.
// It stays uncommitted until a post that uses it is published.
async function saveImage({ name, type, data }) {
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new UserError("Use a JPEG, PNG, WebP, AVIF or GIF image.");
  let buf = Buffer.from(data, "base64");
  if (ext !== "gif") {
    buf = await sharp(buf).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).toBuffer();
  }
  const dir = path.join(IMAGES, String(new Date().getFullYear()));
  await mkdir(dir, { recursive: true });
  const base = slugify(String(name ?? "").replace(/\.[^.]+$/, "")) || "image";
  let file = `${base}.${ext}`;
  for (let n = 2; existsSync(path.join(dir, file)); n++) file = `${base}-${n}.${ext}`;
  await writeFile(path.join(dir, file), buf);
  return { src: `/images/${path.relative(IMAGES, path.join(dir, file)).split(path.sep).join("/")}` };
}

// ---- Reference library ----

async function usesOf(key) {
  const pattern = new RegExp(`@${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:.-])`);
  const found = [];
  for (const dir of [BLOG, PROJECTS, NOTES, COMMENTARY].filter((d) => existsSync(d))) {
    for (const f of (await readdir(dir)).filter((x) => x.endsWith(".md"))) {
      if (pattern.test(await readFile(path.join(dir, f), "utf8"))) found.push(path.relative(ROOT, path.join(dir, f)));
    }
  }
  return found;
}

const libraryState = async () => ({ entries: references.list(), unpublished: await libraryChanged() });

async function addReferences({ input, replace = false }) {
  if (!input?.trim()) throw new UserError("Paste a DOI, an ISBN or a BibTeX entry first.");
  const current = references.splitEntries(references.readLibrary());
  const keys = new Set(current.map((e) => e.key));
  let added = [];
  let updated = [];
  if (replace) {
    // Importing: entries with a key already in the library replace it, as Zotero's export would.
    const incoming = /^\s*@/.test(input) ? references.splitEntries(input) : await references.toEntries(input, new Set());
    if (!incoming.length) throw new UserError("That file has no BibTeX entries in it.");
    for (const entry of incoming) {
      const i = current.findIndex((e) => e.key === entry.key);
      if (i >= 0) {
        if (current[i].raw !== entry.raw) updated.push(entry.key);
        current[i] = entry;
      } else {
        current.push(entry);
        added.push(entry.key);
      }
    }
  } else {
    let incoming;
    try {
      incoming = await references.toEntries(input, keys);
    } catch (e) {
      throw new UserError(e.message);
    }
    current.push(...incoming);
    added = incoming.map((e) => e.key);
  }
  const before = references.readLibrary();
  references.writeEntries(current);
  try {
    references.items();
  } catch (e) {
    await writeFile(references.LIBRARY, before);
    throw new UserError(`Nothing was added: ${e.message}`);
  }
  return { ...(await libraryState()), added, updated };
}

async function updateReference({ key, raw }) {
  const current = references.splitEntries(references.readLibrary());
  const i = current.findIndex((e) => e.key === key);
  if (i < 0) throw new UserError(`@${key} isn't in the library.`);
  const [entry, ...extra] = references.splitEntries(raw ?? "");
  if (!entry || extra.length) throw new UserError("Keep exactly one BibTeX entry, starting with @ and its type, e.g. @book{key, …}.");
  if (entry.key !== key && current.some((e) => e.key === entry.key)) throw new UserError(`@${entry.key} is already used by another source.`);
  if (entry.key !== key) {
    const uses = await usesOf(key);
    if (uses.length) throw new UserError(`@${key} is cited in ${uses.join(", ")}, so its key can't change.`);
  }
  const before = references.readLibrary();
  current[i] = entry;
  references.writeEntries(current);
  try {
    references.items();
  } catch (e) {
    await writeFile(references.LIBRARY, before);
    throw new UserError(e.message);
  }
  return libraryState();
}

async function deleteReference({ key }) {
  const uses = await usesOf(key);
  if (uses.length) throw new UserError(`@${key} is cited in ${uses.join(", ")}. Remove those citations first.`);
  references.writeEntries(references.splitEntries(references.readLibrary()).filter((e) => e.key !== key));
  return libraryState();
}

async function publishLibrary() {
  if (!(await libraryChanged())) return { unchanged: true };
  await readyToPublish();
  await checkBuild(async () => {});
  return { ...(await commitAndPush([references.LIBRARY], "Update the reference library")), actions: `${site.repo}/actions` };
}

// ---- Site data for the form ----

async function meta() {
  const posts = await Promise.all(
    (await readdir(BLOG)).filter((f) => f.endsWith(".md")).map(async (f) => matter(await readFile(path.join(BLOG, f), "utf8")).data)
  );
  const projects = await Promise.all(
    (await readdir(PROJECTS)).filter((f) => f.endsWith(".md")).map(async (f) => ({
      slug: f.replace(/\.md$/, ""),
      title: matter(await readFile(path.join(PROJECTS, f), "utf8")).data.title,
    }))
  );
  const notes = existsSync(NOTES)
    ? await Promise.all(
        (await readdir(NOTES)).filter((f) => f.endsWith(".md")).map(async (f) => matter(await readFile(path.join(NOTES, f), "utf8")).data)
      )
    : [];
  const commentaryMeta = existsSync(COMMENTARY)
    ? await Promise.all(
        (await readdir(COMMENTARY)).filter((f) => f.endsWith(".md")).map(async (f) => matter(await readFile(path.join(COMMENTARY, f), "utf8")).data)
      )
    : [];
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    siteUrl: site.url,
    levels,
    statuses,
    texts: texts.texts,
    stances: annotations.stances,
    projects,
    visuals: await listVisuals(),
    tags: uniq([...posts, ...notes, ...commentaryMeta].flatMap((p) => tagTools.expand(p.tags ?? []))),
    sourceTypes: commentary.TYPES,
    noteKinds: uniq(notes.map((f) => f.kind)),
    series: uniq(posts.map((p) => p.series)),
    outline: annotations.outline(),
  };
}

// ---- HTTP ----

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const routes = {
  "GET /api/meta": () => meta(),
  "GET /api/list": async () => (await syncSite(), {
    sync: syncState(),
    texts: await listTexts(),
    drafts: await listDrafts(),
    posts: await listPosts(),
    notes: await listNotes(),
    projects: await listProjects(),
    visuals: await listVisuals(),
    commentary: await listCommentary(),
    later: await listCaptures(),
  }),
  "POST /api/capture": (b) => capture(b),
  "POST /api/capture/write": (b) => writeCapture(b),
  "POST /api/capture/delete": async (b) => (await unlink(capturePath(b.id)), { ok: true }),
  "GET /api/commentary": async (_b, q) => (await syncSite(), withLive(await openCommentary(q.get("file")))),
  "POST /api/source/lookup": async (b) => {
    try {
      return await sources.lookup(b.url, b.html ?? null);
    } catch (e) {
      throw new UserError(e.message);
    }
  },
  "POST /api/source/archive": async (b) => (await sources.archive(String(b.url ?? ""))) ?? { archived: null },
  "GET /api/note": async (_b, q) => (await syncSite(), withLive(await openNote(q.get("file")))),
  "GET /api/project": async (_b, q) => (await syncSite(), withLive(await openProject(q.get("slug")))),
  "GET /api/visual": async (_b, q) => (await syncSite(), withLive(await openVisual(q.get("slug")))),
  "POST /api/visual/check": async (b) => ({ problems: visuals.htmlProblems(String(b.html ?? "")), bytes: Buffer.byteLength(String(b.html ?? "")) }),
  "GET /api/text": async (_b, q) => (await syncSite(), withLive(await openText(q.get("name")))),
  "GET /api/draft": async (_b, q) => (await syncSite(), withLive(JSON.parse(await readFile(draftPath(q.get("id")), "utf8")))),
  "GET /api/post": async (_b, q) => (await syncSite(), withLive(await openPost(q.get("file")))),
  "POST /api/draft": (b) => saveDraft(b),
  "POST /api/draft/delete": async (b) => (await unlink(draftPath(b.id)).catch(() => {}), { ok: true }),
  "POST /api/passage": async (b) => {
    const passage = annotations.resolve(b.ref);
    let problem = null;
    if (b.phrase !== undefined) {
      try {
        annotations.check(b.ref, b.phrase, b.stance || "note");
      } catch (e) {
        problem = e.message.split(". The passage reads")[0];
      }
    }
    return { label: passage.label, heading: passage.heading, paragraphs: passage.paragraphs, problem };
  },
  "POST /api/search": async (b) => annotations.search(b.source, b.query),
  "POST /api/publish": (b) => publish(b),
  "POST /api/image": (b) => saveImage(b),
  "GET /api/references": () => libraryState(),
  "POST /api/references/add": (b) => addReferences(b),
  "POST /api/references/update": (b) => updateReference(b),
  "POST /api/references/delete": (b) => deleteReference(b),
  "POST /api/references/publish": () => publishLibrary(),
  "POST /api/references/preview": async (b) => references.preview(b.key, b.locator),
  "GET /api/xref/targets": async () =>
    [...xref.targets().values()].map(({ slug, kind, title, draft }) => ({ slug, kind, title, draft })).sort((a, b) => a.title.localeCompare(b.title)),
  "POST /api/xref/target": async (b) => {
    const t = xref.targets().get(b.slug);
    if (!t) throw new UserError("That post or project doesn't exist.");
    return { slug: t.slug, title: t.title, kind: t.kind, draft: t.draft, paragraphs: t.paragraphs };
  },
  "POST /api/xref/check": async (b) => {
    try {
      xref.resolve(b.slug, b.quote);
      return { problem: null };
    } catch (e) {
      return { problem: e.message.charAt(0).toUpperCase() + e.message.slice(1) };
    }
  },
};

const vite = await createViteServer({
  root: path.join(ROOT, "editor"),
  server: { middlewareMode: true, hmr: false },
  appType: "spa",
  logLevel: "warn",
});

const server = createHttpServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  if (url.pathname === "/site.css") {
    res.setHeader("content-type", "text/css");
    return res.end(await readFile(path.join(ROOT, "src/css/style.css")));
  }
  if (url.pathname.startsWith("/images/")) {
    const file = path.join(IMAGES, decodeURIComponent(url.pathname.slice("/images/".length)));
    if (!file.startsWith(IMAGES + path.sep) || !existsSync(file)) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    const ext = path.extname(file).slice(1);
    res.setHeader("content-type", ext === "jpg" ? "image/jpeg" : `image/${ext}`);
    return res.end(await readFile(file));
  }
  const poster = url.pathname.match(/^\/visual-poster\/([a-z0-9][a-z0-9-]*)\.png$/);
  if (poster) {
    const file = visuals.posterPath(poster[1]);
    if (!existsSync(file)) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.setHeader("content-type", "image/png");
    return res.end(await readFile(file));
  }
  if (!url.pathname.startsWith("/api/")) return vite.middlewares(req, res);

  // Only the editor page itself may call the API. The Host check stops DNS
  // rebinding; the Origin and Sec-Fetch-Site checks stop other sites' pages.
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }
  const fetchSite = req.headers["sec-fetch-site"];
  const fromExtension = origin === EXTENSION_ORIGIN && EXTENSION_ROUTES.has(`${req.method} ${url.pathname}`);
  if (!fromExtension && ((origin && origin !== ORIGIN && origin !== `http://localhost:${PORT}`) || (fetchSite && fetchSite !== "same-origin"))) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }
  const route = routes[`${req.method} ${url.pathname}`];
  res.setHeader("content-type", "application/json");
  if (!route) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: "Not found" }));
  }
  try {
    const body = req.method === "POST" ? await readJson(req) : {};
    res.end(JSON.stringify(await route(body, url.searchParams)));
  } catch (e) {
    res.statusCode = e instanceof UserError ? 400 : 500;
    res.end(JSON.stringify({ error: e.message }));
    if (!(e instanceof UserError)) console.error(e);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Writing editor: ${ORIGIN}/`);
  console.log("Drafts are saved privately in drafts/ and never committed. Press Ctrl+C to stop.");
});

