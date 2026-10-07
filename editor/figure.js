import { Node } from "@tiptap/core";

// An image on its own line: ![alt](src "caption"). The site turns it into a
// figure with the caption underneath.
const PATTERN = /^!\[((?:[^\]\\]|\\.)*)\]\((\S+?)(?:\s+"((?:[^"\\]|\\.)*)")?\)[ \t]*(?:\n|$)/;
const unescape = (s) => (s ?? "").replace(/\\(.)/g, "$1");
const escapeAlt = (s) => s.replace(/\s+/g, " ").replace(/([\\\[\]])/g, "\\$1");
const escapeCaption = (s) => s.replace(/\s+/g, " ").replace(/(["\\])/g, "\\$1");

export function figureMarkdown({ src, alt, caption }) {
  return `![${escapeAlt(alt || "")}](${src}${caption ? ` "${escapeCaption(caption)}"` : ""})`;
}

/** @param {{ onEdit: (attrs: object, update: (attrs: object) => void) => void }} options */
export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { onEdit: () => {} };
  },

  addAttributes() {
    return { src: { default: "" }, alt: { default: "" }, caption: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "figure[data-figure]" }];
  },

  renderHTML({ node }) {
    return ["figure", { "data-figure": "" }, figureMarkdown(node.attrs)];
  },

  markdownTokenizer: {
    name: "figure",
    level: "block",
    start: (src) => {
      const m = src.match(/^!\[/m);
      return m ? m.index : -1;
    },
    tokenize: (src) => {
      const m = src.match(PATTERN);
      if (!m) return undefined;
      return { type: "figure", raw: m[0], attributes: { alt: unescape(m[1]), src: m[2], caption: unescape(m[3]) } };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("figure", token.attributes, []);
  },

  renderMarkdown(node) {
    return figureMarkdown(node.attrs);
  },

  addNodeView() {
    const { onEdit } = this.options;
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("figure");
      dom.className = "figure editor-figure";
      dom.contentEditable = "false";
      let current = node;

      const update = (attrs) => {
        const pos = getPos();
        if (typeof pos === "number") editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, attrs), true)).run();
      };

      const draw = (n) => {
        const { src, alt, caption } = n.attrs;
        const img = Object.assign(document.createElement("img"), { src, alt });
        const cap = document.createElement("figcaption");
        if (caption) cap.append(caption, " ");
        if (!alt) {
          const warn = Object.assign(document.createElement("span"), { className: "anno-problem", textContent: "Add a description before publishing." });
          cap.append(warn, " ");
        }
        const edit = Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: "Edit" });
        edit.addEventListener("click", () => onEdit({ ...current.attrs }, update));
        const remove = Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: "Remove" });
        remove.addEventListener("click", () => {
          const pos = getPos();
          if (typeof pos === "number") editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
        });
        cap.append(edit, " ", remove);
        dom.replaceChildren(img, cap);
      };

      draw(node);
      return {
        dom,
        update: (n) => {
          if (n.type.name !== "figure") return false;
          current = n;
          draw(n);
          return true;
        },
        stopEvent: (e) => e.target instanceof HTMLButtonElement,
        ignoreMutation: () => true,
      };
    };
  },
});
