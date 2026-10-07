import { Node } from "@tiptap/core";

// Footnotes (^[text]) and citations ([@key] or [@key, p. 23]) are both notes on
// the site, numbered together, so the editor shows them with one shared counter.

// The length of ^[ ... ] at the start of src, matching nested brackets, or 0.
function noteLength(src) {
  if (!src.startsWith("^[")) return 0;
  let depth = 0;
  for (let i = 1; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") i++;
    else if (c === "\n" && src[i + 1] === "\n") return 0;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return i + 1;
  }
  return 0;
}

export const balanced = (text) => {
  let depth = 0;
  for (const c of text.replace(/\\./g, "")) {
    if (c === "[") depth++;
    else if (c === "]" && --depth < 0) return false;
  }
  return depth === 0;
};

function inlineView(name, render, onEdit) {
  return ({ node, getPos, editor }) => {
    const dom = document.createElement("span");
    dom.className = `editor-note editor-${name}`;
    dom.contentEditable = "false";
    dom.tabIndex = 0;
    dom.setAttribute("role", "button");
    let current = node;
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
    render(dom, node);
    return {
      dom,
      update: (n) => {
        if (n.type.name !== name) return false;
        current = n;
        render(dom, n);
        return true;
      },
      stopEvent: () => true,
      ignoreMutation: () => true,
    };
  };
}

/** @param {{ onEdit: (attrs: object, update: (attrs: object|null) => void) => void }} options */
export const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onEdit: () => {} };
  },
  addAttributes() {
    return { text: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-footnote]" }];
  },
  renderHTML({ node }) {
    return ["span", { "data-footnote": "" }, `^[${node.attrs.text}]`];
  },

  markdownTokenizer: {
    name: "footnote",
    level: "inline",
    start: (src) => src.indexOf("^["),
    tokenize: (src) => {
      const n = noteLength(src);
      if (!n) return undefined;
      return { type: "footnote", raw: src.slice(0, n), attributes: { text: src.slice(2, n - 1) } };
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode("footnote", token.attributes, []);
  },
  renderMarkdown(node) {
    return `^[${node.attrs.text}]`;
  },

  addNodeView() {
    return inlineView(
      "footnote",
      (dom, n) => {
        dom.title = n.attrs.text;
        dom.setAttribute("aria-label", `Footnote: ${n.attrs.text}`);
      },
      this.options.onEdit
    );
  },
});

const CITATION = /^\[@([^\s,;\]]+)\s*(?:,\s*([^\]\n;]*))?\]/;

/**
 * @param {{ onEdit: Function, label: (key: string, locator: string) => string }} options
 */
export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onEdit: () => {}, label: (key) => key };
  },
  addAttributes() {
    return { key: { default: "" }, locator: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-citation]" }];
  },
  renderHTML({ node }) {
    return ["span", { "data-citation": "" }, citationMarkdown(node.attrs)];
  },

  markdownTokenizer: {
    name: "citation",
    level: "inline",
    start: (src) => src.indexOf("[@"),
    tokenize: (src) => {
      const m = src.match(CITATION);
      if (!m) return undefined;
      return { type: "citation", raw: m[0], attributes: { key: m[1], locator: (m[2] ?? "").trim() } };
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode("citation", token.attributes, []);
  },
  renderMarkdown(node) {
    return citationMarkdown(node.attrs);
  },

  addNodeView() {
    const { label } = this.options;
    return inlineView(
      "citation",
      (dom, n) => {
        const text = label(n.attrs.key, n.attrs.locator);
        dom.dataset.label = text;
        dom.title = text;
        dom.setAttribute("aria-label", `Citation: ${text}`);
      },
      this.options.onEdit
    );
  },
});

export const citationMarkdown = ({ key, locator }) => `[@${key}${locator ? `, ${locator}` : ""}]`;
