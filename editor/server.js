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
import matter from "gray-matter";
import { createServer as createViteServer } from "vite";
import * as annotations from "../lib/annotations.js";
import site from "../src/_data/site.js";
import categories from "../src/_data/categories.js";
import levels from "../src/_data/levels.js";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG = path.join(ROOT, "src/blog");
const PROJECTS = path.join(ROOT, "src/projects");
const DRAFTS = path.join(ROOT, "drafts");
const PORT = Number(process.env.PORT) || 8081;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const POST_FILE = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/;
const slugify = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

class UserError extends Error {}

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
    .map((d) => ({ id: d.id, title: d.meta?.title || "Untitled", updated: d.updated, file: d.file ?? null }))
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
  return { id, file, meta, body, updated: null };
}

async function saveDraft({ id, file, meta, body }) {
  await mkdir(DRAFTS, { recursive: true });
  const draftId = id || `${slugify(meta?.title || "untitled") || "untitled"}-${Date.now().toString(36)}`;
  const draft = { id: draftId, file: file ?? null, meta, body, updated: new Date().toISOString() };
  await writeFile(draftPath(draftId), JSON.stringify(draft, null, 2));
  return draft;
}

// ---- Front matter ----

const FIELD_ORDER = ["title", "description", "category", "level", "tags", "project", "series"];
const yamlString = (s) => (/^[A-Za-z0-9][\w .,'’()?!-]*$/.test(s) && !/: /.test(s) ? s : JSON.stringify(s));

function frontMatter(meta) {
  const lines = [];
  const extra = Object.keys(meta).filter((k) => !FIELD_ORDER.includes(k) && !["date", "slug", "draft"].includes(k));
  for (const key of [...FIELD_ORDER, ...extra]) {
    const v = meta[key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)) lines.push(`${key}: [${v.map((t) => yamlString(String(t))).join(", ")}]`);
    else if (typeof v === "string") lines.push(`${key}: ${yamlString(v)}`);
    else lines.push(`${key}: ${JSON.stringify(v)}`);
  }
  return `---\n${lines.join("\n")}\n---\n\n`;
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
  const start = lines.findIndex((l) => /Post |annotation|Error/.test(l));
  const useful = (start >= 0 ? lines.slice(start) : lines).filter((l) => !/^\s+at |Original error stack|Eleventy Fatal Error/.test(l));
  // Eleventy repeats the same error several times; show each line once.
  return [...new Set(useful)].slice(0, 8).join("\n") || e.message;
}

async function publish({ id, file, meta, body }) {
  checkMeta(meta);
  const branch = await git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") throw new UserError(`The repository is on the branch “${branch}”. Switch to main to publish.`);

  try {
    await git("pull", "--rebase", "--autostash", "--quiet");
  } catch (e) {
    throw new UserError(`Couldn't fetch the latest version of the site from GitHub: ${e.stderr || e.message}`);
  }

  const slug = slugify(meta.slug || meta.title);
  const target = file ?? `${meta.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date) ? meta.date : today()}-${slug}.md`;
  const full = postPath(target);
  if (!file && existsSync(full)) throw new UserError(`A post called ${target} already exists. Change the address under More details.`);

  const previous = existsSync(full) ? await readFile(full, "utf8") : null;
  const { date, slug: _slug, draft, ...fields } = meta;
  const content = frontMatter(fields) + body.trim() + "\n";
  await writeFile(full, content);

  try {
    await run("npx", ["eleventy", "--dryrun", "--quiet"], { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    if (previous === null) await unlink(full);
    else await writeFile(full, previous);
    throw new UserError(`The site wouldn't build with this post, so nothing was published.\n\n${buildError(e)}`);
  }

  const rel = path.relative(ROOT, full);
  await git("add", "--", rel);
  const verb = file ? "Update" : "Publish";
  try {
    await git("commit", "-m", `${verb} “${meta.title.trim()}”`, "--", rel);
  } catch (e) {
    if (/nothing to commit|no changes added/.test(`${e.stdout}${e.stderr}`)) {
      if (id) await unlink(draftPath(id)).catch(() => {});
      return { file: target, url: `${site.url}/blog/${target.match(POST_FILE)[2]}/`, unchanged: true };
    }
    throw new UserError(`Couldn't commit the post: ${e.stderr || e.message}`);
  }
  if (id) await unlink(draftPath(id)).catch(() => {});

  let pushed = true;
  let pushError = "";
  try {
    await git("push", "--quiet");
  } catch (e) {
    pushed = false;
    pushError = (e.stderr || e.message).trim();
  }
  return {
    file: target,
    url: `${site.url}/blog/${target.match(POST_FILE)[2]}/`,
    actions: `${site.repo}/actions`,
    pushed,
    pushError,
  };
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
  "GET /api/list": async () => ({ drafts: await listDrafts(), posts: await listPosts() }),
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

