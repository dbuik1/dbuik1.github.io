// Search with Pagefind, plus the grid of posts by research level and importance.
// Each post carries a Pagefind filter `square` of "<level> <importance>". Picked squares
// narrow the results to posts in any of them, with or without typed words.
const pagefind = await import("/pagefind/pagefind.js");
await pagefind.init();

const form = document.getElementById("search");
const input = document.getElementById("search-input");
const status = document.getElementById("search-status");
const list = document.getElementById("search-results");
const more = document.getElementById("search-more");
const grid = document.getElementById("square-grid");
const squares = grid ? [...grid.querySelectorAll(".square")] : [];
const clear = grid?.querySelector(".clear");
const PAGE = 10;

let results = [];
let shown = 0;
let run = 0;
let timer;

form.hidden = false;
if (grid) grid.hidden = false;
form.addEventListener("submit", (e) => e.preventDefault());

const picked = (s) => s.getAttribute("aria-pressed") === "true";
const set = (s, on) => s.setAttribute("aria-pressed", String(on && !s.disabled));
const inLine = (axis) => squares.filter((s) => !s.disabled && (s.dataset.level === axis.dataset.level || s.dataset.importance === axis.dataset.importance));

async function search() {
  const term = input.value.trim();
  const values = squares.filter(picked).map((s) => `${s.dataset.level} ${s.dataset.importance}`);
  const mine = ++run;
  if (!term && !values.length) {
    results = [];
    status.textContent = "";
    list.replaceChildren();
    more.hidden = true;
    return;
  }
  const found = await pagefind.search(term || null, values.length ? { filters: { square: { any: values } } } : {});
  if (mine !== run) return;
  results = found.results;
  shown = 0;
  list.replaceChildren();
  status.textContent = results.length ? `${results.length} ${results.length === 1 ? "result" : "results"}` : "No results";
  await showMore();
}

async function showMore() {
  const mine = run;
  const page = await Promise.all(results.slice(shown, shown + PAGE).map((r) => r.data()));
  if (mine !== run) return;
  shown += page.length;
  list.append(...page.map(item));
  more.hidden = shown >= results.length;
}

function item(data) {
  const li = document.createElement("li");
  const title = Object.assign(document.createElement("a"), { className: "post-title", href: data.url, textContent: data.meta.title || data.url });
  const excerpt = Object.assign(document.createElement("p"), { className: "search-excerpt" });
  // Pagefind's excerpts are escaped text with <mark> around the matched words.
  excerpt.innerHTML = data.excerpt;
  li.append(title, excerpt);
  const parts = (data.sub_results ?? []).filter((s) => s.url !== data.url).slice(0, 3);
  if (parts.length) {
    const sub = Object.assign(document.createElement("ul"), { className: "search-parts" });
    for (const s of parts) {
      const p = document.createElement("li");
      p.append(Object.assign(document.createElement("a"), { href: s.url, textContent: s.title }));
      sub.append(p);
    }
    li.append(sub);
  }
  return li;
}

input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(search, 200);
});
more.addEventListener("click", showMore);

function applyGrid() {
  for (const axis of grid.querySelectorAll(".axis")) {
    const line = inLine(axis);
    axis.setAttribute("aria-pressed", String(line.length > 0 && line.every(picked)));
  }
  clear.hidden = !squares.some(picked);
  search();
}

grid?.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b === clear) squares.forEach((s) => set(s, false));
  else if (b.classList.contains("square")) set(b, !picked(b));
  else {
    const line = inLine(b);
    const all = line.length > 0 && line.every(picked);
    line.forEach((s) => set(s, !all));
  }
  applyGrid();
});

// A post's importance links here as ?level=…&importance=…; either one alone picks a whole column or row.
const params = new URLSearchParams(location.search);
const level = params.get("level");
const importance = params.get("importance");
if (grid && (level || importance)) {
  squares.forEach((s) => set(s, (!level || s.dataset.level === level) && (!importance || s.dataset.importance === importance)));
  applyGrid();
}
