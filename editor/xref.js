// Cross-links: [[slug]], [[slug|text]] and [[slug#"exact words"|text]].
// Typing [[ or pressing Cross-link opens a picker for the post or project,
// and optionally the exact words in it to link to.
import { Node, InputRule } from "@tiptap/core";

const $ = (id) => document.getElementById(id);
const PATTERN = /^\[\[([a-z0-9][a-z0-9-]*)(?:#"([^"\n]+)")?(?:\|([^\]\n]+))?\]\]/;
const normalise = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export const xrefMarkdown = ({ slug, quote, text }) => `[[${slug}${quote ? `#"${quote}"` : ""}${text ? `|${text}` : ""}]]`;

let api;
let targets = [];
const titleOf = (slug) => targets.find((t) => t.slug === slug)?.title;

/** @param {{ onEdit: Function, onTrigger: Function }} options */
export const Xref = Node.create({
  name: "xref",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onEdit: () => {}, onTrigger: () => {} };
  },
  addAttributes() {
    return { slug: { default: "" }, quote: { default: "" }, text: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-xref]" }];
  },
  renderHTML({ node }) {
    return ["span", { "data-xref": "" }, xrefMarkdown(node.attrs)];
  },

  markdownTokenizer: {
    name: "xref",
    level: "inline",
    start: (src) => src.indexOf("[["),
    tokenize: (src) => {
      const m = src.match(PATTERN);
      if (!m) return undefined;
      return { type: "xref", raw: m[0], attributes: { slug: m[1], quote: m[2] ?? "", text: m[3] ?? "" } };
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode("xref", token.attributes, []);
  },
  renderMarkdown(node) {
    return xrefMarkdown(node.attrs);
  },

  addInputRules() {
    const { onTrigger } = this.options;
    return [
      new InputRule({
        find: /\[\[$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).run();
          setTimeout(() => onTrigger(), 0);
        },
      }),
    ];
  },

  addNodeView() {
    const { onEdit } = this.options;
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("span");
      dom.className = "editor-xref";
      dom.contentEditable = "false";
      dom.tabIndex = 0;
      dom.setAttribute("role", "button");
      let current = node;
      const draw = (n) => {
        const { slug, quote, text } = n.attrs;
        dom.textContent = text || titleOf(slug) || slug;
        dom.title = `Links to ${titleOf(slug) ?? slug}${quote ? `: “${quote}”` : ""}`;
        dom.classList.toggle("to-words", !!quote);
        dom.classList.toggle("missing", !!targets.length && !titleOf(slug));
      };
      const update = (attrs) => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        if (attrs === null) editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
        else editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, attrs), true)).run();
      };
      const open = () => onEdit({ ...current.attrs }, update);
      dom.addEventListener("click", open);
      dom.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
      draw(node);
      return {
        dom,
        update: (n) => {
          if (n.type.name !== "xref") return false;
          current = n;
          draw(n);
          return true;
        },
        stopEvent: () => true,
        ignoreMutation: () => true,
      };
    };
  },
});

// ---- Picker ----

let done = null;
let state = { slug: "", quote: "", ok: true };
let checkTimer = 0;

export async function loadTargets() {
  targets = await api("GET", "/api/xref/targets");
  return targets;
}

function drawTargets() {
  const q = $("xref-search").value.trim().toLowerCase();
  const list = $("xref-results");
  const shown = targets.filter((t) => !q || `${t.title} ${t.slug}`.toLowerCase().includes(q)).slice(0, 40);
  list.replaceChildren(
    ...shown.map((t) => {
      const li = document.createElement("li");
      const b = Object.assign(document.createElement("button"), { type: "button", className: "result" });
      b.textContent = t.title;
      const note = Object.assign(document.createElement("span"), {
        className: "muted",
        textContent: ` · ${t.kind === "project" ? "Project" : "Post"}${t.draft ? " · draft" : ""}`,
      });
      b.append(note);
      b.setAttribute("aria-pressed", String(state.slug === t.slug));
      b.addEventListener("click", () => choose(t.slug));
      li.append(b);
      return li;
    })
  );
  if (!shown.length) list.innerHTML = '<li class="muted">Nothing matches.</li>';
}

