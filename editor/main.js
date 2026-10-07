import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Annotation } from "./annotation.js";
import { openPicker, initPicker } from "./picker.js";

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
  ],
  editorProps: { attributes: { class: "prose", "aria-label": "Post", spellcheck: "true" } },
  onUpdate: () => changed(),
});

// ---- State ----
let doc = null; // { id, file, meta, body }
let saveTimer = null;
let dirty = false;

const fields = {
  title: $("title"),
  category: $("category"),
  level: $("level"),
  description: $("description"),
  slug: $("slug"),
  project: $("project"),
  series: $("series"),
};
let tags = [];

const option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });
fields.category.append(option("", "Choose…"), ...meta.categories.map((c) => option(c.slug, c.name)));
fields.level.append(option("", "Choose…"), ...meta.levels.map((l) => option(l.slug, l.name)));
fields.project.append(...meta.projects.map((p) => option(p.slug, p.title || p.slug)));
$("tag-options").append(...meta.tags.map((t) => option(t, t)));
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
for (const el of [fields.category, fields.level, fields.description, fields.project, fields.series]) {
  el.addEventListener("input", changed);
}

function collect() {
  const m = {
    ...(doc?.meta ?? {}),
    title: fields.title.value.trim(),
    category: fields.category.value,
    level: fields.level.value,
    tags: [...tags],
    description: fields.description.value.trim(),
    project: fields.project.value,
    series: fields.series.value.trim(),
    slug: fields.slug.value.trim() || slugify(fields.title.value),
  };
  return { id: doc?.id, file: doc?.file ?? null, meta: m, body: editor.getMarkdown() };
}

function fill(d) {
  doc = d;
  const m = d.meta ?? {};
  fields.title.value = m.title ?? "";
  fields.category.value = m.category ?? "";
  fields.level.value = m.level ?? "";
  fields.description.value = m.description ?? "";
  fields.project.value = m.project ?? "";
  fields.series.value = m.series ?? "";
  fields.slug.value = m.slug ?? slugify(m.title ?? "");
  fields.slug.disabled = !!d.file;
  slugTouched = !!m.slug;
  tags = Array.isArray(m.tags) ? [...m.tags] : [];
  renderTags();
  editor.commands.setContent(d.body ?? "", { contentType: "markdown", emitUpdate: false });
  $("publish").textContent = d.file ? "Update live post" : "Publish";
  $("publish-hint").textContent = d.file
    ? "Checks the post, then commits and pushes the changes to the live site."
    : "Checks the post, then commits and pushes it to the live site.";
  hideCallout();
  if (/<\/?[a-z][^>]*>/i.test(d.body ?? "")) {
    showCallout(
      "warn",
      "This post contains HTML, which the editor can't keep. Publishing from here would drop it, so edit this post in a text editor instead."
    );
  }
  dirty = false;
  setSaveState(d.updated ? `Draft saved ${time(d.updated)}` : d.file ? "Editing the live post. Changes stay private until you update it." : "");
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
    const title = fields.title.value.trim();
    const wasLive = !!doc?.file;
    doc = null;
    if (result.unchanged) {
      showCallout("ok", `Nothing had changed in “${title}”, so there was nothing to publish.`, [
        { label: "Back to all posts", onClick: showHome },
      ]);
    } else if (result.pushed) {
      showCallout("ok", wasLive ? `Your changes to “${title}” are published. They will be live in about a minute.` : `“${title}” is published. It will be live in about a minute.`, [
        { label: "Open the post", href: result.url },
        { label: "Watch the build", href: result.actions },
        { label: "Back to all posts", onClick: showHome },
      ]);
    } else {
      showCallout(
        "warn",
        `“${title}” is committed on this computer but couldn't be pushed to GitHub, so it isn't live yet. Run git push in the site folder to finish.\n\n${result.pushError}`,
        [{ label: "Back to all posts", onClick: showHome }]
      );
    }
    setSaveState("");
    // The post is done; leave it readable but not editable until reopened.
    $("write").classList.add("done");
    fields.title.readOnly = true;
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

// ---- Toolbar ----
const commands = {
  bold: (c) => c.toggleBold(),
  italic: (c) => c.toggleItalic(),
  h2: (c) => c.toggleHeading({ level: 2 }),
  h3: (c) => c.toggleHeading({ level: 3 }),
  quote: (c) => c.toggleBlockquote(),
  bullets: (c) => c.toggleBulletList(),
  numbers: (c) => c.toggleOrderedList(),
};
function setLink() {
  const previous = editor.getAttributes("link").href ?? "";
  const href = window.prompt("Link address (leave empty to remove the link)", previous);
  if (href === null) return;
  if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
  else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
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
  if (cmd === "link") return setLink();
  if (cmd === "annotate") return annotate();
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
  };
  for (const b of document.querySelectorAll(".toolbar button[data-cmd]")) {
    if (b.dataset.cmd in active) b.setAttribute("aria-pressed", String(active[b.dataset.cmd]));
  }
}
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k" && !$("write").hidden) {
    e.preventDefault();
    setLink();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && !$("write").hidden) {
    e.preventDefault();
    saveDraft();
  }
});

// ---- Views ----
async function showHome() {
  await saveDraft();
  doc = null;
  $("write").hidden = true;
  $("home").hidden = false;
  history.replaceState(null, "", "/");
  const { drafts, posts } = await api("GET", "/api/list");

  const draftList = $("draft-list");
  draftList.replaceChildren(
    ...drafts.map((d) => {
      const li = document.createElement("li");
      const open = Object.assign(document.createElement("button"), { type: "button", className: "doc-link", textContent: d.title });
      open.addEventListener("click", () => openDraft(d.id));
      const info = Object.assign(document.createElement("span"), {
        className: "muted",
        textContent: `${d.file ? "Edits to a live post · " : ""}saved ${d.updated ? new Date(d.updated).toLocaleString() : ""}`,
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
      li.append(open, Object.assign(document.createElement("span"), { className: "muted", textContent: p.date + (p.draft ? " · hidden draft" : "") }));
      return li;
    })
  );
  if (!posts.length) postList.innerHTML = '<li class="muted">Nothing published yet.</li>';
}

function showWrite(d) {
  $("home").hidden = true;
  $("write").hidden = false;
  $("write").classList.remove("done");
  fields.title.readOnly = false;
  editor.setEditable(true);
  $("publish").hidden = false;
  $("publish-hint").hidden = false;
  fill(d);
  if (!d.meta?.title) fields.title.focus();
  else editor.commands.focus("end");
}

async function openDraft(id) {
  showWrite(await api("GET", `/api/draft?id=${encodeURIComponent(id)}`));
}
async function openPost(file) {
  showWrite(await api("GET", `/api/post?file=${encodeURIComponent(file)}`));
}

$("new-post").addEventListener("click", () => showWrite({ id: null, file: null, meta: {}, body: "" }));
$("back").addEventListener("click", showHome);
// Autosave runs a moment after typing stops; warn if the page closes inside that gap.
window.addEventListener("beforeunload", (e) => {
  if (dirty) e.preventDefault();
});

showHome();
