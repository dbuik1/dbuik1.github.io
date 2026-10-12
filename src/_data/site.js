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
    { label: "Writing", url: "/blog/" },
    { label: "Fragments", url: "/fragments/" },
    { label: "Projects", url: "/projects/" },
    { label: "Graph", url: "/graph/" },
    { label: "Search", url: "/search/" },
  ],
  footer: [
    { label: "Feeds", url: "/feeds/" },
    { label: "Colophon", url: "/colophon/" },
    { label: "Changelog", url: "/changelog/" },
  ],
};