async function choose(slug, quote = "") {
  state = { slug, quote, ok: false };
  drawTargets();
  const t = await api("POST", "/api/xref/target", { slug });
  $("xref-step").hidden = false;
  $("xref-chosen-title").textContent = t.title;
  drawPassage(t.paragraphs);
  if (!$("xref-text").value) $("xref-text").placeholder = t.title;
  check();
}

function drawPassage(paragraphs) {
  const box = $("xref-passage");
  box.replaceChildren(
    ...paragraphs.map((para) => {
      const p = document.createElement("p");
      const at = state.quote ? normalise(para).indexOf(state.quote) : -1;
      if (at < 0) p.textContent = para;
      else {
        const mark = document.createElement("mark");
        mark.textContent = para.slice(at, at + state.quote.length);
        p.append(para.slice(0, at), mark, para.slice(at + state.quote.length));
      }
      return p;
    })
  );
  if (!paragraphs.length) box.innerHTML = '<p class="muted">This one has no text yet, so it can only be linked as a whole.</p>';
}

function check() {
  clearTimeout(checkTimer);
  const el = $("xref-state");
  checkTimer = setTimeout(async () => {
    const { problem } = await api("POST", "/api/xref/check", { slug: state.slug, quote: state.quote || undefined });
    state.ok = !problem;
    el.className = `phrase-state ${problem ? "bad" : "good"}`;
    el.textContent = problem ?? (state.quote ? `Links to “${state.quote}”.` : "Links to the whole page. Select words above to link to just them.");
    $("xref-save").disabled = !!problem;
    $("xref-clear-words").hidden = !state.quote;
  }, 120);
}

export function initXref(apiFn) {
  api = apiFn;
  $("xref-search").addEventListener("input", drawTargets);
  const box = $("xref-passage");
  const take = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !box.contains(sel.anchorNode) || !box.contains(sel.focusNode)) return;
    const text = normalise(sel.toString());
    if (!text) return;
    if (text.includes('"')) {
      $("xref-state").className = "phrase-state bad";
      $("xref-state").textContent = "Words containing a double quote mark can't be linked. Select a part without one.";
      return;
    }
    state.quote = text;
    sel.removeAllRanges();
    const paras = [...box.querySelectorAll("p")].map((p) => p.textContent);
    drawPassage(paras);
    check();
  };
  box.addEventListener("mouseup", take);
  box.addEventListener("keyup", take);
  box.addEventListener("touchend", () => setTimeout(take, 0));
  $("xref-clear-words").addEventListener("click", () => {
    state.quote = "";
    drawPassage([...box.querySelectorAll("p")].map((p) => p.textContent));
    check();
  });
  $("xref-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.slug || !state.ok) return;
    $("xref-dialog").close();
    done?.({ slug: state.slug, quote: state.quote, text: $("xref-text").value.trim().replace(/[\]|]/g, "") });
  });
  $("xref-remove").addEventListener("click", () => {
    $("xref-dialog").close();
    done?.(null);
  });
}

/** Opens the picker. `attrs` is an existing link, or `{ text }` from the selection for a new one. */
export async function openXref(attrs, onDone, existing = false) {
  done = onDone;
  state = { slug: "", quote: "", ok: false };
  $("xref-search").value = "";
  $("xref-text").value = attrs?.text ?? "";
  $("xref-text").placeholder = "The linked page's title";
  $("xref-step").hidden = true;
  $("xref-state").textContent = "";
  $("xref-save").disabled = true;
  $("xref-save").textContent = existing ? "Save link" : "Insert link";
  $("xref-remove").hidden = !existing;
  $("xref-dialog").showModal();
  await loadTargets().catch(() => {});
  drawTargets();
  if (attrs?.slug) choose(attrs.slug, attrs.quote ?? "");
  else $("xref-search").focus();
}
