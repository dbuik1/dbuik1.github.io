# davidbuik.com

Personal website, built with [Eleventy](https://www.11ty.dev/) and hosted on GitHub Pages.

## Running locally

```sh
npm install
npm start        # dev server at http://localhost:8080
npm run build    # production build into _site/
```

## Where things live

| Path | What it is |
| --- | --- |
| `src/_data/site.js` | Site title, description, URL, navigation |
| `src/_includes/layouts/base.njk` | The page shell shared by every page |
| `src/css/style.css` | All styling; colours and fonts are tokens at the top |
| `src/index.njk` | Home page |
| `src/CNAME`, `src/app-ads.txt` | Copied to the site root unchanged |

Text in a grey box marked `[...]` is waiting to be written.

## Deployment

Every push to `main` builds the site and publishes it through `.github/workflows/deploy.yml`.

One-time setup:

1. **GitHub → Settings → Pages:** set **Source** to **GitHub Actions** and **Custom domain** to `davidbuik.com`.
2. **Porkbun DNS for davidbuik.com:**
   - `A` records on the apex: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` records on the apex: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` record for `www`: `dbuik1.github.io`
3. Once GitHub shows the DNS check as passing, tick **Enforce HTTPS** on the same Pages settings screen.
