# davidbuik.com

Personal website, built with [Eleventy](https://www.11ty.dev/) and hosted on GitHub Pages.

## Running locally

```sh
npm install
npm start        # dev server at http://localhost:8080, drafts included
npm run build    # production build into _site/
```

## Writing a post

Each post is one Markdown file in `src/blog/`, named `YYYY-MM-DD-short-name.md`. The date in the name is the post's date, and the rest becomes its address: `2026-10-07-on-scripture.md` is published at `/blog/on-scripture/`.

Start the file with this block, then write the post below it in Markdown:

```markdown
---
title: On Scripture
category: theology
level: explored
tags: [westminster, scripture]
description: One line for link previews and search results.
---

Your post starts here.
```

| Field | Required | What to put |
| --- | --- | --- |
| `title` | Yes | The post's title |
| `category` | Yes | `theology`, `thinking` or `projects` |
| `level` | Yes | `passing` (Passing thought), `explored` (Explored) or `researched` (Researched) |
| `tags` | No | Any words, in square brackets, separated by commas |
| `description` | No | One line for link previews |
| `series` | No | The same name on several posts links them as a numbered series |
| `draft` | No | `true` keeps the post off the live site; remove the line to publish |

If a required field is missing or misspelled, the build stops and names the file and field. The live site stays as it was until it's fixed.

### From the GitHub website

1. Open the repository on GitHub and go into `src/blog/`.
2. Choose **Add file → Create new file** and type the file name, e.g. `2026-10-07-on-scripture.md`.
3. Paste the block above, change the fields, and write the post.
4. Choose **Commit changes** and commit directly to `main`.

The site rebuilds automatically, and the post appears once the **Deploy to GitHub Pages** run in the **Actions** tab turns green. To fix a post later, open its file and use the pencil icon to edit it.

On a phone, the GitHub app or the mobile site works the same way.

### On your computer

```sh
npm install      # once
npm start        # preview at http://localhost:8080; drafts are shown here
```

Create the file in `src/blog/`, and the preview updates as you save. When you're happy, commit and push to `main`.

### Changing the labels

Category names are in `src/_data/categories.js` and research level names in `src/_data/levels.js`. Change a `name` there and every page picks it up. The research levels page reads each level's `description` from the same file.

## Where things live

| Path | What it is |
| --- | --- |
| `src/_data/site.js` | Site title, description, URL, navigation |
| `src/_includes/layouts/base.njk` | The page shell shared by every page |
| `src/css/style.css` | All styling; colours and fonts are tokens at the top |
| `src/index.njk` | Home page |
| `src/blog/` | Posts, plus the Writing and category pages |
| `src/_data/categories.js`, `src/_data/levels.js` | Category and research level names |
| `src/_includes/layouts/` | Page templates: `base` (shell), `page`, `post` |
| `src/CNAME`, `src/app-ads.txt` | Copied to the site root unchanged |

Text in a grey box marked `[...]` is waiting to be written.

## Deployment

Every push to `main` builds the site and publishes it through `.github/workflows/deploy.yml`. Pull requests are build-checked by `.github/workflows/check.yml`.

Feeds: `/feed.xml` for everything, and `/blog/<category>/feed.xml` for each category.

One-time setup:

1. **GitHub → Settings → Pages:** set **Source** to **GitHub Actions** and **Custom domain** to `davidbuik.com`.
2. **Porkbun DNS for davidbuik.com:**
   - `A` records on the apex: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` records on the apex: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` record for `www`: `dbuik1.github.io`
3. Once GitHub shows the DNS check as passing, tick **Enforce HTTPS** on the same Pages settings screen.
