// The whole site as a graph: posts, projects, tags and annotated passages are
// nodes; cross-links, tags, project links and annotations are the lines between them.
import { readFileSync } from "node:fs";
import { linksIn } from "./xref.js";
import * as tags from "./tags.js";

/**
 * @param {{ posts: any[], projects: any[], passages: any[], levels: { slug: string, name: string }[] }} site
 * @returns {{ nodes: object[], links: object[] }}
 */
export function build({ posts, projects, passages, levels }) {
  const nodes = new Map();
  const links = new Map();
  const add = (id, node) => nodes.has(id) || nodes.set(id, { id, ...node });
  const link = (source, target, kind) => {
    if (source === target || !nodes.has(source) || !nodes.has(target)) return;
    const key = [source, target].sort().join("|") + `|${kind}`;
    if (!links.has(key)) links.set(key, { source, target, kind });
  };
  const levelName = (slug) => levels.find((l) => l.slug === slug)?.name ?? slug;

  for (const p of posts) add(p.url, { kind: "post", title: p.data.title, url: p.url, level: levelName(p.data.level) });
  for (const p of projects) add(p.url, { kind: "project", title: p.data.title, url: p.url });
  for (const t of tags.list(posts)) add(`tag:${t.name}`, { kind: "tag", title: t.name.replace(/\//g, " / "), url: t.url });
  for (const a of passages) add(a.url, { kind: "passage", title: a.label, url: a.url });

  const bySlug = new Map([...posts, ...projects].map((p) => [p.fileSlug.replace(/^\d{4}-\d{2}-\d{2}-/, ""), p.url]));
  for (const item of [...posts, ...projects]) {
    for (const slug of linksIn(readFileSync(item.inputPath, "utf8"))) link(item.url, bySlug.get(slug), "xref");
  }
  for (const p of posts) {
    if (p.data.project) link(p.url, projects.find((x) => x.fileSlug === p.data.project)?.url, "project");
    // A post joins its most specific tags; each tag joins the one above it.
    for (const t of p.data.tags ?? []) link(p.url, `tag:${t}`, "tag");
  }
  for (const id of nodes.keys()) {
    if (id.startsWith("tag:") && id.includes("/")) link(id, id.slice(0, id.lastIndexOf("/")), "tag");
  }
  for (const a of passages) for (const e of a.entries) link(e.post.url, a.url, "annotation");

  const degree = new Map();
  for (const l of links.values()) for (const end of [l.source, l.target]) degree.set(end, (degree.get(end) ?? 0) + 1);
  return {
    nodes: [...nodes.values()].map((n) => ({ ...n, degree: degree.get(n.id) ?? 0 })),
    links: [...links.values()],
  };
}
