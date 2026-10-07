import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Annotation } from "./annotation.js";
import { openPicker, initPicker } from "./picker.js";
import { Figure } from "./figure.js";
import { Footnote, Citation } from "./notes.js";
import { initDialogs, loadLibrary, citationLabel, openImage, openFootnote, openCite } from "./dialogs.js";
import { initLibrary, showLibrary } from "./library.js";
import { Xref, initXref, loadTargets, openXref } from "./xref.js";
import { TableKit } from "@tiptap/extension-table";
import MarkdownIt from "markdown-it";
import { HtmlBlock, HtmlInline, Sup, Sub, initHtml, newHtmlBlock } from "./html.js";

const $ = (id) => document.getElementById(id);

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const meta = await api("GET", "/api/meta");
initPicker(meta, api);
initDialogs(api);
initLibrary(api);
initXref(api);
initHtml();
await Promise.all([loadLibrary().catch(() => {}), loadTargets().catch(() => {})]);

// ---- Passage lookups, cached for the annotation cards ----
const passageCache = new Map();
function lookup(ref, phrase) {
  const key = `${ref}\u0000${phrase}`;
  if (!passageCache.has(key)) passageCache.set(key, api("POST", "/api/passage", { ref, phrase }));
  return passageCache.get(key);
}

// ---- Editor ----
const editor = new Editor({
  element: $("content"),
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      underline: false,
      code: false,
      codeBlock: false,
      link: { openOnClick: false, autolink: true },
    }),
    Markdown,
    Annotation.configure({
      lookup,
      onEdit: (attrs, update) => openPicker(attrs, (next) => update(next)),
    }),
    Figure.configure({ onEdit: (attrs, update) => openImage(attrs, update) }),
    Footnote.configure({ onEdit: (attrs, update) => openFootnote(attrs, update) }),
    Citation.configure({ onEdit: (attrs, update) => openCite(attrs, update), label: citationLabel }),
    Xref.configure({ onEdit: (attrs, update) => openXref(attrs, update, true), onTrigger: () => crossLink() }),
    HtmlBlock,
    HtmlInline,
    Sup,
    Sub,
    TableKit.configure({ table: { resizable: false } }),
  ],
  editorProps: {
    attributes: { class: "prose", "aria-label": "Text", spellcheck: "true" },
    // A pasted or dropped image opens the image dialog, so it gets a description.
    handlePaste: (_view, event) => takeImage(event.clipboardData?.files),
    handleDrop: (_view, event) => takeImage(event.dataTransfer?.files),
  },
  onUpdate: () => changed(),
});

// ---- State ----
let doc = null; // { id, file, meta, body }
let saveTimer = null;
let dirty = false;

const fields = {
  title: $("title"),
  level: $("level"),
  description: $("description"),
  slug: $("slug"),
  project: $("project"),
  series: $("series"),
  status: $("status"),
  summary: $("summary"),
  inline: $("inline-text"),
  kind: $("kind"),
  by: $("by"),
  source: $("source"),
};
let tags = [];
let links = [];

const option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });
fields.level.append(option("", "Choose…"), ...meta.levels.map((l) => option(l.slug, l.name)));
fields.project.append(...meta.projects.map((p) => option(p.slug, p.title || p.slug)));
fields.status.append(option("", "Choose…"), ...meta.statuses.map((x) => option(x.slug, x.name)));
$("tag-options").append(...meta.tags.map((t) => option(t, t)));
$("kind-options").append(...meta.fragmentKinds.map((k) => option(k, k)));
$("series-options").append(...meta.series.map((s) => option(s, s)));

const slugify = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let slugTouched = false;

function renderTags() {
  const list = $("tag-chips");
  list.replaceChildren(
    ...tags.map((t, i) => {
      const li = document.createElement("li");
      const remove = Object.assign(document.createElement("button"), { type: "button", textContent: "×", title: `Remove ${t}` });
      remove.setAttribute("aria-label", `Remove tag ${t}`);
      remove.addEventListener("click", () => {
        tags.splice(i, 1);
        renderTags();
        changed();
      });
      li.append(t, remove);
      return li;
    })
  );
}

