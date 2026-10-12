export default {
  eleventyComputed: {
    // A tag with a single item adds nothing to search results that the item's own page doesn't.
    noindex: (data) => Boolean(data.tag && data.tag.count < 2),
  },
};
