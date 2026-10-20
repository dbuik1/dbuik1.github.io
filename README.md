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
- Research level, importance and tags sit under the title. Description, address, project and series are under **More details**.
- **Image** inserts a picture after the paragraph you're in. You can also paste or drag one into the text. Every image needs a short description for people who can't see it; the caption is optional. Images are saved in `src/images/` and committed with the post that uses them.
- **Footnote** adds a numbered footnote at the cursor.
- **Cite** adds a citation from your reference library at the cursor, with an optional page, chapter, section or paragraph. Citations become footnotes in Chicago notes style: the full reference the first time a source is cited, a short form after that. A post that cites anything gets a bibliography at the end. You can add a new source from the Cite box without leaving the post.
- **Cross-link** (or typing `[[`) links to another post or project. Pick it, then optionally select exact words in it to link to just those; selected text in your post becomes the link text. Readers get a preview card on hover, focus or tap, and clicking opens the linked page over the current one, with Back (or Esc) returning to where they were. Each post lists the posts that link to it under "Linked from".
- **Annotate** adds an annotation after the paragraph you're in. Choose the Westminster Confession, the Scots Confession or the Bible, find the passage (or search for it), then select the words you're annotating. It only accepts words that appear once in the passage, so annotations can't break the build.
- **Add a note** on the home screen publishes a note straight away: a single piece of knowledge, a fact or a quote, in one line. Give it a kind if you like (any word, such as quote or question; each kind gets its own page), tags, and under **Who said it** a name and source. The source can be a citation from your reference library, like `[@calvin1559, 1.1.1]`. Open a note from the Notes list to add a comment below it.
- **Add a visual** (under Visuals on the home screen) adds an animation, simulation or interactive diagram from an HTML file, such as one Claude made for you. Drop the file in; the editor checks that it works on its own (nothing loaded from other websites, under 2 MB) and shows it running. Give it a title and a text description saying what it shows, for people who can't see or run it; your introduction above it is optional. Publishing also takes a still image of it with the Edge or Chrome on your computer.
- **New commentary** (under Commentary on the home screen) is for responding to something you've read, watched or heard online. Paste its address and press **Look up**: the editor fills in the title, author, site and date (open the line under the address to correct them), keeps the article's text for quoting, and asks the Internet Archive to save a copy in case the original changes or disappears. Write your headline and your response. **Excerpt** quotes words from the source: select them in its text, or paste them. **Moment** (for videos and podcasts) points to a time, like 12:34 to 13:10, with an optional line of what is said. Publishing needs at least a sentence of your own, and asks first if a quote is very long or the quotes outweigh your own words. It also adds the source to your reference library and, for a video, keeps a still image on the site.
- **Capturing from Chrome.** The extension in `extension/` sends the page you're on to the editor. Install it once: open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and pick the `extension` folder. Pin it, then on any page press it (or Alt+Shift+C). Words you selected first become an excerpt, and on a video or recording that is playing, the time becomes a moment. **Write now** opens a new commentary in the editor; **Save for later** adds the page to **Saved for later** on the editor's start screen, where pressing its title starts the commentary. The editor needs to be running; if it isn't, captures wait in Chrome and move to Saved for later once you run `npm run write`. Saved pages stay on your computer in `drafts/`, like drafts.
- **Visual** in the toolbar places a visual after the paragraph you're in, with an optional caption. To make a post about one visual, choose it under **More details → Visual at the top**.
- Tags can be nested with a slash, like `theology/church`. The suggestions include every tag already in use.
- When you publish a live post at a different research level, the post shows the date it reached that level ("Explored since 10 November 2026"). The editor says so before you publish.
- Drafts save automatically into `drafts/` on your computer. That folder is never committed, so drafts stay private until you publish.
- **Publish** checks that the site still builds with the post, then commits it to `main` and pushes it, using your own git login. The site updates about a minute later. The repository must be on `main`.
- Opening anything already on the site (a post, commentary, note, project or site text) shows what the site has now, with a line saying your edits stay on your computer until you press **Update live …**, which replaces the live version. If you'd already started changes to it, those open instead, marked as unpublished, with **Show what's live** to compare and **Discard my changes** to go back to the live version. The Site text list shows the start of each text as it is now.
- The editor fetches the latest version of the site from GitHub whenever you list or open things, so changes made on another computer or on GitHub show up. If the editor's own code changed in that update, a note asks you to restart `npm run write`, and publishing waits until you do.
- **More** has superscript, subscript, tables and HTML blocks. Inside a table, a row of table buttons appears (add or delete rows and columns, delete the table).
- HTML is kept exactly as written. A block of HTML shows as a card with a live preview, and HTML inside a sentence (an `<abbr>`, a `<span>`) as a chip; click either, or press Enter on it, to edit the code.
- **Source** switches to the post as plain Markdown and HTML, and **Rich text** switches back. If the formatted view can't hold something in a post (a code block, for example), the post opens in Source with a note saying so, and switching back asks first.
- **Site text and projects** (on the editor's home screen) edits the home page introduction and paragraph, the colophon, the introductions to the research levels, commentary, notes and visuals, each level's description, and projects. The site text lives in `src/_text/`; while a text is empty, the site shows its grey placeholder.
- **Reference library** lists your sources. Add one by pasting a DOI, an ISBN or a BibTeX entry. To bring in sources from Zotero, export them as BibTeX (the Better BibTeX add-on gives stable keys) and import the file; entries with the same key are replaced. Library changes are published with your next post, or straight away with **Publish library**.

The rest of this section describes the file format the editor writes, for editing by hand.

## Writing a post

Each post is one Markdown file in `src/blog/`, named `YYYY-MM-DD-short-name.md`. The date in the name is the post's date, and the rest becomes its address: `2026-10-07-on-scripture.md` is published at `/blog/on-scripture/`.

Start the file with this block, then write the post below it in Markdown:

```markdown
---
title: On Scripture
level: explored
importance: high
tags: [theology/scripture, westminster]
description: One line for link previews and search results.
---

Your post starts here.
```

| Field | Required | What to put |
| --- | --- | --- |
| `title` | Yes | The post's title |
| `level` | Yes | `unexplored` (Unexplored), `explored` (Explored) or `researched` (Researched) |
| `importance` | Yes | `low` (Low), `medium` (Medium) or `high` (High): how much the post matters to you. The post shows it beside the level |
| `tags` | No | Any words, in square brackets, separated by commas. Nest them with a slash: `theology/church` also files the post under `theology` |
| `history` | No | Written by the editor when a published post changes level: a list of `level` and `date` pairs. The post shows the date of the last one |
| `description` | No | One line for search results and link previews. Left out, the post's first paragraph is used |
| `series` | No | The same name on several posts links them as a numbered series |
| `project` | No | A project's file name without `.md`, e.g. `example-project`; the post then shows on that project's page |
| `draft` | No | `true` keeps the post off the live site; remove the line to publish |

Writing is grouped by research level: the Writing page lists Researched first, and each level has its own page and feed at `/blog/<level>/`.

The Search page has a grid of posts by research level (across) and importance (up), with the number of posts in each square. Readers pick squares, or a whole row or column by its label, and the results narrow to posts in those squares, together with any words typed in the search box. A post's importance links to its square.

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

`[[on-scripture]]` links to the post at `/blog/on-scripture/` (or the project, note or visual with that name), using its title as the link text. `[[on-scripture|my earlier post]]` sets the link text, and `[[on-scripture#"exact words"|this point]]` links to those words, which are highlighted when the link is followed. The build stops if the target doesn't exist, is still a draft, or doesn't contain the words exactly once.


### Commentary

Commentary is your response to one piece of content elsewhere: an article, a video, a podcast, a social media post or a paper. It sits under **Writing → Commentary** (the menu shows it once there is one), with its own feed, and is kept out of All writing and the main feed. Each is a file in `src/commentary/`, named like a post and published at `/commentary/short-name/`:

```markdown
---
title: Your headline
source:
  url: https://www.youtube.com/watch?v=…
  title: The content's own title
  type: video
  author: Who made it
  site: YouTube
  published: 2026-10-01
  archived: https://web.archive.org/web/20261013000000/https://www.youtube.com/watch?v=…
  archivedOn: 2026-10-13
  image: /images/commentary/short-name.jpg
tags: [theology/grace]
---
Your response, with what you respond to quoted in place:

{% excerpt %}
Exact words from the source.
{% endexcerpt %}

{% moment "12:34", "13:10" %}
Optional: what is said in that moment.
{% endmoment %}
```

`title`, `source.url` and `source.title` are required. `type` is one of article, video, podcast, post, paper or other. For a social media post, `text` holds the post itself, shown in the card at the top. `archived` is a saved copy at the Internet Archive; the page links to it, and if the original goes, readers' browsers can find it. `image` is a still for a video, kept on this site.

Each page starts with a card naming the source. An excerpt links to the exact words in the original (the browser scrolls to them and highlights them). A moment shows the video's still with a Play button that starts at that time; nothing loads from YouTube or Vimeo until a reader presses it. The build stops if a commentary has no words of your own beside its quotes, since quoting is fair for criticism and review, not for reposting.

The source card links each author and the site to a page collecting all your commentary on them (`/commentary/people/<name>/` and `/commentary/sites/<name>/`). Those with more than one commentary are listed under the Commentary list.

Once a month, the **Check commentary sources** action (`tools/check-sources.js`) visits every source. It checks that the source is still there and that the words you quoted still appear in it. What it finds wrong goes in `src/_data/sourceChecks.json` and is committed, and the site is rebuilt. A commentary whose source has gone then says so, and its title links to the saved copy. One whose quoted words have changed says that too. The editor marks these in the Commentary list and above the source when you open one. A site that refuses the check, or doesn't answer, keeps its last result. To run the check now, open the action on GitHub and press **Run workflow**, or run `node tools/check-sources.js`.

### Notes

A note is a single piece of knowledge, a fact or a quote, written in one line and kept to build longer writing on. Notes sit under **Writing → Notes** in the menu rather than in the main menu, and show in the Graph and in tags beside posts. Each is a file in `src/notes/`, named like a post (`2026-10-07-short-name.md`) and published at `/notes/short-name/`:

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

Only `title` (the note in one line) is required. `kind` is any word; each kind gets a page at `/notes/kinds/<kind>/`. `source` can be plain text or a citation from the library, like `[@calvin1559, 1.1.1]`. Notes share tags with posts and can be cross-linked with `[[short-name]]`.

The **Graph** page draws every post, commentary, note, project, visual, tag and annotated passage, and the sources commentary responds to, with lines for cross-links, tags, placed visuals, annotations and sources.

### Visuals

A visual is an animation, simulation or interactive diagram: one self-contained HTML file with its script and style inside, the kind Claude makes as an artifact. Visuals sit under **Writing → Visuals** (the menu shows it once there is one). Each is a folder in `src/visuals/`, published at `/visuals/<folder>/`:

```
src/visuals/typing-into-embedding-space/
  index.md      title, description and tags; below them, your introduction (optional)
  visual.html   the visual itself
  poster.png    optional still image, shown in posts before the visual runs
```

```markdown
---
title: Typing into embedding space
description: Words become arrows on a map of meanings. The arrows add up to where the prompt sits, and the closest words are the likely next ones.
tags: [ai/language-models]
---
```

`description` is required: it is the text alternative for people who can't see or run the visual, shown under it as "Text description".

Use a visual in three ways:

- On its own page, where it runs straight away, with your introduction above it and a list of the writing that uses it.
- As the subject of a post: add `visual: typing-into-embedding-space` to the post's front matter and it appears under the title.
- Inside any post, project or note: `{% visual "typing-into-embedding-space" %}`, or with a caption, `{% visual "typing-into-embedding-space", "Your caption" %}`.

In writing, a visual shows its still image and a **Run** button, and nothing of it loads until a reader presses it. It runs in a sandboxed frame, so it can't read the page around it, and it can't load anything from other websites. A library it needs (three.js, D3, p5) is served from `/js/vendor/` on this site instead. The build stops if a visual has no description, loads something from elsewhere, is over 2 MB, or if writing places a visual that doesn't exist.

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
| `src/_data/site.js` | Site title, description, URL, main and footer navigation, your profiles elsewhere, and whether AI training crawlers are allowed |
| `src/_includes/layouts/base.njk` | The page shell shared by every page |
| `src/css/style.css` | All styling; colours and fonts are tokens at the top |
| `src/index.njk` | Home page |
| `src/_text/` | Site text edited in the editor: home introduction and paragraph, colophon, introductions to research levels, commentary, notes and visuals, level descriptions |
| `src/commentary/`, `lib/commentary.js`, `src/js/players.js` | Commentary: its pages and its pages per site and person, the `{% excerpt %}` and `{% moment %}` shortcodes and their checks, and the click-to-play video player |
| `tools/check-sources.js`, `src/_data/sourceChecks.json` | The monthly check of commentary sources, and what it last found |
| `src/notes/`, `lib/notes.js` | Notes, their pages and kinds |
| `src/visuals/`, `lib/visuals.js`, `src/js/visuals.js` | Visuals: their folders and pages, the `{% visual %}` shortcode and its checks, and the Run button and sandboxed frame |
| `src/graph.njk`, `lib/graph.js`, `src/js/graph.js` | The Graph page: the site's connections, drawn with [d3-force](https://d3js.org/d3-force) |
| `src/images/` | Images used in posts and projects |
| `references/` | The reference library (`library.bib`), the Chicago notes citation style and its British English locale (both from the [Citation Style Language](https://citationstyles.org) project, CC BY-SA 3.0) |
| `lib/references.js`, `lib/markdown.js` | Citations and bibliographies, figures and footnotes |
| `lib/xref.js`, `src/js/xref.js` | Cross-links and their build checks, and the preview cards and reading overlay |
| `src/blog/` | Posts, plus the Writing page and a page per research level |
| `src/projects/` | Projects, plus the Projects page |
| `src/colophon.njk`, `src/feeds.njk`, `src/404.njk` | Footer pages and the not-found page |
| `src/changelog.njk` | Changelog, built automatically from the commits that change the site |
| `texts/` | Confession and Bible texts that posts can annotate |
| `lib/annotations.js`, `src/js/annotations.js` | The annotate shortcode and its build checks, and the Compact popups |
| `src/annotations/` | The annotated passages pages |
| `extension/` | The Chrome extension that captures pages for commentary. Its fixed ID comes from the `key` in its manifest, and the editor accepts captures only from that ID |
| `editor/` | The writing editor (`npm run write`): `server.js` reads and writes posts, projects, commentary, notes, visuals, site text, images and the reference library, and `sources.js` looks up and archives the sources commentary responds to; the rest is the page |
| `tools/chokidar-globs/` | A small stand-in for the file watcher behind `npm start`, so the project has no known security warnings. Leave it in place |
| `src/search.njk`, `src/js/search.js` | Search page and its level and importance grid. [Pagefind](https://pagefind.app) indexes posts, projects, commentary, notes and visuals after each build |
| `src/_data/levels.js`, `importances.js`, `statuses.js` | Research level, importance and project status names |
| `lib/tags.js` | Nested tags: their pages, counts and checks |
| `src/_includes/layouts/` | Page templates: `base` (shell), `page`, `post`, `project`, `commentary`, `note`, `visual` |
| `src/CNAME`, `src/app-ads.txt` | Copied to the site root unchanged |
| `lib/seo.js`, `src/_includes/partials/seo.njk` | What search engines and AI crawlers read about each page: descriptions, dates, structured data |
| `lib/cards.js` | Share images (`card.png` beside each post, project, commentary, note and visual) |
| `src/robots.njk`, `src/sitemap.njk`, `src/llms.njk` | `/robots.txt`, `/sitemap.xml` and `/llms.txt` |
| `tools/indexnow.js` | Tells Bing about changed pages after each deploy |

Text in a grey box marked `[...]` is waiting to be written.

## Deployment

Every push to `main` builds the site and publishes it through `.github/workflows/deploy.yml`. Pull requests are build-checked by `.github/workflows/check.yml`.

Feeds: `/feed.xml` for all writing, `/blog/<level>/feed.xml` for each research level, and `/notes/feed.xml` for notes.

One-time setup:

1. **GitHub → Settings → Pages:** set **Source** to **GitHub Actions** and **Custom domain** to `davidbuik.com`.
2. **Porkbun DNS for davidbuik.com:**
   - `A` records on the apex: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` records on the apex: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` record for `www`: `dbuik1.github.io`
3. Once GitHub shows the DNS check as passing, tick **Enforce HTTPS** on the same Pages settings screen.

## Search engines and AI

Every build does this without anything to fill in:

- **Descriptions.** Each post's `description` (or its first paragraph) becomes the snippet under the result and in link previews. Text still in a `[Placeholder: …]` box is never used.
- **Structured data.** Posts are marked up as articles with author, dates, research level and tags; the home page says who you are and links your profiles from `profiles` in `src/_data/site.js`. Search engines and AI models use this to connect the writing to you.
- **Share images.** Each post, project and note gets a 1200×630 `card.png` with its title in the site's type, shown when a link is shared.
- **`/sitemap.xml`** lists every page with its last change, taken from the commit history. Tag pages and note kinds with a single item, the search page and the not-found page are kept out of search results.
- **`/robots.txt`** lets every crawler in. Set `allowAiTraining: false` in `src/_data/site.js` to turn away crawlers that only collect training data; search and answer bots (Google, Bing, ChatGPT search, Claude, Perplexity) are allowed either way.
- **`/llms.txt`** is a plain-text map of the writing for AI models and agents.
- **IndexNow.** After each deploy, the pages that changed are sent to Bing, which also feeds ChatGPT search, Copilot and DuckDuckGo.

One-time setup, done in the browser:

1. **Google Search Console** ([search.google.com/search-console](https://search.google.com/search-console)): add a **Domain** property for `davidbuik.com`, copy the `TXT` record it gives you into Porkbun DNS, verify, then under **Sitemaps** submit `sitemap.xml`.
2. **Bing Webmaster Tools** ([bing.com/webmasters](https://www.bing.com/webmasters)): sign in and choose **Import from Google Search Console**. This also covers ChatGPT search, Copilot and DuckDuckGo.