function renderLinks() {
  $("link-rows").replaceChildren(
    ...links.map((l, i) => {
      const li = document.createElement("li");
      const label = Object.assign(document.createElement("input"), { value: l.label ?? "", placeholder: "Label, e.g. Source code" });
      label.setAttribute("aria-label", `Link ${i + 1} label`);
      const url = Object.assign(document.createElement("input"), { value: l.url ?? "", placeholder: "https://…", type: "url" });
      url.setAttribute("aria-label", `Link ${i + 1} address`);
      label.addEventListener("input", () => ((links[i].label = label.value), changed()));
      url.addEventListener("input", () => ((links[i].url = url.value), changed()));
      const remove = Object.assign(document.createElement("button"), { type: "button", className: "link-button subtle", textContent: "Remove" });
      remove.addEventListener("click", () => {
        links.splice(i, 1);
        renderLinks();
        changed();
      });
      li.append(label, url, remove);
      return li;
    })
  );
}
$("add-link").addEventListener("click", () => {
  links.push({ label: "", url: "" });
  renderLinks();
  $("link-rows").lastElementChild?.querySelector("input")?.focus();
});

$("tag-input").addEventListener("keydown", (e) => {
  const input = e.target;
  if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
    e.preventDefault();
    const tag = input.value.trim().replace(/,$/, "");
    if (!tags.includes(tag)) tags.push(tag);
    input.value = "";
    renderTags();
    changed();
  } else if (e.key === "Backspace" && !input.value && tags.length) {
    tags.pop();
    renderTags();
    changed();
  }
});
$("tag-input").addEventListener("change", (e) => {
  // Picking from the suggestion list fires change without a key press.
  const tag = e.target.value.trim();
  if (tag && meta.tags.includes(tag) && !tags.includes(tag)) {
    tags.push(tag);
    e.target.value = "";
    renderTags();
    changed();
  }
});

fields.title.addEventListener("input", () => {
  if (!slugTouched && !doc?.file) fields.slug.value = slugify(fields.title.value);
  changed();
});
fields.slug.addEventListener("input", () => {
  slugTouched = true;
  changed();
});
// Moving a published post to another level is recorded with the date, so the editor says so first.
function levelHint() {
  const hint = $("level-hint");
  const level = meta.levels.find((l) => l.slug === fields.level.value);
  const live = meta.levels.find((l) => l.slug === doc?.liveLevel);
  let text = "";
  if (live && level && live.slug !== level.slug) text = `Publishing moves this from ${live.name} to ${level.name} and shows the date it got there.`;
  hint.textContent = text;
  hint.hidden = !text;
}
fields.level.addEventListener("change", levelHint);
for (const el of [fields.kind, fields.by, fields.source, fields.level, fields.description, fields.project, fields.series, fields.status, fields.summary, fields.inline]) {
  el.addEventListener("input", changed);
}

const kindOf = (d) => d?.kind ?? "post";
const textInfo = (name) => meta.texts.find((t) => t.name === name);

function collect() {
  const kind = kindOf(doc);
  const base = { id: doc?.id, kind, file: doc?.file ?? null };
  if (kind === "text") {
    const inline = textInfo(doc.file)?.inline;
    return { ...base, meta: {}, body: inline ? fields.inline.value.trim() : body() };
  }
  if (kind === "fragment") {
    return {
      ...base,
      meta: {
        ...(doc?.meta ?? {}),
        title: fields.title.value.trim(),
        kind: fields.kind.value.trim(),
        by: fields.by.value.trim(),
        source: fields.source.value.trim(),
        tags: [...tags],
      },
      body: body(),
    };
  }
  const slug = fields.slug.value.trim() || slugify(fields.title.value);
  if (kind === "project") {
    return {
      ...base,
      meta: {
        ...(doc?.meta ?? {}),
        title: fields.title.value.trim(),
        status: fields.status.value,
        summary: fields.summary.value.trim(),
        links: links.filter((l) => l.label?.trim() || l.url?.trim()),
        slug,
      },
      body: body(),
    };
  }
  const m = {
    ...(doc?.meta ?? {}),
    title: fields.title.value.trim(),
    level: fields.level.value,
    tags: [...tags],
    description: fields.description.value.trim(),
    project: fields.project.value,
    series: fields.series.value.trim(),
    slug,
  };
  return { ...base, meta: m, body: body() };
}

