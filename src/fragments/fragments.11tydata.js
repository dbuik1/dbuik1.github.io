export default {
  layout: "layouts/fragment.njk",
  // The date prefix in the file name sets the date; the rest of the name becomes the URL.
  permalink: "/fragments/{{ page.fileSlug }}/",
  eleventyComputed: {
    // A kind page with a single fragment adds nothing to search results that the fragment's own page doesn't.
    noindex: (data) => typeof data.kind === "object" && data.kind?.count < 2,
  },
};
