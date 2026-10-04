import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import site from "./src/_data/site.js";

const isDev = process.env.ELEVENTY_ENV === "development";

export default function (eleventyConfig) {
  // Files served as-is at the site root (custom domain, ad verification, styles).
  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addPassthroughCopy("src/app-ads.txt");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/img");

  // Posts marked `draft: true` show up under `npm start` but never in a production build.
  eleventyConfig.addPreprocessor("drafts", "*", (data) => {
    if (data.draft && !isDev) return false;
  });

  eleventyConfig.addCollection("posts", (collectionApi) =>
    collectionApi.getFilteredByGlob("src/blog/*.md").reverse()
  );

  eleventyConfig.addFilter("readableDate", (date) =>
    new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
  );
  eleventyConfig.addFilter("head", (array, n) => array.slice(0, n));
  eleventyConfig.addGlobalData("year", () => new Date().getFullYear());
  eleventyConfig.addFilter("isoDate", (date) => new Date(date).toISOString().slice(0, 10));

  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/feed.xml",
    collection: { name: "posts", limit: 20 },
    metadata: {
      language: site.language,
      title: site.title,
      subtitle: site.description,
      base: site.url,
      author: { name: site.author },
    },
  });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
