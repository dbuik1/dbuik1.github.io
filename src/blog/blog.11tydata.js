export default {
  layout: "layouts/post.njk",
  // The date prefix in the file name sets the post date; the rest of the name becomes the URL.
  permalink: "/blog/{{ page.fileSlug }}/",
};
