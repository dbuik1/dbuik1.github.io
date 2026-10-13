// The source panel on a commentary, and the Excerpt and Moment dialogs.
import { seconds, wordCount } from "./clips.js";

const $ = (id) => document.getElementById(id);
let api;
let onChange = () => {};

// What the commentary responds to, and the text looked up from it to quote from.
let source = {};
let paragraphs = [];

// Fields that belong to one address; changing the address clears them.
const DERIVED = ["archived", "archivedOn", "image", "key", "doi", "text"];
const FIELDS = { title: "source-title", type: "source-type", author: "source-author", site: "source-site", published: "source-published", text: "source-text" };

// Quotes longer than this get a reminder to quote only what is responded to.
export const LONG_QUOTE = 100;

export function initCommentary(apiFn, types, changed) {
  api = apiFn;
  onChange = changed;
  const type = $("source-type");
  type.append(new Option("Choose…", ""), ...types.map((t) => new Option(t.name, t.slug)));

  $("source-url").addEventListener("input", (e) => {
    const url = e.target.value.trim();
    if (url !== source.url) {
      for (const k of DERIVED) delete source[k];
      paragraphs = [];
    }
    source.url = url;
    onChange();
  });
  $("source-form").addEventListener("submit", (e) => {
    e.preventDefault();
    lookUp();
  });
  for (const [key, id] of Object.entries(FIELDS)) {
    $(id).addEventListener("input", (e) => {
      source[key] = e.target.value;
      drawSummary();
      onChange();
    });
  }
  type.addEventListener("change", drawSummary);

  initExcerpt();
  initMoment();
}

export function setSource(s = {}, text = []) {
  source = { ...s };
  paragraphs = Array.isArray(text) ? [...text] : [];
  $("source-url").value = source.url ?? "";
  for (const [key, id] of Object.entries(FIELDS)) $(id).value = source[key] ?? "";
  setState("");
  $("source-details").open = !!source.url && !source.title;
  drawSummary();
}

export const getSource = () => ({ source: { ...source }, sourceText: [...paragraphs] });

/** Videos and podcasts can point to a moment; other sources quote words. */
const timed = () => ["video", "podcast"].includes(source.type);

function drawSummary() {
  $("source-summary").textContent = source.title ? `On “${source.title}”${source.site ? `, ${source.site}` : ""}` : "Source details";
  $("source-text-field").hidden = source.type !== "post";
  $("moment-button").hidden = !timed();
}

function setState(text, tone = "") {
  const el = $("source-state");
  el.className = `phrase-state ${tone}`;
  el.textContent = text;
}

async function lookUp() {
  const url = $("source-url").value.trim();
  if (!url) return $("source-url").focus();
  const button = $("source-lookup");
  button.disabled = true;
  setState("Looking it up…");
  try {
    const found = await api("POST", "/api/source/lookup", { url });
    if ($("source-url").value.trim() !== url) return;
    source = { ...found.source };
    paragraphs = found.paragraphs ?? [];
    $("source-url").value = source.url;
    for (const [key, id] of Object.entries(FIELDS)) $(id).value = source[key] ?? "";
    $("source-details").open = !source.title;
    drawSummary();
    onChange();
    setState("Found. Saving a copy at the Internet Archive…");
    if (!$("title").value.trim()) $("title").focus();
    keepCopy(source.url);
  } catch (e) {
    setState(`Couldn't look it up: ${e.message} Fill in the details yourself.`, "bad");
    $("source-details").open = true;
    $("source-title").focus();
  } finally {
    button.disabled = false;
  }
}

async function keepCopy(url) {
  try {
    const copy = await api("POST", "/api/source/archive", { url });
    if (source.url !== url) return;
    if (copy.archived) {
      Object.assign(source, { archived: copy.archived, archivedOn: copy.archivedOn });
      onChange();
      setState("Copy saved at the Internet Archive.", "good");
    } else {
      setState("The Internet Archive couldn't save a copy now. Publishing tries again.");
    }
  } catch {
    if (source.url === url) setState("The Internet Archive couldn't save a copy now. Publishing tries again.");
  }
}

// ---- Excerpt ----

let excerptDone = null;
const squash = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();

function initExcerpt() {
  const passage = $("excerpt-passage");
  const take = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !passage.contains(sel.anchorNode) || !passage.contains(sel.focusNode)) return;
    const text = sel.toString().replace(/[ \t]+/g, " ").replace(/\s*\n\s*\n\s*/g, "\n\n").trim();
    if (!text) return;
    $("excerpt-text").value = text;
    sel.removeAllRanges();
    checkExcerpt();
  };
  passage.addEventListener("mouseup", take);
  passage.addEventListener("keyup", take);
  passage.addEventListener("touchend", () => setTimeout(take, 0));
  $("excerpt-text").addEventListener("input", checkExcerpt);
  $("excerpt-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("excerpt-text").value.trim();
    if (!text) return;
    excerptDone?.({ text, start: "", end: "" });
    $("excerpt-dialog").close();
  });
}

function checkExcerpt() {
  const text = $("excerpt-text").value;
  const n = wordCount(text);
  const notes = [];
  let tone = "";
  if (n && paragraphs.length && !squash(paragraphs.join(" ")).includes(squash(text))) {
    notes.push("These words aren't in the source's text as looked up, so the link to them may not find them. Check they're exact.");
    tone = "bad";
  }
  if (n > LONG_QUOTE) notes.push(`${n} words. Quote only what you respond to.`);
  $("excerpt-state").className = `phrase-state ${tone}`;
  $("excerpt-state").textContent = notes.join(" ");
}

export function openExcerpt(attrs, done) {
  excerptDone = done;
  $("excerpt-title").textContent = attrs ? "Edit the excerpt" : "Quote from the source";
  $("excerpt-save").textContent = attrs ? "Save" : "Insert excerpt";
  const passage = $("excerpt-passage");
  passage.replaceChildren(...paragraphs.map((p) => Object.assign(document.createElement("p"), { textContent: p })));
  $("excerpt-pick").hidden = !paragraphs.length;
  $("excerpt-text").value = attrs?.text ?? "";
  checkExcerpt();
  $("excerpt-dialog").showModal();
  passage.scrollTop = 0;
  if (!paragraphs.length) $("excerpt-text").focus();
}

// ---- Moment ----

let momentDone = null;

function initMoment() {
  for (const id of ["moment-start", "moment-end"]) $(id).addEventListener("input", checkMoment);
  $("moment-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!checkMoment()) return;
    momentDone?.({ start: $("moment-start").value.trim(), end: $("moment-end").value.trim(), text: $("moment-text").value.trim() });
    $("moment-dialog").close();
  });
}

function checkMoment() {
  const startText = $("moment-start").value.trim();
  const endText = $("moment-end").value.trim();
  const start = seconds(startText);
  const end = seconds(endText);
  let problem = "";
  if (startText && start === null) problem = "Write the time like 12:34 or 1:02:03.";
  else if (endText && (end === null || (start !== null && end <= start))) problem = "The end must be a time after the start.";
  $("moment-state").className = `phrase-state ${problem ? "bad" : ""}`;
  $("moment-state").textContent = problem;
  return !!startText && !problem;
}

export function openMoment(attrs, done) {
  momentDone = done;
  $("moment-save").textContent = attrs ? "Save" : "Insert moment";
  $("moment-start").value = attrs?.start ?? "";
  $("moment-end").value = attrs?.end ?? "";
  $("moment-text").value = attrs?.text ?? "";
  checkMoment();
  $("moment-dialog").showModal();
  $("moment-start").focus();
}
