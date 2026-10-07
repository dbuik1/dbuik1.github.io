// The Image, Footnote and Cite dialogs.
import { balanced } from "./notes.js";

const $ = (id) => document.getElementById(id);
let api;
let library = []; // [{ key, title, author, year, html }]

export function initDialogs(apiFn) {
  api = apiFn;
  for (const b of document.querySelectorAll("dialog [data-close]")) {
    b.addEventListener("click", () => b.closest("dialog").close());
  }
  initImage();
  initNote();
  initCite();
}

export async function loadLibrary() {
  library = (await api("GET", "/api/references")).entries;
  return library;
}

// A short label for a citation in the editor, e.g. "Calvin 1960, p. 23".
export function citationLabel(key, locator) {
  const e = library.find((x) => x.key === key);
  const base = e ? [e.author, e.year].filter(Boolean).join(" ") || e.title || key : `@${key} (not in library)`;
  return locator ? `${base}, ${locator}` : base;
}

// ---- Image ----

let imageDone = null;
let imageFile = null;
let imageAttrs = null;

const readAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

function setImageFile(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type)) {
    $("image-problem").textContent = "Use a JPEG, PNG, WebP, AVIF or GIF image.";
    return;
  }
  imageFile = file;
  $("image-problem").textContent = "";
  const preview = $("image-preview");
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  $("image-drop-text").textContent = `${file.name} · choose another`;
  $("image-alt").focus();
}

function initImage() {
  $("image-file").addEventListener("change", (e) => setImageFile(e.target.files[0]));
  const zone = $("image-drop");
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    setImageFile(e.dataTransfer.files[0]);
  });
  $("image-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alt = $("image-alt").value.trim();
    if (!imageFile && !imageAttrs?.src) return ($("image-problem").textContent = "Choose an image first.");
    if (!alt) return ($("image-problem").textContent = "Describe the image for people who can't see it.");
    const button = $("image-save");
    button.disabled = true;
    try {
      let src = imageAttrs?.src;
      if (imageFile) {
        button.textContent = "Saving…";
        src = (await api("POST", "/api/image", { name: imageFile.name, type: imageFile.type, data: await readAsBase64(imageFile) })).src;
      }
      // Close first: closing returns focus to the toolbar, and the insert then puts it back in the text.
      $("image-dialog").close();
      imageDone?.({ src, alt, caption: $("image-caption").value.trim() });
    } catch (err) {
      $("image-problem").textContent = err.message;
    } finally {
      button.disabled = false;
      button.textContent = imageAttrs ? "Save changes" : "Insert image";
    }
  });
}

/** Opens the image dialog, optionally with a file already chosen (pasted or dropped). */
export function openImage(attrs, done, file = null) {
  imageDone = done;
  imageAttrs = attrs;
  imageFile = null;
  $("image-title").textContent = attrs ? "Edit image" : "Insert an image";
  $("image-save").textContent = attrs ? "Save changes" : "Insert image";
  $("image-alt").value = attrs?.alt ?? "";
  $("image-caption").value = attrs?.caption ?? "";
  $("image-problem").textContent = "";
  $("image-file").value = "";
  const preview = $("image-preview");
  preview.hidden = !attrs?.src;
  if (attrs?.src) preview.src = attrs.src;
  $("image-drop-text").textContent = attrs?.src ? "Choose a different image" : "Drop an image here, or choose a file";
  $("image-dialog").showModal();
  if (file) setImageFile(file);
}

// ---- Footnote ----

let noteDone = null;

function initNote() {
  $("note-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("note-text").value.replace(/\s*\n\s*/g, " ").trim();
    if (!text) return ($("note-problem").textContent = "Write the note first.");
    if (!balanced(text)) return ($("note-problem").textContent = "Square brackets in a note must come in pairs.");
    $("note-dialog").close();
    noteDone?.({ text });
  });
  $("note-remove").addEventListener("click", () => {
    $("note-dialog").close();
    noteDone?.(null);
  });
}

export function openFootnote(attrs, done) {
  noteDone = done;
  $("note-text").value = attrs?.text ?? "";
  $("note-problem").textContent = "";
  $("note-save").textContent = attrs ? "Save note" : "Add footnote";
  $("note-remove").hidden = !attrs;
  $("note-dialog").showModal();
  $("note-text").focus();
}

// ---- Cite ----

let citeDone = null;
let chosen = null;
let previewTimer = null;

