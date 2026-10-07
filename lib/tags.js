// Tags can be nested with slashes: theology/church/elders. A post tagged with a
// nested tag also belongs to every tag above it, so /tags/theology/ lists
// everything under theology.
import slugifyText from "@sindresorhus/slugify";

const SEGMENT = /^[^/]+$/;

/** Problems with a post's tags, as readable sentences. */
export function problems(tags) {
  if (tags === undefined) return [];
  if (!Array.isArray(tags)) return ["`tags` must be a list, e.g. [faith, theology/church]"];
  return tags
    .filter((t) => typeof t !== "string" || !String(t).split("/").every((s) => SEGMENT.test(s) && s.trim() === s && s))
    .map((t) => `the tag “${t}” has an empty part or spaces around a slash`);
}

/** theology/church → [theology, theology/church] */
export const ancestry = (tag) => tag.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/"));

/** Where a tag's page is: theology/church → /tags/theology/church/ */
export const url = (tag) => `/tags/${tag.split("/").map((s) => slugifyText(s)).join("/")}/`;

/** The last part of a tag, as shown under its parent. */
export const leaf = (tag) => tag.split("/").pop();

/** Every tag a post belongs to, including the ones above its nested tags. */
export const expand = (tags = []) => [...new Set(tags.flatMap(ancestry))];

/**
 * Every tag in use, each with its parent, children and post count, sorted so
 * parents come before their children.
 */
export function list(posts) {
  const counts = new Map();
  for (const post of posts) for (const tag of expand(post.data.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  return names.map((name) => {
    const parts = name.split("/");
    return {
      name,
      leaf: parts.at(-1),
      depth: parts.length - 1,
      parent: parts.length > 1 ? parts.slice(0, -1).join("/") : null,
      children: names.filter((n) => n.startsWith(`${name}/`) && n.split("/").length === parts.length + 1),
      count: counts.get(name),
      url: url(name),
    };
  });
}

/** Posts with this tag or any tag below it. */
export const withTag = (posts, tag) => posts.filter((p) => expand(p.data.tags).includes(tag));
