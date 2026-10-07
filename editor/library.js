// The Reference library screen.
const $ = (id) => document.getElementById(id);
let api;
let state = { entries: [], unpublished: false };

function callout(kind, text, actions = []) {
  const c = $("library-callout");
  c.className = `callout callout-${kind}`;
  const p = Object.assign(document.createElement("p"), { textContent: text });
  c.replaceChildren(p);
  if (actions.length) {
    const row = Object.assign(document.createElement("p"), { className: "callout-actions" });
    for (const a of actions) {
      const el = a.href
        ? Object.assign(document.createElement("a"), { href: a.href, target: "_blank", rel: "noopener", textContent: a.label })
        : Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: a.label });
      if (!a.href) el.addEventListener("click", a.onClick);
      row.append(el);
    }
    c.append(row);
  }
  c.hidden = false;
}

const publishAction = () => ({ label: "Publish the library now", onClick: publishLibrary });

function apply(next) {
  state = next;
  $("library-publish-group").hidden = !state.unpublished;
  $("library-state").textContent = state.unpublished
    ? "Changes are saved on this computer. They go live when you publish the library or a post."
    : `${state.entries.length} ${state.entries.length === 1 ? "source" : "sources"}, all live`;
  draw();
}

function draw() {
  const q = $("library-filter").value.trim().toLowerCase();
  const list = $("source-list");
  const shown = state.entries.filter((e) => !q || `${e.key} ${e.author} ${e.title} ${e.year}`.toLowerCase().includes(q));
  list.replaceChildren(...shown.map(row));
  if (!state.entries.length) list.innerHTML = '<li class="muted">No sources yet. Add one above.</li>';
  else if (!shown.length) list.innerHTML = '<li class="muted">Nothing matches.</li>';
}

function row(entry) {
  const li = document.createElement("li");
  const text = document.createElement("div");
  text.className = "source-entry";
  text.innerHTML = entry.html || `<span class="anno-problem">This entry couldn't be formatted.</span>`;
  const meta = document.createElement("p");
  meta.className = "source-meta";
  const key = Object.assign(document.createElement("code"), { textContent: `@${entry.key}` });
  const edit = Object.assign(document.createElement("button"), { type: "button", className: "link-button subtle", textContent: "Edit" });
  const del = Object.assign(document.createElement("button"), { type: "button", className: "link-button subtle", textContent: "Delete" });
  meta.append(key, edit, del);
  li.append(text, meta);

  edit.addEventListener("click", () => {
    if (li.querySelector("form")) return;
    const form = document.createElement("form");
    form.className = "source-edit";
    const area = Object.assign(document.createElement("textarea"), { value: entry.raw, rows: Math.min(14, entry.raw.split("\n").length + 1) });
    area.setAttribute("aria-label", `BibTeX for @${entry.key}`);
    const save = Object.assign(document.createElement("button"), { type: "submit", className: "primary", textContent: "Save" });
    const cancel = Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: "Cancel" });
    cancel.addEventListener("click", () => form.remove());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        apply(await api("POST", "/api/references/update", { key: entry.key, raw: area.value }));
        callout("ok", `Saved @${entry.key}.`, [publishAction()]);
      } catch (err) {
        callout("error", err.message);
      }
    });
    const actions = Object.assign(document.createElement("p"), { className: "callout-actions" });
    actions.append(save, cancel);
    form.append(area, actions);
    li.append(form);
    area.focus();
  });

  del.addEventListener("click", async () => {
    if (!confirm(`Delete @${entry.key} from the library?`)) return;
    try {
      apply(await api("POST", "/api/references/delete", { key: entry.key }));
      callout("ok", `Deleted @${entry.key}.`, [publishAction()]);
    } catch (err) {
      callout("error", err.message);
    }
  });
  return li;
}

async function publishLibrary() {
  const button = $("library-publish");
  button.disabled = true;
  try {
    const r = await api("POST", "/api/references/publish");
    apply(await api("GET", "/api/references"));
    if (r.unchanged) callout("ok", "The library was already live.");
    else if (r.pushed) callout("ok", "The library is published.", [{ label: "Watch the build", href: r.actions }]);
    else callout("warn", `The library is committed on this computer but couldn't be pushed. Run git push in the site folder to finish.\n\n${r.pushError}`);
  } catch (err) {
    callout("error", err.message);
  } finally {
    button.disabled = false;
  }
}

async function add(input, replace) {
  const button = $("source-add");
  button.disabled = true;
  button.textContent = replace ? "Importing…" : "Adding…";
  try {
    const r = await api("POST", "/api/references/add", { input, replace });
    apply(r);
    $("source-input").value = "";
    const parts = [];
    if (r.added.length) parts.push(`Added ${r.added.map((k) => `@${k}`).join(", ")}.`);
    if (r.updated.length) parts.push(`Updated ${r.updated.map((k) => `@${k}`).join(", ")}.`);
    callout("ok", `${parts.join(" ") || "Nothing new to add."} Cite with the Cite button while writing.`, r.added.length || r.updated.length ? [publishAction()] : []);
  } catch (err) {
    callout("error", err.message);
  } finally {
    button.disabled = false;
    button.textContent = "Add";
  }
}

export function initLibrary(apiFn) {
  api = apiFn;
  $("add-source").addEventListener("submit", (e) => {
    e.preventDefault();
    add($("source-input").value, false);
  });
  $("source-input").addEventListener("input", (e) => {
    // Grow for pasted BibTeX, stay one line for a DOI.
    e.target.rows = Math.min(12, Math.max(1, e.target.value.split("\n").length));
  });
  $("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    add(await file.text(), true);
    e.target.value = "";
  });
  $("library-filter").addEventListener("input", draw);
  $("library-publish").addEventListener("click", publishLibrary);
}

export async function showLibrary() {
  $("library-callout").hidden = true;
  apply(await api("GET", "/api/references"));
}
