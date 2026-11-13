// The publish panel: the second, deliberate step before anything goes live.
// It lists what will go out, any warnings and, for something already live,
// what changed, so one stray click never publishes.
import { renderDiff } from "./textdiff.js";

const $ = (id) => document.getElementById(id);
let confirmAction = null;

export function initPublishPanel() {
  const panel = $("publish-panel");
  $("publish-cancel").addEventListener("click", () => panel.close());
  $("publish-confirm").addEventListener("click", () => {
    const run = confirmAction;
    confirmAction = null;
    panel.close();
    run?.();
  });
  // A click on the shaded page beside the panel closes it, as Not yet does.
  panel.addEventListener("click", (e) => {
    if (e.target === panel) panel.close();
  });
}

// rows: [label, value] pairs; empty values are left out.
// warnings: sentences shown above the summary.
// changes: { before, after } for something already live.
export function openPublishPanel({ title, what, rows = [], warnings = [], changes, confirmLabel, onConfirm }) {
  $("publish-panel-title").textContent = title;
  $("publish-what").textContent = what ?? "";
  $("publish-what").hidden = !what;

  const warn = $("publish-warnings");
  warn.replaceChildren(...warnings.filter(Boolean).map((w) => Object.assign(document.createElement("p"), { textContent: w })));
  warn.hidden = !warn.childElementCount;

  const list = $("publish-summary");
  list.replaceChildren();
  for (const [label, value] of rows) {
    if (value === undefined || value === null || value === "") continue;
    const row = document.createElement("div");
    row.append(Object.assign(document.createElement("dt"), { textContent: label }), Object.assign(document.createElement("dd"), { textContent: value }));
    list.append(row);
  }
  list.hidden = !list.childElementCount;

  const box = $("publish-changes");
  box.hidden = !changes;
  if (changes) {
    const same = changes.before.trim() === changes.after.trim();
    $("publish-diff-wrap").hidden = same;
    $("publish-diff-wrap").open = false;
    const sum = same ? "" : renderDiff($("publish-diff"), changes.before, changes.after);
    $("publish-changes-sum").textContent = same ? "The text is the same as on the site." : /removed|added/.test(sum) ? `Text: ${sum}` : sum;
  }

  $("publish-confirm").textContent = confirmLabel;
  confirmAction = onConfirm;
  $("publish-panel").showModal();
  // Start on Not yet, so a stray Enter or Space closes the panel instead of publishing.
  $("publish-cancel").focus();
}
