// How far a post's topic has been explored: the main way writing is grouped, from least to most.
// Every post must use one of these slugs in its `level` field.
// `name` is what readers see and can be renamed without touching posts.
// Each level's description is site text in src/_text/level-<slug>.md, edited in the writing editor.
export default [
  { slug: "unexplored", name: "Unexplored" },
  { slug: "explored", name: "Explored" },
  { slug: "researched", name: "Researched" },
];
