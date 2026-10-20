// How much a post matters, set by the author: with the research level, it places a post
// on the grid on the Search page. Every post must use one of these slugs in its `importance` field.
// `name` is what readers see and can be renamed without touching posts.
export default [
  { slug: "low", name: "Low" },
  { slug: "medium", name: "Medium" },
  { slug: "high", name: "High" },
];
