# davidbuik.com

Personal website, built with [Eleventy](https://www.11ty.dev/) and hosted on GitHub Pages.

## Running locally

```sh
npm install
npm start        # dev server at http://localhost:8080, drafts included
npm run build    # production build into _site/
```

## Writing with the editor

The easiest way to write is the site's own editor, which runs on your computer:

```sh
npm install      # once
npm run write    # then open http://127.0.0.1:8081/
```

- **New post** opens a blank post. Write in the box as you would in any word processor; the toolbar has headings, quotes, lists and links.
- Research level and tags sit under the title. Description, address, project and series are under **More details**.
- **Image** inserts a picture after the paragraph you're in. You can also paste or drag one into the text. Every image needs a short description for people who can't see it; the caption is optional. Images are saved in `src/images/` and committed with the post that uses them.
- **Footnote** adds a numbered note at the cursor.
- **Cite** adds a citation from your reference library at the cursor, with an optional page, chapter, section or paragraph. Citations become footnotes in Chicago notes style: the full reference the first time a source is cited, a short form after that. A post that cites anything gets a bibliography at the end. You can add a new source from the Cite box without leaving the post.
- **Cross-link** (or typing `[[`) links to another post or project. Pick it, then optionally select exact words in it to link to just those; selected text in your post becomes the link text. Readers get a preview card on hover, focus or tap, and clicking opens the linked page over the current one, with Back (or Esc) returning to where they were. Each post lists the posts that link to it under "Linked from".
- **Annotate** adds an annotation after the paragraph you're in. Choose the Westminster Confession, the Scots Confession or the Bible, find the passage (or search for it), then select the words you're annotating. It only accepts words that appear once in the passage, so annotations can't break the build.
- **Add a fragment** on the home screen publishes a one-line thought or quote straight away. Give it a kind if you like (any word, such as quote or question; each kind gets its own page), tags, and under **Who said it** a name and source. The source can be a citation from your reference library, like `[@calvin1559, 1.1.1]`. Open a fragment from the Fragments list to add a comment below the line.
- Tags can be nested with a slash, like `theology/church`. The suggestions include every tag already in use.
- When you publish a live post at a different research level, the post shows the date it reached that level ("Explored since 10 November 2026"). The editor says so before you publish.
- Drafts save automatically into `drafts/` on your computer. That folder is never committed, so drafts stay private until you publish.
- **Publish** checks that the site still builds with the post, then commits it to `main` and pushes it, using your own git login. The site updates about a minute later. The repository must be on `main`.
- Opening a published post edits a private copy; **Update live post** publishes the changes.
- **More** has superscript, subscript, tables and HTML blocks. Inside a table, a row of table buttons appears (add or delete rows and columns, delete the table).
- HTML is kept exactly as written. A block of HTML shows as a card with a live preview, and HTML inside a sentence (an `<abbr>`, a `<span>`) as a chip; click either, or press Enter on it, to edit the code.
- **Source** switches to the post as plain Markdown and HTML, and **Rich text** switches back. If the formatted view can't hold something in a post (a code block, for example), the post opens in Source with a note saying so, and switching back asks first.
- **Site text and projects** (on the editor's home screen) edits the home page introduction and paragraph, the colophon, the AI page, the introductions to the research levels and fragments, each level's description, and projects. The site text lives in `src/_text/`; while a text is empty, the site shows its grey placeholder.
- **Reference library** lists your sources. Add one by pasting a DOI, an ISBN or a BibTeX entry. To bring in sources from Zotero, export them as BibTeX (the Better BibTeX add-on gives stable keys) and import the file; entries with the same key are replaced. Library changes are published with your next post, or straight away with **Publish library**.

The rest of this section describes the file format the editor writes, for editing by hand.

## Writing a post

Each post is one Markdown file in `src/blog/`, named `YYYY-MM-DD-short-name.md`. The date in the name is the post's date, and the rest becomes its address: `2026-10-07-on-scripture.md` is published at `/blog/on-scripture/`.

Start the file with this block, then write the post below it in Markdown:

```markdown
---
title: On Scripture
level: explored
tags: [theology/scripture, westminster]
description: One line for link previews and search results.
---

Your post starts here.
```

| Field | Required | What to put |
| --- | --- | --- |
| `title` | Yes | The post's title |
| `level` | Yes | `unexplored` (Unexplored), `explored` (Explored) or `researched` (Researched) |
| `tags` | No | Any words, in square brackets, separated by commas. Nest them with a slash: `theology/church` also files the post under `theology` |
| `history` | No | Written by the editor when a published post changes level: a list of `level` and `date` pairs. The post shows the date of the last one |
| `description` | No | One line for link previews |
| `series` | No | The same name on several posts links them as a numbered series |
| `project` | No | A project's file name without `.md`, e.g. `example-project`; the post then shows on that project's page |
| `draft` | No | `true` keeps the post off the live site; remove the line to publish |

Writing is grouped by research level: the Writing page lists Researched first, and each level has its own page and feed at `/blog/<level>/`.

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
npm start        # preview at http://localhost:8080; drafts are shown here, but not in search
```

Create the file in `src/blog/`, and the preview updates as you save. When you're happy, commit and push to `main`.

### Changing the labels

Research level names are in `src/_data/levels.js`. Change a `name` there and every page picks it up. Each level's description is site text in `src/_text/level-<slug>.md`, edited in the editor under **Site text and projects**.

### Images, footnotes and citations

An image on its own line becomes a figure, with the text in quotes as its caption. The build makes smaller copies in modern formats.

```markdown
![What the image shows](/images/2026/photo.jpg "Optional caption")
```

A footnote is `^[The note text.]` straight after the word it belongs to. A citation is `[@key]`, or `[@key, p. 23]` with a page (also `chap.`, `sec.` or `para.`); several sources share one note as `[@calvin1559, p. 23; @smith2020]`. Keys come from `references/library.bib`. A key that isn't in the library stops the build and names the post.

### Cross-links

`[[on-scripture]]` links to the post at `/blog/on-scripture/` (or the project or fragment with that name), using its title as the link text. `[[on-scripture|my earlier post]]` sets the link text, and `[[on-scripture#"exact words"|this point]]` links to those words, which are highlighted when the link is followed. The build stops if the target doesn't exist, is still a draft, or doesn't contain the words exactly once.


### Fragments

A fragment is one line: a thought, a quote or anything else worth keeping. Each is a file in `src/fragments/`, named like a post (`2026-10-07-short-name.md`) and published at `/fragments/short-name/`:

```markdown
---
title: The heart has its reasons which reason knows nothing of.
kind: quote
by: Blaise Pascal
source: Pensées, 277
tags: [theology/faith]
---

An optional comment.
```

Only `title` (the line itself) is required. `kind` is any word; each kind gets a page at `/fragments/kinds/<kind>/`. `source` can be plain text or a citation from the library, like `[@calvin1559, 1.1.1]`. Fragments share tags with posts and can be cross-linked with `[[short-name]]`.

The **Graph** page draws every post, fragment, project, tag and annotated passage, with lines for cross-links, tags and annotations.

## Annotating a passage

Any post can annotate a phrase from the Westminster Confession, the Scots Confession or the Bible (BSB). Put the annotation on its own lines, straight after the paragraph it belongs to:

```markdown
The Confession grounds Scripture's authority in God, "for which it ought to be believed and obeyed".

{% annotate "wcf 1.4", "for which it ought to be believed and obeyed", "qualified" %}
Your note, in Markdown. It can run to several paragraphs, or be left empty.
{% endannotate %}
```

The three values are:

| Value | What to put |
| --- | --- |
| Passage | `wcf 1.4` (chapter.section), `scots 16` or `scots preface`, or a Bible reference such as `John 3:16` or `Romans 8:28-30` |
| Phrase | Words copied exactly from the passage, long enough to appear only once in it. Straight and curly apostrophes count as the same |
| Stance | `agree`, `disagree`, `qualified` or `note` |

If the passage doesn't exist, or the phrase is missing or appears more than once, the build stops, names the post, and prints the passage so you can copy the phrase from it.

Readers choose how annotations show with the Expanded / Compact switch under the post title, and their choice is remembered on their device. Expanded shows the passage, stance and note after the paragraph. Compact shows only a highlight that opens them in a popup. When the paragraph before the annotation quotes the phrase, that's the highlight; otherwise a small button takes its place.

Every annotated passage gets its own page listing the posts that annotate it, at `/annotations/`. The texts themselves are in `texts/`.

## Adding a project

Each project is one Markdown file in `src/projects/`. The file name becomes its address: `bible-app.md` is published at `/projects/bible-app/`.

```markdown
---
title: Bible app
status: active
summary: One line saying what the project is.
links:
  - label: Source code
    url: https://github.com/dbuik1/bible-app
---

A longer description, if you want one.
```

| Field | Required | What to put |
| --- | --- | --- |
| `title` | Yes | The project's name |
| `status` | Yes | `active`, `paused`, `shipped` or `retired` |
| `summary` | No | One line shown in lists |
| `links` | No | Each with a `label` and a `url` |
| `draft` | No | `true` keeps it off the live site |

The Projects page groups projects by status, and active ones also appear on the home page. To move a project, change its `status`. Posts with a matching `project:` field are listed on the project's page. Status names are in `src/_data/statuses.js`.

## Where things live

| Path | What it is |
| --- | --- |
| `src/_data/site.js` | Site title, description, URL, main and footer navigation |
| `src/_includes/layouts/base.njk` | The page shell shared by every page |
| `src/css/style.css` | All styling; colours and fonts are tokens at the top |
| `src/index.njk` | Home page |
| `src/_text/` | Site text edited in the editor: home introduction and paragraph, colophon, AI page, introductions to research levels and fragments, level descriptions |
| `src/fragments/`, `lib/fragments.js` | Fragments, their pages and kinds |
| `src/graph.njk`, `lib/graph.js`, `src/js/graph.js` | The Graph page: the site's connections, drawn with [d3-force](https://d3js.org/d3-force) |
| `src/images/` | Images used in posts and projects |
| `references/` | The reference library (`library.bib`), the Chicago notes citation style and its British English locale (both from the [Citation Style Language](https://citationstyles.org) project, CC BY-SA 3.0) |
| `lib/references.js`, `lib/markdown.js` | Citations and bibliographies, figures and footnotes |
| `lib/xref.js`, `src/js/xref.js` | Cross-links and their build checks, and the preview cards and reading overlay |
| `src/blog/` | Posts, plus the Writing page and a page per research level |
| `src/projects/` | Projects, plus the Projects page |
| `src/colophon.njk`, `src/feeds.njk`, `src/404.njk` | Footer pages and the not-found page |
| `src/changelog.njk` | Changelog, built automatically from the commit history |
| `texts/` | Confession and Bible texts that posts can annotate |
| `lib/annotations.js`, `src/js/annotations.js` | The annotate shortcode and its build checks, and the Compact popups |
| `src/annotations/` | The annotated passages pages |
| `editor/` | The writing editor (`npm run write`): `server.js` reads and writes posts, projects, site text, images and the reference library; the rest is the page |
| `tools/chokidar-globs/` | A small stand-in for the file watcher behind `npm start`, so the project has no known security warnings. Leave it in place |
| `src/search.njk` | Search page. [Pagefind](https://pagefind.app) indexes posts and projects after each build |
| `src/_data/levels.js`, `statuses.js` | Research level and project status names |
| `lib/tags.js` | Nested tags: their pages, counts and checks |
| `src/_includes/layouts/` | Page templates: `base` (shell), `page`, `post`, `project` |
| `src/CNAME`, `src/app-ads.txt` | Copied to the site root unchanged |

Text in a grey box marked `[...]` is waiting to be written.

## Deployment

Every push to `main` builds the site and publishes it through `.github/workflows/deploy.yml`. Pull requests are build-checked by `.github/workflows/check.yml`.

Feeds: `/feed.xml` for all writing, `/blog/<level>/feed.xml` for each research level, and `/fragments/feed.xml` for fragments.

One-time setup:

1. **GitHub → Settings → Pages:** set **Source** to **GitHub Actions** and **Custom domain** to `davidbuik.com`.
2. **Porkbun DNS for davidbuik.com:**
   - `A` records on the apex: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` records on the apex: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` record for `www`: `dbuik1.github.io`
3. Once GitHub shows the DNS check as passing, tick **Enforce HTTPS** on the same Pages settings screen.