// Shows only the parts of the writing screen that apply to this kind of document.
function showParts(kind, inline) {
  const token = kind === "text" && inline ? "inline" : kind;
  for (const el of document.querySelectorAll("#write [data-kinds]")) {
    el.hidden = !el.dataset.kinds.split(" ").includes(token);
  }
}

const PUBLISH = {
  post: {
    new: ["Publish", "Checks the post, then pushes it live with any new images and sources."],
    live: ["Update live post", "Checks the post, then pushes the changes live with any new images and sources."],
  },
  project: {
    new: ["Publish project", "Checks the page, then pushes it live with any new images and sources."],
    live: ["Update live project", "Checks the page, then pushes the changes live with any new images and sources."],
  },
  fragment: {
    new: ["Publish fragment", "Checks the fragment, then pushes it live."],
    live: ["Update live fragment", "Checks the fragment, then pushes the changes live."],
  },
  text: { live: ["Update live text", "Checks the site, then pushes this text live with any new images and sources."] },
};

function fill(d) {
  doc = d;
  const kind = kindOf(d);
  const m = d.meta ?? {};
  const info = kind === "text" ? textInfo(d.file) : null;
  showParts(kind, info?.inline);
  if (info) {
    $("text-label").textContent = info.label;
    $("text-where").textContent = `Shown at ${info.url.replace(/#.*/, "")}. ${info.inline ? "One line." : ""}`;
    fields.inline.value = info.inline ? d.body ?? "" : "";
    fields.inline.placeholder = info.placeholder;
  }
  fields.kind.value = m.kind ?? "";
  fields.by.value = m.by ?? "";
  fields.source.value = m.source ?? "";
  fields.status.value = m.status ?? "";
  fields.summary.value = m.summary ?? "";
  links = Array.isArray(m.links) ? m.links.map((l) => ({ ...l })) : [];
  renderLinks();
  $("slug-prefix").textContent = kind === "project" ? "/projects/" : "/blog/";
  fields.title.value = m.title ?? "";
  fields.title.placeholder = kind === "fragment" ? "The line itself" : "Title";
  fields.level.value = m.level ?? "";
  levelHint();
  fields.description.value = m.description ?? "";
  fields.project.value = m.project ?? "";
  fields.series.value = m.series ?? "";
  fields.slug.value = m.slug ?? slugify(m.title ?? "");
  fields.slug.disabled = !!d.file;
  slugTouched = !!m.slug;
  tags = Array.isArray(m.tags) ? [...m.tags] : [];
  renderTags();
  const source = info?.inline ? "" : d.body ?? "";
  editor.commands.setContent(source, { contentType: "markdown", emitUpdate: false });
  const [label, hint] = PUBLISH[kind][d.file ? "live" : "new"];
  $("publish").textContent = label;
  $("publish-hint").textContent = hint;
  hideCallout();
  setSourceMode(false);
  if (!info?.inline && !keepsFormatting(source, editor.getMarkdown())) {
    setSourceMode(true, source);
    showCallout("warn", "This is open as source because the rich-text view would change some of its formatting. Edit it here as Markdown and HTML.");
  }
  dirty = false;
  setSaveState(d.updated ? `Draft saved ${time(d.updated)}` : d.file ? "Editing the live version. Changes stay private until you update it." : "");
}

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const setSaveState = (text) => ($("save-state").textContent = text);

function changed() {
  if (!doc) return;
  dirty = true;
  setSaveState("Unsaved changes");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 1200);
}

async function saveDraft() {
  if (!doc || !dirty) return;
  clearTimeout(saveTimer);
  dirty = false;
  setSaveState("Saving…");
  try {
    const saved = await api("POST", "/api/draft", collect());
    doc = { ...doc, id: saved.id, updated: saved.updated };
    setSaveState(`Draft saved ${time(saved.updated)}`);
  } catch (e) {
    dirty = true;
    setSaveState(`Couldn't save the draft: ${e.message}`);
  }
}

