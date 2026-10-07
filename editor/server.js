// Local writing editor: `npm run write`, then open the printed address.
// Serves the editor UI (through Vite) and a small JSON API that reads and writes
// files in this repository. It listens on 127.0.0.1 only and rejects requests
// from other origins, because anything that can reach it can commit to the site.
import { createServer as createHttpServer } from "node:http";
import { readFile, writeFile, readdir, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
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
import site from "../src/_data/site.js";
import categories from "../src/_data/categories.js";
import levels from "../src/_data/levels.js";
import statuses from "../src/_data/statuses.js";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG = path.join(ROOT, "src/blog");
const PROJECTS = path.join(ROOT, "src/projects");
const DRAFTS = path.join(ROOT, "drafts");
const IMAGES = path.join(ROOT, "src/images");
const PORT = Number(process.env.PORT) || 8081;
const ELEVENTY = path.join(ROOT, "node_modules/@11ty/eleventy/cmd.cjs");
const ORIGIN = `http://127.0.0.1:${PORT}`;

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
      return { file, title: data.title ?? file, date: file.match(POST_FILE)[1], draft: !!data.draft };
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
      title: d.kind === "text" ? texts.texts.find((t) => t.name === d.file)?.label ?? d.file : d.meta?.title || "Untitled",
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

// ---- Site text ----

async function openText(name) {
  if (!texts.texts.some((t) => t.name === name)) throw new UserError("There's no site text with that name.");
  const id = `text-${name}`;
  const p = draftPath(id);
  if (existsSync(p)) return JSON.parse(await readFile(p, "utf8"));
  return { id, kind: "text", file: name, meta: {}, body: texts.read(name), updated: null };
}

async function saveDraft({ id, kind, file, meta, body }) {
  await mkdir(DRAFTS, { recursive: true });
  const draftId = id || `${slugify(meta?.title || "untitled") || "untitled"}-${Date.now().toString(36)}`;
  const draft = { id: draftId, kind: kind ?? "post", file: file ?? null, meta, body, updated: new Date().toISOString() };
  await writeFile(draftPath(draftId), JSON.stringify(draft, null, 2));
  return draft;
}

// ---- Front matter ----

const FIELD_ORDER = ["title", "description", "category", "level", "tags", "project", "series", "status", "summary", "links"];
const yamlString = (s) => (/^[A-Za-z0-9][\w .,'’()?!-]*$/.test(s) && !/: /.test(s) ? s : JSON.stringify(s));

function frontMatter(meta) {
  const lines = [];
  const extra = Object.keys(meta).filter((k) => !FIELD_ORDER.includes(k) && !["date", "slug", "draft"].includes(k));
  for (const key of [...FIELD_ORDER, ...extra]) {
    const v = meta[key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v) && typeof v[0] === "object") {
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
  if (!categories.some((c) => c.slug === meta.category)) problems.push("Choose a category.");
  if (!levels.some((l) => l.slug === meta.level)) problems.push("Choose a research level.");
  if (!slugify(meta.slug || meta.title || "")) problems.push("The address can't be empty.");
  if (problems.length) throw new UserError(problems.join(" "));
}

// ---- Publishing ----

const git = async (...args) => (await run("git", args, { cwd: ROOT })).stdout.trim();

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
  const { date, slug: _slug, draft, ...fields } = meta;
  return {
    full,
    content: frontMatter(fields) + body.trim() + "\n",
    message: `${file ? "Update" : "Publish"} “${meta.title.trim()}”`,
    url: `${site.url}/blog/${target.match(POST_FILE)[2]}/`,
    file: target,
    isNew: !file,
  };
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
  const p = plan(doc);
  await readyToPublish();
  if (p.isNew && existsSync(p.full)) throw new UserError(`${path.relative(ROOT, p.full)} already exists. Change the address under More details.`);

  const previous = existsSync(p.full) ? await readFile(p.full, "utf8") : null;
  await mkdir(path.dirname(p.full), { recursive: true });
  await writeFile(p.full, p.content);
  await checkBuild(async () => (previous === null ? unlink(p.full) : writeFile(p.full, previous)));

  const paths = [p.full, ...imagesIn(p.content)];
  if (await libraryChanged()) paths.push(references.LIBRARY);
  const result = await commitAndPush(paths, p.message);
  if (doc.id) await unlink(draftPath(doc.id)).catch(() => {});
  return { ...result, url: p.url, file: p.file, actions: `${site.repo}/actions` };
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
  for (const dir of [BLOG, PROJECTS]) {
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
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    siteUrl: site.url,
    categories,
    levels,
    statuses,
    texts: texts.texts,
    stances: annotations.stances,
    projects,
    tags: uniq(posts.flatMap((p) => p.tags ?? [])),
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
  "GET /api/list": async () => ({ drafts: await listDrafts(), posts: await listPosts(), projects: await listProjects() }),
  "GET /api/project": async (_b, q) => openProject(q.get("slug")),
  "GET /api/text": async (_b, q) => openText(q.get("name")),
  "GET /api/draft": async (_b, q) => JSON.parse(await readFile(draftPath(q.get("id")), "utf8")),
  "GET /api/post": async (_b, q) => openPost(q.get("file")),
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
  if ((origin && origin !== ORIGIN && origin !== `http://localhost:${PORT}`) || (fetchSite && fetchSite !== "same-origin")) {
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

