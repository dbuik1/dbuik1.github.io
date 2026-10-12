import { existsSync } from "node:fs";
import { posterPath } from "../../lib/visuals.js";

export default {
  layout: "layouts/visual.njk",
  // Each visual is a folder; its index.md is the visual's own page.
  permalink: "/visuals/{{ page.fileSlug }}/",
  eleventyComputed: {
    poster: (data) => existsSync(posterPath(data.page.fileSlug)),
  },
};
