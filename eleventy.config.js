export default function (eleventyConfig) {
  // Copied to the site root unchanged.
  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addPassthroughCopy("src/app-ads.txt");
  eleventyConfig.addPassthroughCopy("src/css");

  eleventyConfig.addGlobalData("year", () => new Date().getFullYear());

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