const LABELS = { "p.": /^pp?\.?\s*/, "chap.": /^(chap|ch)\.?\s*/, "sec.": /^(sec|§)\.?\s*/, "para.": /^(para|¶)\.?\s*/ };

function locatorText() {
  const value = $("cite-locator").value.trim();
  const label = $("cite-label").value;
  return value && label ? `${label} ${value}` : "";
}

function drawResults() {
  const q = $("cite-search").value.trim().toLowerCase();
  const list = $("cite-results");
  const matches = library
    .filter((e) => !q || `${e.key} ${e.author} ${e.title} ${e.year}`.toLowerCase().includes(q))
    .slice(0, 50);
  list.replaceChildren(
    ...matches.map((e) => {
      const li = document.createElement("li");
      const b = Object.assign(document.createElement("button"), { type: "button", className: "result" });
      b.innerHTML = e.html || e.title || e.key;
      b.setAttribute("aria-pressed", String(chosen === e.key));
      b.addEventListener("click", () => choose(e.key));
      li.append(b);
      return li;
    })
  );
  if (!library.length) list.innerHTML = '<li class="muted">Your library is empty. Add a source below.</li>';
  else if (!matches.length) list.innerHTML = '<li class="muted">Nothing matches. Add it below if it\'s new.</li>';
}

function choose(key) {
  chosen = key;
  const e = library.find((x) => x.key === key);
  const box = $("cite-chosen");
  box.hidden = false;
  box.innerHTML = "";
  const label = Object.assign(document.createElement("p"), { className: "picker-step", textContent: `Citing @${key}` });
  const entry = document.createElement("div");
  entry.innerHTML = e?.html ?? "";
  box.append(label, entry);
  $("cite-save").disabled = false;
  drawResults();
  updatePreview();
  $("cite-locator").focus();
}

function updatePreview() {
  clearTimeout(previewTimer);
  if (!chosen) return;
  previewTimer = setTimeout(async () => {
    const p = await api("POST", "/api/references/preview", { key: chosen, locator: locatorText() }).catch(() => null);
    const el = $("cite-preview");
    el.innerHTML = "";
    if (!p) return;
    const lead = Object.assign(document.createElement("span"), { className: "muted", textContent: "First note: " });
    const body = document.createElement("span");
    body.innerHTML = p.full;
    el.append(lead, body);
  }, 200);
}

function initCite() {
  $("cite-search").addEventListener("input", drawResults);
  $("cite-label").addEventListener("change", () => {
    $("cite-locator").disabled = !$("cite-label").value;
    updatePreview();
  });
  $("cite-locator").addEventListener("input", updatePreview);
  $("cite-source-add").addEventListener("click", async () => {
    const input = $("cite-source-input");
    const button = $("cite-source-add");
    button.disabled = true;
    button.textContent = "Adding…";
    try {
      const result = await api("POST", "/api/references/add", { input: input.value });
      library = result.entries;
      input.value = "";
      $("cite-add").open = false;
      $("cite-search").value = "";
      choose(result.added[0]);
    } catch (e) {
      $("cite-preview").textContent = e.message;
    } finally {
      button.disabled = false;
      button.textContent = "Add";
    }
  });
  $("cite-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!chosen) return;
    $("cite-dialog").close();
    citeDone?.({ key: chosen, locator: locatorText() });
  });
  $("cite-remove").addEventListener("click", () => {
    $("cite-dialog").close();
    citeDone?.(null);
  });
}

export async function openCite(attrs, done) {
  citeDone = done;
  chosen = null;
  $("cite-search").value = "";
  $("cite-chosen").hidden = true;
  $("cite-preview").textContent = "";
  $("cite-save").disabled = true;
  $("cite-save").textContent = attrs ? "Save citation" : "Insert citation";
  $("cite-remove").hidden = !attrs;
  $("cite-label").value = "p.";
  $("cite-locator").value = "";
  $("cite-locator").disabled = false;
  if (attrs?.locator) {
    const match = Object.entries(LABELS).find(([, re]) => re.test(attrs.locator));
    // A bare number is a page, as on the site.
    $("cite-label").value = match ? match[0] : "p.";
    $("cite-locator").value = match ? attrs.locator.replace(match[1], "") : attrs.locator;
  }
  $("cite-dialog").showModal();
  await loadLibrary().catch(() => {});
  drawResults();
  if (attrs?.key) choose(attrs.key);
  else $("cite-search").focus();
}
