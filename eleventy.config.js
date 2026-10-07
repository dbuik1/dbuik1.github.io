import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import site from "./src/_data/site.js";
import categories from "./src/_data/categories.js";
import levels from "./src/_data/levels.js";
import statuses from "./src/_data/statuses.js";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import * as annotations from "./lib/annotations.js";
import * as references from "./lib/references.js";
import * as texts from "./lib/texts.js";
import * as xref from "./lib/xref.js";
import { isPreview } from "./lib/preview.js";
import { readFileSync } from "node:fs";
import { configure as configureMarkdown } from "./lib/markdown.js";

const categorySlugs = categories.map((c) => c.slug);
const levelSlugs = levels.map((l) => l.slug);
const statusSlugs = statuses.map((s) => s.slug);

function checkPost(item) {
  const file = item.inputPath;
  const { title, category, level, tags } = item.data;
  const problems = [];
  if (!title) problems.push("missing `title`");
  if (!categorySlugs.includes(category)) {
    problems.push(`\`category\` is "${category ?? ""}", expected one of: ${categorySlugs.join(", ")}`);
  }
  if (!levelSlugs.includes(level)) {
    problems.push(`\`level\` is "${level ?? ""}", expected one of: ${levelSlugs.join(", ")}`);
  }
  if (tags !== undefined && !Array.isArray(tags)) problems.push("`tags` must be a list, e.g. [faith, reading]");
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
    return posts;
  });
  eleventyConfig.addCollection("projects", allProjects);
  // slug → posts that link to it with [[slug]], newest first.
  eleventyConfig.addCollection("backlinks", (api) => {
    const map = {};
    for (const post of allPosts(api)) {
      for (const slug of new Set(xref.linksIn(readFileSync(post.inputPath, "utf8")))) (map[slug] ??= []).push(post);
    }
    return map;
  });
  for (const slug of categorySlugs) {
    eleventyConfig.addCollection(`category-${slug}`, (api) =>
      allPosts(api).filter((p) => p.data.category === slug)
    );
  }
  eleventyConfig.addCollection("tagList", (api) => {
    const counts = new Map();
    for (const post of allPosts(api)) {
      for (const tag of post.data.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  });

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
  eleventyConfig.addGlobalData("stances", annotations.stances);
  eleventyConfig.addFilter("stanceName", annotations.stanceName);

  eleventyConfig.addGlobalData("year", () => new Date().getFullYear());

  eleventyConfig.addFilter("readableDate", (date) =>
    new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  );
  eleventyConfig.addFilter("isoDate", (date) => new Date(date).toISOString().slice(0, 10));
  eleventyConfig.addFilter("head", (array, n) => array.slice(0, n));
  eleventyConfig.addFilter("byField", (array, field, value) => array.filter((item) => item[field] === value));
  eleventyConfig.addFilter("withTag", (posts, tag) => posts.filter((p) => (p.data.tags ?? []).includes(tag)));
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
    metadata: feedMeta("Everything"),
  });
  for (const c of categories) {
    eleventyConfig.addPlugin(feedPlugin, {
      type: "atom",
      outputPath: `/blog/${c.slug}/feed.xml`,
      collection: { name: `category-${c.slug}`, limit: 20 },
      metadata: { ...feedMeta(c.name), title: `${site.title}: ${c.name}` },
    });
  }

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