// ---- Callout (shown above the post, where it's read before acting) ----
function showCallout(kind, text, actions = []) {
  const c = $("callout");
  c.className = `callout callout-${kind}`;
  const p = document.createElement("p");
  p.textContent = text;
  c.replaceChildren(p);
  if (actions.length) {
    const row = document.createElement("p");
    row.className = "callout-actions";
    for (const a of actions) {
      const el = a.href ? Object.assign(document.createElement("a"), { href: a.href, target: "_blank", rel: "noopener" }) : document.createElement("button");
      if (!a.href) {
        el.type = "button";
        el.className = "link-button";
        el.addEventListener("click", a.onClick);
      }
      el.textContent = a.label;
      row.append(el);
    }
    c.append(row);
  }
  c.hidden = false;
  c.scrollIntoView({ block: "nearest" });
}
const hideCallout = () => ($("callout").hidden = true);

// ---- Publishing ----
$("publish").addEventListener("click", async () => {
  const button = $("publish");
  button.disabled = true;
  const label = button.textContent;
  button.textContent = "Checking…";
  hideCallout();
  try {
    await saveDraft();
    const result = await api("POST", "/api/publish", collect());
    const kind = kindOf(doc);
    const title = kind === "text" ? textInfo(doc.file).label : fields.title.value.trim();
    const wasLive = !!doc?.file;
    const back = ["post", "fragment"].includes(kind) ? { label: "Back to the start", onClick: showHome } : { label: "Back to site text and projects", onClick: showSite };
    const open = { label: kind === "post" ? "Open the post" : "Open the page", href: result.url };
    doc = null;
    if (result.unchanged) {
      showCallout("ok", `Nothing had changed in “${title}”, so there was nothing to publish.`, [back]);
    } else if (result.pushed) {
      showCallout("ok", wasLive ? `Your changes to “${title}” are published. They will be live in about a minute.` : `“${title}” is published. It will be live in about a minute.`, [
        open,
        { label: "Watch the build", href: result.actions },
        back,
      ]);
    } else {
      showCallout(
        "warn",
        `“${title}” is committed on this computer but couldn't be pushed to GitHub, so it isn't live yet. Run git push in the site folder to finish.\n\n${result.pushError}`,
        [back]
      );
    }
    setSaveState("");
    // The post is done; leave it readable but not editable until reopened.
    $("write").classList.add("done");
    fields.title.readOnly = true;
    fields.inline.readOnly = true;
    sourceBox.readOnly = true;
    editor.setEditable(false);
    button.hidden = true;
    $("publish-hint").hidden = true;
  } catch (e) {
    showCallout("error", e.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});

// ---- Source view ----
// The source is the text exactly as saved, so anything the rich-text view can't
// represent can still be edited. Switching back re-reads it as rich text.
let sourceMode = false;
const sourceBox = $("source");
const body = () => (sourceMode ? sourceBox.value : editor.getMarkdown());

// Plain rendering, used only to tell whether two Markdown texts produce the same page.
const plain = new MarkdownIt({ html: true });
const squash = (html) => html.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
const keepsFormatting = (before, after) => squash(plain.render(before)) === squash(plain.render(after));

function fitSource() {
  sourceBox.style.height = "auto";
  sourceBox.style.height = `${sourceBox.scrollHeight + 2}px`;
}
sourceBox.addEventListener("input", () => {
  fitSource();
  changed();
});

function setSourceMode(on, text) {
  const rich = !(kindOf(doc) === "text" && textInfo(doc?.file)?.inline);
  sourceMode = on;
  $("write").classList.toggle("source-mode", on);
  $("content").hidden = on || !rich;
  sourceBox.hidden = !on || !rich;
  const toggle = document.querySelector('.toolbar [data-cmd="source"]');
  toggle.setAttribute("aria-pressed", String(on));
  toggle.textContent = on ? "Rich text" : "Source";
  toggle.title = on ? "Go back to the formatted view" : "Edit as plain Markdown and HTML";
  if (on) {
    sourceBox.value = text ?? editor.getMarkdown();
    fitSource();
  }
  updateToolbar();
}

function toggleSource() {
  if (!sourceMode) {
    setSourceMode(true);
    sourceBox.focus();
    return;
  }
  const text = sourceBox.value;
  editor.commands.setContent(text, { contentType: "markdown", emitUpdate: false });
  if (!keepsFormatting(text, editor.getMarkdown())) {
    if (!confirm("The rich-text view would change some of this formatting. Switch anyway? Choose Cancel to keep editing the source.")) return;
    changed();
  }
  hideCallout();
  setSourceMode(false);
  editor.commands.focus();
}

// ---- Toolbar ----
const commands = {
  bold: (c) => c.toggleBold(),
  italic: (c) => c.toggleItalic(),
  h2: (c) => c.toggleHeading({ level: 2 }),
  h3: (c) => c.toggleHeading({ level: 3 }),
  quote: (c) => c.toggleBlockquote(),
  bullets: (c) => c.toggleBulletList(),
  numbers: (c) => c.toggleOrderedList(),
  sup: (c) => c.toggleSuperscript(),
  sub: (c) => c.toggleSubscript(),
  table: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  rowAfter: (c) => c.addRowAfter(),
  colAfter: (c) => c.addColumnAfter(),
  rowDelete: (c) => c.deleteRow(),
  colDelete: (c) => c.deleteColumn(),
  tableDelete: (c) => c.deleteTable(),
};
function setLink() {
  const previous = editor.getAttributes("link").href ?? "";
  const href = window.prompt("Link address (leave empty to remove the link)", previous);
  if (href === null) return;
  if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
  else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
}
function afterBlock() {
  const { $from } = editor.state.selection;
  return $from.depth > 0 ? $from.after(1) : editor.state.doc.content.size;
}
function insertImage(file = null) {
  openImage(null, (attrs) => editor.chain().focus().insertContentAt(afterBlock(), { type: "figure", attrs }).run(), file);
}
function takeImage(files) {
  const file = [...(files ?? [])].find((f) => f.type.startsWith("image/"));
  if (!file) return false;
  insertImage(file);
  return true;
}
function footnote() {
  const at = editor.state.selection.to;
  openFootnote(null, (attrs) => attrs && editor.chain().focus().insertContentAt(at, { type: "footnote", attrs }).run());
}
function cite() {
  const at = editor.state.selection.to;
  openCite(null, (attrs) => attrs && editor.chain().focus().insertContentAt(at, { type: "citation", attrs }).run());
}
// Selected text becomes the link text and is replaced by the link.
function crossLink() {
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, " ");
  openXref({ text }, (attrs) => attrs && editor.chain().focus().insertContentAt({ from, to }, { type: "xref", attrs }).run());
}
function htmlBlock() {
  const at = afterBlock();
  newHtmlBlock((attrs) => editor.chain().focus().insertContentAt(at, { type: "htmlBlock", attrs }).run());
}
function annotate() {
  openPicker(null, (attrs) => {
    // Annotations sit after the paragraph they belong to.
    const { $from } = editor.state.selection;
    const after = $from.depth > 0 ? $from.after(1) : editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(after, { type: "annotation", attrs }).run();
  });
}
document.querySelector(".toolbar").addEventListener("click", (e) => {
  const cmd = e.target.closest("button")?.dataset.cmd;
  if (!cmd) return;
  e.target.closest("details")?.removeAttribute("open");
  if (cmd === "source") return toggleSource();
  if (cmd === "html") return htmlBlock();
  if (cmd === "link") return setLink();
  if (cmd === "annotate") return annotate();
  if (cmd === "image") return insertImage();
  if (cmd === "footnote") return footnote();
  if (cmd === "cite") return cite();
  if (cmd === "xref") return crossLink();
  commands[cmd](editor.chain().focus()).run();
});
editor.on("selectionUpdate", updateToolbar);
editor.on("transaction", updateToolbar);
function updateToolbar() {
  const active = {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    h2: editor.isActive("heading", { level: 2 }),
    h3: editor.isActive("heading", { level: 3 }),
    quote: editor.isActive("blockquote"),
    bullets: editor.isActive("bulletList"),
    numbers: editor.isActive("orderedList"),
    link: editor.isActive("link"),
    sup: editor.isActive("superscript"),
    sub: editor.isActive("subscript"),
  };
  $("table-tools").hidden = sourceMode || !editor.isActive("table");
  for (const b of document.querySelectorAll(".toolbar button[data-cmd]")) {
    if (b.dataset.cmd in active) b.setAttribute("aria-pressed", String(active[b.dataset.cmd]));
  }
}
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k" && !$("write").hidden && !sourceMode) {
    e.preventDefault();
    setLink();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && !$("write").hidden) {
    e.preventDefault();
    saveDraft();
  }
});

