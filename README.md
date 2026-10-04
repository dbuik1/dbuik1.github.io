# davidbuik.com

Personal website, built with [Eleventy](https://www.11ty.dev/) and deployed to GitHub Pages.

## Running locally

```sh
npm install
npm start        # dev server at http://localhost:8080, drafts included
npm run build    # production build into _site/, drafts excluded
```

## Writing a post

Add a Markdown file to `src/blog/` named `YYYY-MM-DD-slug.md`. The date comes from the file name and the URL becomes `/blog/slug/`.

```markdown
---
title: Post title
description: One-line summary for search results and link previews.
draft: true   # remove to publish
---

Post body.
```

`src/blog/2026-10-03-example-draft.md` is a starter you can copy or delete.

## Where things live

| Path | What it is |
| --- | --- |
| `src/_data/site.js` | Site title, description, URL, navigation |
| `src/_includes/layouts/` | Page templates: `base` (shell), `page`, `post` |
| `src/css/style.css` | All styling, including dark mode |
| `src/index.njk`, `src/about.md` | Home and About pages |
| `src/img/` | Images, copied as-is |
| `src/CNAME`, `src/app-ads.txt` | Copied to the site root unchanged |

Text marked `[Placeholder: …]` (yellow box) is waiting to be written.

## Deployment

Every push to `main` builds the site and publishes it via `.github/workflows/deploy.yml`. In the repository's **Settings → Pages**, **Source** must be set to **GitHub Actions**.

The site also publishes `/feed.xml` (Atom), `/sitemap.xml` and `/robots.txt`.
