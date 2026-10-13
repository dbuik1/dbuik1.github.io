import { Node } from "@tiptap/core";

// The parts of a source a commentary quotes, each its own block in the text:
//   {% excerpt %}exact words{% endexcerpt %}
//   {% moment "12:34", "13:10" %}what is said then{% endmoment %}
const EXCERPT = /^\{%-?\s*excerpt\s*-?%\}\n?([\s\S]*?)\n?\{%-?\s*endexcerpt\s*-?%\}[ \t]*(?:\n|$)/;
const MOMENT = /^\{%-?\s*moment\s+(["'])([^"']*)\1(?:\s*,\s*(["'])([^"']*)\3)?\s*-?%\}\n?([\s\S]*?)\n?\{%-?\s*endmoment\s*-?%\}[ \t]*(?:\n|$)/;

// Blank lines inside a quote would end the Markdown block around it, so
// paragraphs are kept apart by a single blank line and nothing else.
const tidy = (text) =>
  String(text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

export const excerptMarkdown = ({ text }) => `{% excerpt %}\n${tidy(text)}\n{% endexcerpt %}`;
export const momentMarkdown = ({ start, end, text }) => {
  const words = tidy(text);
  return `{% moment "${start}"${end ? `, "${end}"` : ""} %}${words ? `\n${words}\n` : ""}{% endmoment %}`;
};

/** "12:34", "1:02:03" or "754" → seconds, or null. */
export function seconds(time) {
  const t = String(time ?? "").trim();
  if (!/^\d+(:[0-5]?\d){0,2}$/.test(t)) return null;
  return t.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
}

const words = (text) => (String(text ?? "").match(/[\p{L}\p{N}]+/gu) ?? []).length;
const QUOTES = /\{%-?\s*(?:excerpt|moment\b[^%]*)-?%\}([\s\S]*?)\{%-?\s*end(?:excerpt|moment)\s*-?%\}/g;

/** Words quoted, the longest quote, and words of David's own, in the saved text. */
export function balance(markdown) {
  const quotes = [...String(markdown).matchAll(QUOTES)].map((m) => words(m[1]));
  const own = String(markdown).replace(QUOTES, " ").replace(/\{%[\s\S]*?%\}/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/<[^>]+>/g, " ");
  return { quoted: quotes.reduce((a, b) => a + b, 0), longest: Math.max(0, ...quotes), own: words(own) };
}

export const wordCount = words;

function block({ name, pattern, toAttrs, toMarkdown, draw }) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,

    addOptions() {
      return { onEdit: () => {} };
    },

    addAttributes() {
      return { text: { default: "" }, start: { default: "" }, end: { default: "" } };
    },

    parseHTML() {
      return [{ tag: `figure[data-${name}]` }];
    },

    renderHTML({ node }) {
      return ["figure", { [`data-${name}`]: "" }, toMarkdown(node.attrs)];
    },

    markdownTokenizer: {
      name,
      level: "block",
      start: (src) => {
        const m = src.match(new RegExp(`^\\{%-?\\s*${name}\\b`, "m"));
        return m ? m.index : -1;
      },
      tokenize: (src) => {
        const m = src.match(pattern);
        if (!m) return undefined;
        return { type: name, raw: m[0], attributes: toAttrs(m) };
      },
    },

    parseMarkdown(token, helpers) {
      return helpers.createNode(name, token.attributes, []);
    },

    renderMarkdown(node) {
      return toMarkdown(node.attrs);
    },

    addNodeView() {
      const { onEdit } = this.options;
      return ({ node, getPos, editor }) => {
        const dom = document.createElement("figure");
        dom.className = `${name} editor-clip`;
        dom.contentEditable = "false";
        let current = node;
        const update = (attrs) => {
          const pos = getPos();
          if (typeof pos === "number") editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, attrs), true)).run();
        };
        const render = (n) => {
          const parts = draw(n.attrs);
          const cap = document.createElement("figcaption");
          const edit = Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: "Edit" });
          edit.addEventListener("click", () => onEdit({ ...current.attrs }, update));
          const remove = Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: "Remove" });
          remove.addEventListener("click", () => {
            const pos = getPos();
            if (typeof pos === "number") editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
          });
          cap.append(...parts.caption, edit, " ", remove);
          dom.replaceChildren(...parts.body, cap);
        };
        render(node);
        return {
          dom,
          update: (n) => {
            if (n.type.name !== name) return false;
            current = n;
            render(n);
            return true;
          },
          stopEvent: (e) => e.target instanceof HTMLButtonElement,
          ignoreMutation: () => true,
        };
      };
    },
  });
}

const quoteBlock = (text) => {
  const q = document.createElement("blockquote");
  q.append(...tidy(text).split("\n\n").filter(Boolean).map((p) => Object.assign(document.createElement("p"), { textContent: p })));
  return q;
};

export const Excerpt = block({
  name: "excerpt",
  pattern: EXCERPT,
  toAttrs: (m) => ({ text: m[1].trim() }),
  toMarkdown: excerptMarkdown,
  draw: ({ text }) => ({ body: [quoteBlock(text)], caption: [] }),
});

export const Moment = block({
  name: "moment",
  pattern: MOMENT,
  toAttrs: (m) => ({ start: m[2], end: m[4] ?? "", text: (m[5] ?? "").trim() }),
  toMarkdown: momentMarkdown,
  draw: ({ start, end, text }) => ({
    body: text ? [quoteBlock(text)] : [],
    caption: [Object.assign(document.createElement("span"), { className: "moment-time", textContent: end ? `${start} to ${end}` : start }), " "],
  }),
});