// ---- Views ----
const VIEWS = ["home", "site", "references", "write"];
function showView(id) {
  for (const v of VIEWS) $(v).hidden = v !== id;
  window.scrollTo(0, 0);
}
const KIND_NOTE = { project: "Project · ", text: "Site text · ", fragment: "Fragment · " };

async function showHome() {
  await saveDraft();
  doc = null;
  showView("home");
  history.replaceState(null, "", "/");
  const { drafts, posts, fragments } = await api("GET", "/api/list");

  const draftList = $("draft-list");
  draftList.replaceChildren(
    ...drafts.map((d) => {
      const li = document.createElement("li");
      const open = Object.assign(document.createElement("button"), { type: "button", className: "doc-link", textContent: d.title });
      open.addEventListener("click", () => openDraft(d.id));
      const info = Object.assign(document.createElement("span"), {
        className: "muted",
        textContent: `${KIND_NOTE[d.kind] ?? ""}${d.file && d.kind !== "text" ? "Edits to the live version · " : ""}saved ${d.updated ? new Date(d.updated).toLocaleString() : ""}`,
      });
      const del = Object.assign(document.createElement("button"), { type: "button", className: "link-button subtle", textContent: "Delete" });
      del.addEventListener("click", async () => {
        if (!confirm(`Delete the draft “${d.title}”? This can't be undone.`)) return;
        await api("POST", "/api/draft/delete", { id: d.id });
        showHome();
      });
      li.append(open, info, del);
      return li;
    })
  );
  if (!drafts.length) draftList.innerHTML = '<li class="muted">No drafts. Start one with New post.</li>';

  const postList = $("post-list");
  postList.replaceChildren(
    ...posts.map((p) => {
      const li = document.createElement("li");
      const open = Object.assign(document.createElement("button"), { type: "button", className: "doc-link", textContent: p.title });
      open.addEventListener("click", () => openPost(p.file));
      const level = meta.levels.find((l) => l.slug === p.level)?.name;
      li.append(open, Object.assign(document.createElement("span"), { className: "muted", textContent: [p.date, level, p.draft && "hidden draft"].filter(Boolean).join(" · ") }));
      return li;
    })
  );
  if (!posts.length) postList.innerHTML = '<li class="muted">Nothing published yet.</li>';

  const fragmentList = $("fragment-list");
  fragmentList.replaceChildren(
    ...fragments.map((f) => {
      const li = document.createElement("li");
      const open = Object.assign(document.createElement("button"), { type: "button", className: "doc-link", textContent: f.title });
      open.addEventListener("click", () => openFragment(f.file));
      li.append(open, Object.assign(document.createElement("span"), { className: "muted", textContent: [f.date, f.kind, f.draft && "hidden draft"].filter(Boolean).join(" · ") }));
      return li;
    })
  );
  if (!fragments.length) fragmentList.innerHTML = '<li class="muted">No fragments yet. Add one above.</li>';
}

