import levels from "./levels.js";

export default {
  title: "David Buik",
  description: "Personal website of David Buik.",
  url: "https://davidbuik.com",
  author: "David Buik",
  language: "en",
  locale: "en_GB",
  repo: "https://github.com/dbuik1/dbuik1.github.io",
  // Your profiles elsewhere. Search engines and AI models use these to tell that
  // they belong to the same David Buik as this site. Add any others the same way.
  profiles: [{ label: "GitHub", url: "https://github.com/dbuik1" }],
  // Whether AI companies may use the site to train their models (see robots.txt).
  // Search and answer bots, which cite and link to pages, are allowed either way.
  allowAiTraining: true,
  // Lets Bing and other IndexNow search engines hear about new and changed pages
  // as soon as they are published. It is public by design: the same value is
  // served at /<key>.txt to prove the site is ours.
  indexNowKey: "dc6dfe4a062633fcaa17def9db22e4ac",
  // Sections are added here as they are built.
  nav: [
    { label: "Home", url: "/" },
    // Writing opens a short menu: every post, each research level, commentary, notes and visuals.
    // Commentary and notes are kept mainly for reference rather than read through, and
    // visuals are mostly used inside writing, so all three sit one step down.
    {
      label: "Writing",
      url: "/blog/",
      children: [
        { label: "All writing", url: "/blog/" },
        // `hideWhenEmpty` names a collection: the item stays out of the menu until it has
        // something in it, so the menu never leads to an empty page.
        ...levels.map((l) => ({ label: l.name, url: `/blog/${l.slug}/`, hideWhenEmpty: `level-${l.slug}` })),
        { label: "Commentary", url: "/commentary/", hideWhenEmpty: "commentary" },
        { label: "Notes", url: "/notes/", hideWhenEmpty: "notes" },
        { label: "Visuals", url: "/visuals/", hideWhenEmpty: "visuals" },
      ],
    },
    { label: "Projects", url: "/projects/", hideWhenEmpty: "projects" },
    { label: "Graph", url: "/graph/" },
    { label: "Search", url: "/search/" },
  ],
  footer: [
    { label: "Feeds", url: "/feeds/" },
    { label: "Colophon", url: "/colophon/" },
    { label: "Changelog", url: "/changelog/" },
  ],
};
