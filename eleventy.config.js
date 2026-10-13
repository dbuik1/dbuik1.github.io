import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import site from "./src/_data/site.js";
import levels from "./src/_data/levels.js";
import statuses from "./src/_data/statuses.js";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import * as annotations from "./lib/annotations.js";
import * as references from "./lib/references.js";
import * as texts from "./lib/texts.js";
import * as xref from "./lib/xref.js";
import * as tags from "./lib/tags.js";
import * as graph from "./lib/graph.js";
import * as notes from "./lib/notes.js";
import * as seo from "./lib/seo.js";
import * as cards from "./lib/cards.js";
import * as visuals from "./lib/visuals.js";
import * as commentary from "./lib/commentary.js";
import { isPreview } from "./lib/preview.js";
import { readFileSync } from "node:fs";
import { configure as configureMarkdown } from "./lib/markdown.js";

const levelSlugs = levels.map((l) => l.slug);
const statusSlugs = statuses.map((s) => s.slug);

function checkPost(item) {
  const file = item.inputPath;
  const { title, level, history } = item.data;
  const problems = [];
  if (!title) problems.push("missing `title`");
  if (!levelSlugs.includes(level)) {
    problems.push(`\`level\` is "${level ?? ""}", expected one of: ${levelSlugs.join(", ")}`);
  }
  problems.push(...tags.problems(item.data.tags));
  if (history !== undefined && !(Array.isArray(history) && history.every((h) => levelSlugs.includes(h?.level) && !isNaN(new Date(h?.date))))) {
    problems.push("`history` must be a list of { level, date } entries");
  }
  if (problems.length) throw new Error(`Post ${file}: ${problems.join("; ")}`);
}

function checkProject(item) {
  const problems = [];
  if (!item.data.title) problems.push("missing `title`");
  if (!statusSlugs.includes(item.data.status)) {
    problems.push(`\`status\` is "${item.data.status ?? ""}", expected one of: ${statusSlugs.join(", ")}`);
  }
  if (problems.length) throw new Error(`Project ${item.inputPath}: ${problems.join("; ")}`);
}

const projectsGlob = "src/projects/*.md";
const allProjects = (api) => {
  const projects = api.getFilteredByGlob(projectsGlob);
  projects.forEach(checkProject);
  return projects.sort((a, b) => a.data.title.localeCompare(b.data.title));
};

const notesGlob = "src/notes/*.md";
const allNotes = (api) => {
  const items = api.getFilteredByGlob(notesGlob);
  for (const item of items) {
    const problems = notes.problems(item.data);
    if (problems.length) throw new Error(`Note ${item.inputPath}: ${problems.join("; ")}`);
  }
  return items.reverse();
};

const visualsGlob = "src/visuals/*/index.md";
const allVisuals = (api) => {
  const items = api.getFilteredByGlob(visualsGlob);
  for (const item of items) {
    const problems = visuals.check(item.fileSlug, item.data);
    if (problems.length) throw new Error(`Visual src/visuals/${item.fileSlug}/: ${problems.join("; ")}`);
  }
  return items.sort((a, b) => b.date - a.date);
};

