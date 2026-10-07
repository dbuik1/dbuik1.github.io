// Raw HTML, kept exactly as written. Block HTML (a <div>, <details>, <iframe>
// on its own lines) becomes a card and inline HTML (<abbr>, <span>…) a chip;
// both show a live preview and open a code box when clicked. Without these the
// editor would run HTML through its own schema and drop every tag it doesn't know.
import { Node } from "@tiptap/core";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";

const $ = (id) => document.getElementById(id);

// Plain <sup> and <sub> are editable formatting; everything else stays as written.
const isFormatting = (src) => /^<(sup|sub)>/i.test(src);
const VOID = new Set(["br", "img", "wbr", "hr", "input", "source"]);

// A preview must not run anything: scripts and on* handlers are removed.
function preview(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  for (const el of t.content.querySelectorAll("*")) {
    if (/^(script|style)$/i.test(el.tagName)) el.remove();
    for (const a of [...el.attributes]) if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
  }
  return t.content;
}

// The length of the inline HTML element starting src: <tag …>…</tag> with
// nesting, a void or self-closed tag, or a comment. 0 if src doesn't start one.
function inlineLength(src) {
  if (src.startsWith("<!--")) {
    const end = src.indexOf("-->");
    return end >= 0 ? end + 3 : 0;
  }
  const open = src.match(/^<([A-Za-z][\w-]*)(?:\s[^<>]*)?>/);
  if (!open) return 0;
  const tag = open[1].toLowerCase();
  if (VOID.has(tag) || open[0].endsWith("/>")) return open[0].length;
  const re = new RegExp(`<(/?)${tag}(?:\\s[^<>]*)?>`, "gi");
  re.lastIndex = open[0].length;
  let depth = 1;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[0].endsWith("/>")) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return 0;
}

let editing = null; // { update, kind }

function openCode(html, update, kind) {
  editing = { update, kind };
  $("html-title").textContent = kind === "block" ? "HTML block" : "Inline HTML";
  $("html-code").value = html;
  $("html-code").rows = kind === "block" ? 10 : 3;
  drawPreview();
  $("html-dialog").showModal();
  $("html-code").focus();
}

function drawPreview() {
  $("html-preview").replaceChildren(preview($("html-code").value));
}

export function initHtml() {
  $("html-code").addEventListener("input", drawPreview);
  $("html-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = $("html-code").value.trim();
    $("html-dialog").close();
    editing?.update(value ? { html: value } : null);
  });
  $("html-remove").addEventListener("click", () => {
    $("html-dialog").close();
    editing?.update(null);
  });
}

function view(kind) {
  return ({ node, getPos, editor }) => {
    const dom = document.createElement(kind === "block" ? "div" : "span");
    dom.className = `editor-html editor-html-${kind}`;
    dom.contentEditable = "false";
    dom.tabIndex = 0;
    dom.setAttribute("role", "button");
    dom.setAttribute("aria-label", `${kind === "block" ? "HTML block" : "Inline HTML"}. Press Enter to edit the code.`);
    let current = node;
    const update = (attrs) => {
      const pos = getPos();
      if (typeof pos !== "number") return;
      if (attrs === null) editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
      else editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, attrs), true)).run();
    };
    const draw = (n) => {
      const body = document.createElement(kind === "block" ? "div" : "span");
      body.className = "editor-html-preview";
      body.append(preview(n.attrs.html));
      // An opening or closing tag on its own, or an empty element, shows its code instead.
      if (!body.textContent.trim() && !body.querySelector("img, iframe, video, svg, hr")) {
        body.textContent = n.attrs.html;
        body.classList.add("is-code");
      }
      if (kind === "block") {
        const label = Object.assign(document.createElement("span"), { className: "editor-html-label", textContent: "HTML · click to edit" });
        dom.replaceChildren(label, body);
      } else dom.replaceChildren(body);
      dom.title = n.attrs.html;
    };
    const open = (e) => {
      e?.preventDefault();
      openCode(current.attrs.html, update, kind);
    };
    dom.addEventListener("click", open);
    dom.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") open(e);
    });
    draw(node);
    return {
      dom,
      update: (n) => {
        if (n.type !== current.type) return false;
        // Redrawing on a selection change would replace the element under the
        // pointer between mousedown and click, and the click would be lost.
        const same = n.attrs.html === current.attrs.html;
        current = n;
        if (!same) draw(n);
        return true;
      },
      stopEvent: (e) => e.type === "click" || e.type === "keydown",
      ignoreMutation: () => true,
    };
  };
}

export const HtmlBlock = Node.create({
  name: "htmlBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  // Takes over Markdown's own block HTML token, so its boundaries match the site's.
  markdownTokenName: "html",

  addAttributes() {
    return { html: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-html-block]", getAttrs: (el) => ({ html: el.textContent }) }];
  },
  renderHTML({ node }) {
    return ["div", { "data-html-block": "" }, node.attrs.html];
  },
  parseMarkdown(token, helpers) {
    if (!token.block) return null;
    const html = (token.raw ?? token.text ?? "").trim();
    return html ? helpers.createNode("htmlBlock", { html }, []) : null;
  },
  renderMarkdown(node) {
    return node.attrs.html;
  },
  addNodeView() {
    return view("block");
  },
});

export const HtmlInline = Node.create({
  name: "htmlInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { html: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-html-inline]", getAttrs: (el) => ({ html: el.textContent }) }];
  },
  renderHTML({ node }) {
    return ["span", { "data-html-inline": "" }, node.attrs.html];
  },
  markdownTokenizer: {
    name: "htmlInline",
    level: "inline",
    start: (src) => {
      const re = /<(!--|[A-Za-z][\w-]*)/g;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        if (!isFormatting(src.slice(m.index))) return m.index;
      }
      return -1;
    },
    tokenize: (src) => {
      if (isFormatting(src)) return undefined;
      const n = inlineLength(src);
      if (!n) return undefined;
      return { type: "htmlInline", raw: src.slice(0, n), attributes: { html: src.slice(0, n) } };
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode("htmlInline", token.attributes, []);
  },
  renderMarkdown(node) {
    return node.attrs.html;
  },
  addNodeView() {
    return view("inline");
  },
});

// Superscript and subscript are written as <sup> and <sub>, which the site renders as is.
export const Sup = Superscript.extend({
  renderMarkdown: (node, h) => `<sup>${h.renderChildren(node)}</sup>`,
});
export const Sub = Subscript.extend({
  renderMarkdown: (node, h) => `<sub>${h.renderChildren(node)}</sub>`,
});

// Inserting a new block from the toolbar.
export function newHtmlBlock(onDone) {
  openCode("", (attrs) => attrs && onDone(attrs), "block");
}