// ---- Fragments: one line, published straight from the home screen ----
$("fragment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("fragment-line").value.trim();
  if (!title) return;
  const button = $("fragment-publish");
  const state = $("fragment-state");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Checking…";
  state.hidden = true;
  try {
    const result = await api("POST", "/api/publish", {
      kind: "fragment",
      file: null,
      meta: {
        title,
        kind: $("fragment-kind").value.trim(),
        by: $("fragment-by").value.trim(),
        source: $("fragment-source").value.trim(),
        tags: [...new Set($("fragment-tags").value.split(",").map((t) => t.trim()).filter(Boolean))],
      },
      body: "",
    });
    state.className = `quick-state ${result.pushed ? "ok" : "warn"}`;
    state.replaceChildren(
      result.pushed
        ? "Published. It will be live in about a minute. "
        : `Committed on this computer but couldn't be pushed, so it isn't live yet. Run git push in the site folder.\n${result.pushError ?? ""} `,
      Object.assign(document.createElement("a"), { href: result.url, target: "_blank", rel: "noopener", textContent: "Open it" })
    );
    for (const id of ["fragment-line", "fragment-by", "fragment-source"]) $(id).value = "";
    $("fragment-form").querySelector(".quick-more").open = false;
    await showHome();
  } catch (err) {
    state.className = "quick-state error";
    state.textContent = err.message;
  } finally {
    state.hidden = false;
    button.disabled = false;
    button.textContent = label;
    $("fragment-line").focus();
  }
});