const commentaryGlob = "src/commentary/*.md";
const allCommentary = (api) => {
  const items = api.getFilteredByGlob(commentaryGlob);
  for (const item of items) {
    const body = readFileSync(item.inputPath, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const problems = commentary.problems(item.data, body);
    if (problems.length) throw new Error(`Commentary ${item.inputPath}: ${problems.join("; ")}`);
  }
  return items.reverse();
};

const postsGlob = "src/blog/*.md";
const allPosts = (api) => {
  const posts = api.getFilteredByGlob(postsGlob);
  posts.forEach(checkPost);
  return posts.reverse();
};

export default function (eleventyConfig) {
  // Copied to the site root unchanged.
  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addPassthroughCopy("src/app-ads.txt");
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  // The force layout behind the graph page, from npm.
  for (const name of ["d3-dispatch", "d3-quadtree", "d3-timer", "d3-force"]) {
    eleventyConfig.addPassthroughCopy({ [`node_modules/${name}/dist/${name}.min.js`]: `js/vendor/${name}.min.js` });
  }

  // Visuals: the HTML file is served as it is, with the frame's security policy
  // added after the build; posters and any data files beside it are copied.
  eleventyConfig.ignores.add("src/visuals/*/*.html");
  eleventyConfig.addPassthroughCopy("src/visuals/*/*.{png,jpg,jpeg,webp,svg,json,csv,txt,js,css,glb,gltf,bin,wasm}");
  for (const [weight, style] of [["400", "normal"], ["400", "italic"], ["500", "normal"], ["700", "normal"]]) {
    const name = `alegreya-sans-latin-${weight}-${style}.woff2`;
    eleventyConfig.addPassthroughCopy({ [`node_modules/@fontsource/alegreya-sans/files/${name}`]: `fonts/${name}` });
  }
  eleventyConfig.addWatchTarget("./src/visuals/");

  eleventyConfig.addWatchTarget("./lib/");
  eleventyConfig.addWatchTarget("./texts/");
  eleventyConfig.addWatchTarget("./references/");
  eleventyConfig.addWatchTarget("./src/_text/");

  // Site text is read by the `siteText` filter, not built as pages.
  eleventyConfig.ignores.add("src/_text/**");
  eleventyConfig.addFilter("siteText", (name) => texts.render(name));

  // Figures from lone images, and footnotes.
  eleventyConfig.amendLibrary("md", configureMarkdown);

  // Citations become footnotes with a bibliography; see lib/references.js.
  eleventyConfig.addPreprocessor("citations", "md", (data, content) => {
    try {
      return references.cite(content);
    } catch (e) {
      throw new Error(`${data.page.inputPath}: ${e.message}`);
    }
  });
  eleventyConfig.addTransform("bibliography", function (content) {
    return (this.page.outputPath || "").endsWith(".html") ? references.placeBibliography(content) : content;
  });

  // Every <img> gets resized copies in modern formats, with its size set to avoid layout shift.
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["avif", "webp", "auto"],
    widths: [640, 1280, "auto"],
    htmlOptions: { imgAttributes: { loading: "lazy", decoding: "async", sizes: "(min-width: 42rem) 42rem, 100vw" } },
  });

  // Posts marked `draft: true` appear under `npm start` but never in the published site.
  eleventyConfig.addPreprocessor("drafts", "*", (data) => {
    if (data.draft && !isPreview()) return false;
  });

  eleventyConfig.addCollection("posts", (api) => {
    const posts = allPosts(api);
    const projectSlugs = allProjects(api).map((p) => p.fileSlug);
    for (const post of posts) {
      const project = post.data.project;
      if (project !== undefined && !projectSlugs.includes(project)) {
        throw new Error(
          `Post ${post.inputPath}: \`project\` is "${project}", expected the file name of a project in src/projects/ (without .md): ${projectSlugs.join(", ") || "none yet"}`
        );
      }
    }
    visuals.checkUses([...posts, ...allProjects(api), ...allNotes(api), ...allCommentary(api)], new Set(allVisuals(api).map((v) => v.fileSlug)));
    return posts;
  });
  eleventyConfig.addCollection("projects", allProjects);
  eleventyConfig.addCollection("visuals", allVisuals);
  // slug → posts, projects and notes that show the visual.
  eleventyConfig.addCollection("visualUses", (api) => visuals.uses([...allPosts(api), ...allProjects(api), ...allNotes(api), ...allCommentary(api)]));
  eleventyConfig.addCollection("notes", allNotes);
  eleventyConfig.addCollection("noteKinds", (api) => notes.kinds(allNotes(api)));
  eleventyConfig.addCollection("commentary", allCommentary);
  // slug → posts, projects and notes that link to it with [[slug]], newest first.
  eleventyConfig.addCollection("backlinks", (api) => {
    const map = {};
    for (const post of [...allPosts(api), ...allProjects(api), ...allNotes(api), ...allVisuals(api), ...allCommentary(api)]) {
      for (const slug of new Set(xref.linksIn(readFileSync(post.inputPath, "utf8")))) (map[slug] ??= []).push(post);
    }
    return map;
  });
  for (const slug of levelSlugs) {
    eleventyConfig.addCollection(`level-${slug}`, (api) => allPosts(api).filter((p) => p.data.level === slug));
  }
  eleventyConfig.addCollection("tagList", (api) => tags.list([...allPosts(api), ...allNotes(api), ...allVisuals(api), ...allCommentary(api)]));

  // {% visual "slug" %} or {% visual "slug", "Your caption" %}: the visual with a Run button.
  let visualsBySlug = new Map();
  eleventyConfig.addCollection("visualsBySlug", (api) => (visualsBySlug = new Map(allVisuals(api).map((v) => [v.fileSlug, v]))));
  const visualFigure = (slug, options) => {
    const v = visualsBySlug.get(slug);
    if (!v) throw new Error(`there's no visual called “${slug}” (or it is still a draft)`);
    return visuals.figure({ slug, title: v.data.title, description: v.data.description }, options);
  };
  eleventyConfig.addShortcode("visual", function (slug, caption) {
    try {
      return visualFigure(slug, { caption });
    } catch (e) {
      throw new Error(`${this.page.inputPath}: ${e.message}`);
    }
  });
  eleventyConfig.addFilter("visualFigure", (slug, live) => visualFigure(slug, { live }));

  // Commentary quotes its source in place: {% excerpt %}words{% endexcerpt %} and
  // {% moment "12:34", "13:10" %}words{% endmoment %}; see lib/commentary.js.
  eleventyConfig.addPairedShortcode("excerpt", function (content) {
    try {
      return commentary.excerpt(content, this.ctx?.source);
    } catch (e) {
      throw new Error(`${this.page.inputPath}: ${e.message}`);
    }
  });
  eleventyConfig.addPairedShortcode("moment", function (content, start, end) {
    try {
      return commentary.moment(content, start, end, this.ctx?.source);
    } catch (e) {
      throw new Error(`${this.page.inputPath}: ${e.message}`);
    }
  });
  eleventyConfig.addFilter("sourceType", commentary.typeName);
  eleventyConfig.addFilter("sourcePlayer", (source) => commentary.player(source));
  eleventyConfig.addFilter("sourceText", (text) =>
    String(text ?? "")
      .trim()
      .split(/\n\s*\n/)
      .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
      .join("")
  );
  // A commentary's own words: the page without its quotes or the card describing the source.
  eleventyConfig.addFilter("ownWords", (html) =>
    String(html)
      .replace(/<aside class="source-card[\s\S]*?<\/aside>/g, "")
      .replace(/<figure class="(?:excerpt|moment)">[\s\S]*?<\/figure>/g, "")
  );

  // {% annotate "wcf 1.4", "exact phrase", "qualified" %}Your note{% endannotate %}
  eleventyConfig.addPairedShortcode("annotate", function (note, ref, phrase, stance) {
    try {
      return annotations.render(note, ref, phrase, stance, this.page.url);
    } catch (e) {
      throw new Error(`Post ${this.page.inputPath}: annotation ${e.message}`);
    }
  });
  eleventyConfig.addTransform("annotations", function (content) {
    return (this.page.outputPath || "").endsWith(".html") ? annotations.linkInlinePhrases(content) : content;
  });
  eleventyConfig.addCollection("annotations", (api) => annotations.collect(allPosts(api)));
  eleventyConfig.addCollection("graph", (api) =>
    graph.build({
      posts: allPosts(api),
      projects: allProjects(api),
      notes: allNotes(api),
      visuals: allVisuals(api),
      commentary: allCommentary(api),
      passages: annotations.collect(allPosts(api)),
      levels,
    })
  );
  eleventyConfig.addGlobalData("stances", annotations.stances);
  eleventyConfig.addFilter("stanceName", annotations.stanceName);

  // Search engines and AI crawlers: descriptions, structured data, sitemap and share images.
  eleventyConfig.addFilter("excerpt", seo.excerpt);
  eleventyConfig.addFilter("clip", (text, max) => seo.clip(text, max));
  eleventyConfig.addFilter("plain", seo.plain);
  eleventyConfig.addFilter("pageKind", seo.kind);
  eleventyConfig.addFilter("cardUrl", seo.cardUrl);
  eleventyConfig.addFilter("modified", seo.modified);
  eleventyConfig.addFilter("structuredData", seo.structuredData);
  eleventyConfig.addFilter("sitemapEntries", seo.sitemap);
  eleventyConfig.addFilter("wordCount", (html) => seo.plain(html).split(" ").filter(Boolean).length);
  eleventyConfig.addFilter("isoDateTime", (date) => new Date(date).toISOString());
  let shareCards = [];
  let visualSlugs = [];
  eleventyConfig.addCollection("visualFiles", (api) => (visualSlugs = allVisuals(api).map((v) => v.fileSlug)));
  eleventyConfig.addCollection("shareCards", (api) => {
    const levelName = Object.fromEntries(levels.map((l) => [l.slug, l.name]));
    const statusName = Object.fromEntries(statuses.map((s) => [s.slug, s.name]));
    const intro = seo.excerpt(texts.render("home-intro"));
    shareCards = [
      { url: "/", title: intro || site.title, label: "" },
      ...allPosts(api).map((p) => ({ url: p.url, title: p.data.title, label: levelName[p.data.level] })),
      ...allProjects(api).map((p) => ({ url: p.url, title: p.data.title, label: ["Project", statusName[p.data.status]].filter(Boolean).join(" · ") })),
      ...allNotes(api).map((f) => ({ url: f.url, title: f.data.title, label: ["Note", f.data.kind].filter(Boolean).join(" · "), credit: f.data.by, quote: Boolean(f.data.by) })),
      ...allVisuals(api).map((v) => ({ url: v.url, title: v.data.title, label: "Visual" })),
      ...allCommentary(api).map((c) => ({ url: c.url, title: c.data.title, label: `Commentary · ${commentary.typeName(c.data.source.type)}` })),
    ].filter((c) => c.url);
    return shareCards;
  });
  eleventyConfig.on("eleventy.after", async ({ directories }) => {
    // A dry run (the editor's build check) writes nothing.
    if (process.argv.includes("--dryrun")) return;
    visuals.write(directories.output, visualSlugs);
    await cards.write(directories.output, shareCards);
  });

  eleventyConfig.addGlobalData("year", () => new Date().getFullYear());

  eleventyConfig.addFilter("readableDate", (date) =>
    new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  );
  eleventyConfig.addFilter("isoDate", (date) => new Date(date).toISOString().slice(0, 10));
  eleventyConfig.addFilter("head", (array, n) => array.slice(0, n));
  eleventyConfig.addFilter("byField", (array, field, value) => array.filter((item) => item[field] === value));
  eleventyConfig.addFilter("withTag", tags.withTag);
  eleventyConfig.addFilter("tagUrl", tags.url);
  eleventyConfig.addFilter("byKind", (items, kind) => items.filter((f) => f.data.kind === kind));
  eleventyConfig.addFilter("noteSource", function (text) {
    try {
      return notes.source(text);
    } catch (e) {
      throw new Error(`Note ${this.page?.inputPath ?? ""}: ${e.message}`);
    }
  });
  eleventyConfig.addFilter("linkedTo", (links, id) =>
    links.filter((l) => l.source === id || l.target === id).map((l) => (l.source === id ? l.target : l.source))
  );
  eleventyConfig.addFilter("ancestry", tags.ancestry);
  eleventyConfig.addFilter("tagLeaf", tags.leaf);
  eleventyConfig.addFilter("latest", (history) => (Array.isArray(history) && history.length ? history.at(-1) : null));
  eleventyConfig.addFilter("byFileSlug", (items, slug) => items.filter((i) => i.fileSlug === slug));
  eleventyConfig.addFilter("byStatus", (projects, status) => projects.filter((p) => p.data.status === status));
  eleventyConfig.addFilter("byProject", (posts, slug) => posts.filter((p) => p.data.project === slug));
  eleventyConfig.addFilter("inSeries", (posts, series) => posts.filter((p) => p.data.series === series).reverse());

  const feedMeta = (subtitle) => ({
    language: site.language,
    title: site.title,
    subtitle,
    base: site.url,
    author: { name: site.author },
  });
  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/feed.xml",
    collection: { name: "posts", limit: 20 },
    metadata: feedMeta("All writing"),
  });
  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/notes/feed.xml",
    collection: { name: "notes", limit: 50 },
    metadata: { ...feedMeta("Notes"), title: `${site.title}: Notes` },
  });
  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/commentary/feed.xml",
    collection: { name: "commentary", limit: 50 },
    metadata: { ...feedMeta("Commentary"), title: `${site.title}: Commentary` },
  });
  for (const l of levels) {
    eleventyConfig.addPlugin(feedPlugin, {
      type: "atom",
      outputPath: `/blog/${l.slug}/feed.xml`,
      collection: { name: `level-${l.slug}`, limit: 20 },
      metadata: { ...feedMeta(l.name), title: `${site.title}: ${l.name}` },
    });
  }

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
