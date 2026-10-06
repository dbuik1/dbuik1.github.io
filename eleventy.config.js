import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import site from "./src/_data/site.js";
import categories from "./src/_data/categories.js";
import levels from "./src/_data/levels.js";

const isDev = process.env.ELEVENTY_ENV === "development";
const categorySlugs = categories.map((c) => c.slug);
const levelSlugs = levels.map((l) => l.slug);

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

  // Posts marked `draft: true` appear under `npm start` but never in the published site.
  eleventyConfig.addPreprocessor("drafts", "*", (data) => {
    if (data.draft && !isDev) return false;
  });

  eleventyConfig.addCollection("posts", allPosts);
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

  eleventyConfig.addGlobalData("year", () => new Date().getFullYear());

  eleventyConfig.addFilter("readableDate", (date) =>
    new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  );
  eleventyConfig.addFilter("isoDate", (date) => new Date(date).toISOString().slice(0, 10));
  eleventyConfig.addFilter("head", (array, n) => array.slice(0, n));
  eleventyConfig.addFilter("byField", (array, field, value) => array.filter((item) => item[field] === value));
  eleventyConfig.addFilter("withTag", (posts, tag) => posts.filter((p) => (p.data.tags ?? []).includes(tag)));
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