async function showSite() {
  await saveDraft();
  doc = null;
  showView("site");
  const { projects } = await api("GET", "/api/list");
  $("text-list").replaceChildren(
    ...meta.texts.map((t) => {
      const li = document.createElement("li");
      const open = Object.assign(document.createElement("button"), { type: "button", className: "doc-link", textContent: t.label });
      open.addEventListener("click", () => openText(t.name));
      li.append(open, Object.assign(document.createElement("span"), { className: "muted", textContent: t.url.replace(/#.*/, "") }));
      return li;
    })
  );
  const list = $("project-list");
  list.replaceChildren(
    ...projects.map((p) => {
      const li = document.createElement("li");
      const open = Object.assign(document.createElement("button"), { type: "button", className: "doc-link", textContent: p.title });
      open.addEventListener("click", () => openProject(p.slug));
      const status = meta.statuses.find((x) => x.slug === p.status)?.name ?? p.status;
      li.append(open, Object.assign(document.createElement("span"), { className: "muted", textContent: status + (p.draft ? " · hidden draft" : "") }));
      return li;
    })
  );
  if (!projects.length) list.innerHTML = '<li class="muted">No projects yet.</li>';
}

async function showReferences() {
  await saveDraft();
  doc = null;
  showView("references");
  await showLibrary();
}

// Back returns to wherever this kind of document is listed.
let backTo = showHome;
function showWrite(d) {
  backTo = ["post", "fragment"].includes(kindOf(d)) ? showHome : showSite;
  showView("write");
  $("write").classList.remove("done");
  fields.title.readOnly = false;
  fields.inline.readOnly = false;
  sourceBox.readOnly = false;
  editor.setEditable(true);
  $("publish").hidden = false;
  $("publish-hint").hidden = false;
  fill(d);
  const kind = kindOf(d);
  if (kind === "text") {
    if (textInfo(d.file)?.inline) fields.inline.focus();
    else editor.commands.focus("end");
  } else if (!d.meta?.title) fields.title.focus();
  else if (sourceMode) sourceBox.focus();
  else editor.commands.focus("end");
}

async function openDraft(id) {
  showWrite(await api("GET", `/api/draft?id=${encodeURIComponent(id)}`));
}
async function openPost(file) {
  showWrite(await api("GET", `/api/post?file=${encodeURIComponent(file)}`));
}
async function openFragment(file) {
  showWrite(await api("GET", `/api/fragment?file=${encodeURIComponent(file)}`));
}
async function openProject(slug) {
  showWrite(await api("GET", `/api/project?slug=${encodeURIComponent(slug)}`));
}
async function openText(name) {
  showWrite(await api("GET", `/api/text?name=${encodeURIComponent(name)}`));
}

$("new-post").addEventListener("click", () => showWrite({ id: null, kind: "post", file: null, meta: {}, body: "" }));
$("new-project").addEventListener("click", () => showWrite({ id: null, kind: "project", file: null, meta: { status: "active" }, body: "" }));
$("go-site").addEventListener("click", showSite);
$("go-references").addEventListener("click", showReferences);
for (const b of document.querySelectorAll(".back")) b.addEventListener("click", showHome);
// Back goes to wherever this kind of document is listed.
$("back").addEventListener("click", () => backTo());
// Autosave runs a moment after typing stops; warn if the page closes inside that gap.
window.addEventListener("beforeunload", (e) => {
  if (dirty) e.preventDefault();
});

showHome();
