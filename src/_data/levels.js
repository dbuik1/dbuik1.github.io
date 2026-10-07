// How researched a post is: the main way writing is grouped, from least to most.
// Every post must use one of these slugs in its `level` field.
// `name` is what readers see and can be renamed without touching posts.
// A `oneLine` level is for ideas written as a single phrase: the title is the
// idea and the text below it is optional.
// Each level's description is site text in src/_text/level-<slug>.md, edited in the writing editor.
export default [
  { slug: "seed", name: "Seed", oneLine: true },
  { slug: "passing", name: "Passing thought" },
  { slug: "explored", name: "Explored" },
  { slug: "researched", name: "Researched" },
];
