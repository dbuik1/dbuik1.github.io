export default {
  eleventyComputed: {
    // A page with a single commentary adds nothing to search results that the commentary's own page doesn't.
    noindex: (data) => Boolean(data.group && data.group.count < 2),
  },
};
