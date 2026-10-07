import { quotable } from "./annotation.js";

const $ = (id) => document.getElementById(id);
const normalise = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

let meta;
let api;
let state = { source: "wcf", ref: "", phrase: "", ok: false };
let onSave = null;
let checkTimer = null;
let searchTimer = null;

const option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });

export function initPicker(siteMeta, apiFn) {
  meta = siteMeta;
  api = apiFn;

  $("stance-options").append(
    ...meta.stances.map((s, i) => {
      const label = document.createElement("label");
      label.className = `stance-choice stance-${s.slug}`;
      const input = Object.assign(document.createElement("input"), { type: "radio", name: "stance", value: s.slug, checked: i === 0 });
      label.append(input, s.name);
      return label;
    })
  );

  for (const b of document.querySelectorAll("#picker [data-source]")) {
    b.addEventListener("click", () => {
      setSource(b.dataset.source);
      locate(defaultRef(b.dataset.source));
    });
  }

  $("picker-cancel").addEventListener("click", () => $("picker").close());
  $("picker-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.ok) return;
    onSave?.({ ref: state.ref, phrase: state.phrase, stance: stance(), note: $("picker-note").value.trim() });
    $("picker").close();
  });

  const passageEl = $("picker-passage");
  const takeSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !passageEl.contains(sel.anchorNode) || !passageEl.contains(sel.focusNode)) return;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!text) return;
    state.phrase = text;
    sel.removeAllRanges();
    drawPassage();
    validate();
  };
  passageEl.addEventListener("mouseup", takeSelection);
  passageEl.addEventListener("keyup", takeSelection);
  passageEl.addEventListener("touchend", () => setTimeout(takeSelection, 0));

  $("picker-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  });
}

const stance = () => document.querySelector('#stance-options input[name="stance"]:checked')?.value ?? "note";

function defaultRef(source) {
  return source === "wcf" ? "wcf 1.1" : source === "scots" ? "scots 1" : "John 1:1";
}

function parseRef(ref) {
  let m;
  if ((m = ref.match(/^wcf\s+(\d+)\.(\d+)$/i))) return { source: "wcf", chapter: +m[1], section: +m[2] };
  if ((m = ref.match(/^scots\s+(\d+|preface)$/i))) return { source: "scots", chapter: m[1].toLowerCase() === "preface" ? 0 : +m[1] };
  if ((m = ref.match(/^(.+?)\s+(\d+)[:.](\d+)(?:\s*-\s*(\d+))?$/))) {
    const squash = (s) => s.toLowerCase().replace(/\s+/g, "");
    const book = Math.max(0, meta.outline.bible.findIndex((b) => squash(b.name) === squash(m[1])));
    return { source: "bible", book, chapter: +m[2], from: +m[3], to: m[4] ? +m[4] : 0 };
  }
  return { source: "wcf", chapter: 1, section: 1 };
}

function setSource(source) {
  state.source = source;
  for (const b of document.querySelectorAll("#picker [data-source]")) b.setAttribute("aria-pressed", String(b.dataset.source === source));
  $("search-results").hidden = true;
  $("picker-search").value = "";
}

// Builds the chapter/section (or book/chapter/verse) selects for a reference and loads its passage.
function locate(ref) {
  const loc = parseRef(ref);
  setSource(loc.source);
  const box = $("locate-fields");
  box.replaceChildren();
  const select = (label, options, value, onChange) => {
    const l = document.createElement("label");
    const s = document.createElement("select");
    s.append(...options);
    s.value = String(value);
    s.addEventListener("change", () => onChange(s.value));
    l.append(label + " ", s);
    box.append(l);
    return s;
  };
  const go = (r) => {
    state.phrase = "";
    locate(r);
  };

  if (loc.source === "wcf") {
    const chapters = meta.outline.wcf;
    select("Chapter", chapters.map((c, i) => option(i + 1, `${i + 1}. ${c.title}`)), loc.chapter, (v) => go(`wcf ${v}.1`));
    const n = chapters[loc.chapter - 1]?.sections ?? 1;
    select("Section", Array.from({ length: n }, (_, i) => option(i + 1, String(i + 1))), loc.section, (v) => go(`wcf ${loc.chapter}.${v}`));
    state.ref = `wcf ${loc.chapter}.${loc.section}`;
  } else if (loc.source === "scots") {
    const opts = [option(0, "Preface"), ...meta.outline.scots.map((t, i) => option(i + 1, `${i + 1}. ${t}`))];
    select("Chapter", opts, loc.chapter, (v) => go(v === "0" ? "scots preface" : `scots ${v}`));
    state.ref = loc.chapter === 0 ? "scots preface" : `scots ${loc.chapter}`;
  } else {
    const books = meta.outline.bible;
    const book = books[loc.book];
    const verses = book.verses[loc.chapter - 1] ?? 1;
    select("Book", books.map((b, i) => option(i, b.name)), loc.book, (v) => go(`${books[v].name} 1:1`));
    select("Chapter", book.verses.map((_, i) => option(i + 1, String(i + 1))), loc.chapter, (v) => go(`${book.name} ${v}:1`));
    const verseOpts = () => Array.from({ length: verses }, (_, i) => option(i + 1, String(i + 1)));
    select("Verse", verseOpts(), loc.from, (v) => go(`${book.name} ${loc.chapter}:${v}`));
    select("to", [option(0, "—"), ...verseOpts().slice(loc.from)], loc.to, (v) =>
      go(`${book.name} ${loc.chapter}:${loc.from}${v !== "0" ? `-${v}` : ""}`)
    );
    state.ref = `${book.name} ${loc.chapter}:${loc.from}${loc.to ? `-${loc.to}` : ""}`;
  }
  loadPassage();
}

