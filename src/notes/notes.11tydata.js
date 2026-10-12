export default {
  layout: "layouts/note.njk",
  // The date prefix in the file name sets the date; the rest of the name becomes the URL.
  permalink: "/notes/{{ page.fileSlug }}/",
  eleventyComputed: {
    // A kind page with a single note adds nothing to search results that the note's own page doesn't.
    noindex: (data) => typeof data.kind === "object" && data.kind?.count < 2,
  },
};