let paragraphs = [];
async function loadPassage() {
  const ref = state.ref;
  $("picker-passage").textContent = "Loading…";
  try {
    const p = await api("POST", "/api/passage", { ref });
    if (ref !== state.ref) return;
    paragraphs = p.paragraphs;
  } catch (e) {
    paragraphs = [];
    $("picker-passage").textContent = e.message;
    return;
  }
  drawPassage();
  validate();
}

function drawPassage() {
  const el = $("picker-passage");
  const needle = normalise(state.phrase);
  el.replaceChildren(
    ...paragraphs.map((para) => {
      const p = document.createElement("p");
      const at = needle ? normalise(para).indexOf(needle) : -1;
      if (at < 0) p.textContent = para;
      else {
        const mark = document.createElement("mark");
        mark.textContent = para.slice(at, at + needle.length);
        p.append(para.slice(0, at), mark, para.slice(at + needle.length));
      }
      return p;
    })
  );
}

// The site's build accepts a phrase only if it appears exactly once, so the
// same check runs here before the annotation can be inserted.
function validate() {
  clearTimeout(checkTimer);
  const stateEl = $("phrase-state");
  const save = $("picker-save");
  state.ok = false;
  save.disabled = true;
  if (!state.phrase) {
    stateEl.className = "phrase-state";
    stateEl.textContent = "No words selected yet.";
    return;
  }
  if (!quotable(state.phrase)) {
    stateEl.className = "phrase-state bad";
    stateEl.textContent = "Select words that don't include both kinds of quotation mark.";
    return;
  }
  const ref = state.ref;
  const phrase = state.phrase;
  checkTimer = setTimeout(async () => {
    const r = await api("POST", "/api/passage", { ref, phrase }).catch((e) => ({ problem: e.message }));
    if (ref !== state.ref || phrase !== state.phrase) return;
    if (r.problem) {
      stateEl.className = "phrase-state bad";
      stateEl.textContent = /appears \d+ times/.test(r.problem)
        ? `“${phrase}” appears more than once in this passage. Select a few more words around it.`
        : r.problem;
    } else {
      stateEl.className = "phrase-state good";
      stateEl.textContent = `Annotating “${phrase}”.`;
      state.ok = true;
      save.disabled = false;
    }
  }, 150);
}

async function runSearch() {
  const q = $("picker-search").value.trim();
  const list = $("search-results");
  if (q.length < 2) {
    list.hidden = true;
    return;
  }
  const hits = await api("POST", "/api/search", { source: state.source, query: q }).catch(() => []);
  list.replaceChildren(
    ...hits.map((h) => {
      const li = document.createElement("li");
      const b = Object.assign(document.createElement("button"), { type: "button", className: "result" });
      const strong = Object.assign(document.createElement("strong"), { textContent: h.label });
      b.append(strong, " ", Object.assign(document.createElement("span"), { className: "muted", textContent: h.snippet }));
      b.addEventListener("click", () => {
        state.phrase = "";
        locate(h.ref);
      });
      li.append(b);
      return li;
    })
  );
  if (!hits.length) list.innerHTML = '<li class="muted">No passages contain all of those words.</li>';
  list.hidden = false;
}

/**
 * Opens the picker to add an annotation (attrs null) or edit one, and calls
 * done({ ref, phrase, stance, note }) when the reader inserts it.
 */
export function openPicker(attrs, done) {
  onSave = done;
  $("picker-title").textContent = attrs ? "Edit annotation" : "Annotate a passage";
  $("picker-save").textContent = attrs ? "Save annotation" : "Insert annotation";
  $("picker-note").value = attrs?.note ?? "";
  const s = attrs?.stance ?? meta.stances[0].slug;
  for (const input of document.querySelectorAll('#stance-options input[name="stance"]')) input.checked = input.value === s;
  state.phrase = attrs?.phrase ?? "";
  locate(attrs?.ref || defaultRef(state.source));
  $("picker").showModal();
}
