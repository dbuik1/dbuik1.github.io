import { Node } from "@tiptap/core";

// One {% annotate "ref", "phrase", "stance" %}note{% endannotate %} block.
// Quotes may be " or ', matching what the site's build accepts.
const PATTERN =
  /^\{%-?\s*annotate\s+(["'])(.*?)\1\s*,\s*(["'])(.*?)\3\s*,\s*(["'])(.*?)\5\s*-?%\}([\s\S]*?)\{%-?\s*endannotate\s*-?%\}[ \t]*(?:\n|$)/;

// The site's build reads each argument up to the next matching quote, so a
// value must be wrapped in a quote character it doesn't contain.
export const quote = (s) => (s.includes('"') ? `'${s}'` : `"${s}"`);
export const quotable = (s) => !(s.includes('"') && s.includes("'"));

export function annotationMarkdown({ ref, phrase, stance, note }) {
  const body = (note || "").trim();
  return `{% annotate ${quote(ref)}, ${quote(phrase)}, ${quote(stance)} %}${body ? `\n${body}\n` : ""}{% endannotate %}`;
}

/**
 * @param {object} options
 * @param {(attrs: object, update: (attrs: object) => void) => void} options.onEdit opens the picker
 * @param {(ref: string, phrase: string) => Promise<{label: string, paragraphs: string[]}>} options.lookup
 */
export const Annotation = Node.create({
  name: "annotation",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { onEdit: () => {}, lookup: async () => null };
  },

  addAttributes() {
    return {
      ref: { default: "" },
      phrase: { default: "" },
      stance: { default: "note" },
      note: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-annotation]" }];
  },

  renderHTML({ node }) {
    return ["div", { "data-annotation": "" }, annotationMarkdown(node.attrs)];
  },

  markdownTokenizer: {
    name: "annotation",
    level: "block",
    start: (src) => {
      const m = src.match(/^\{%-?\s*annotate\b/m);
      return m ? m.index : -1;
    },
    tokenize: (src) => {
      const m = src.match(PATTERN);
      if (!m) return undefined;
      return { type: "annotation", raw: m[0], attributes: { ref: m[2], phrase: m[4], stance: m[6], note: m[7].trim() } };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("annotation", token.attributes, []);
  },

  renderMarkdown(node) {
    return annotationMarkdown(node.attrs);
  },

  addNodeView() {
    const { onEdit, lookup } = this.options;
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("figure");
      dom.className = "annotation editor-annotation";
      dom.contentEditable = "false";
      let current = node;

      const update = (attrs) => {
        const pos = getPos();
        if (typeof pos === "number") editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, attrs), true)).run();
      };

      const draw = async (n) => {
        const { ref, phrase, stance, note } = n.attrs;
        dom.replaceChildren();
        const quoteEl = document.createElement("blockquote");
        const caption = document.createElement("figcaption");
        const label = document.createElement("strong");
        label.textContent = ref;
        const chip = document.createElement("span");
        chip.className = `stance stance-${stance}`;
        chip.textContent = stance.charAt(0).toUpperCase() + stance.slice(1);
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "link-button";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => onEdit({ ...current.attrs }, update));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "link-button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
          const pos = getPos();
          if (typeof pos === "number") editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
        });
        caption.append(label, chip, edit, remove);
        dom.append(quoteEl, caption);
        if (note) {
          const noteEl = document.createElement("div");
          noteEl.className = "anno-note";
          noteEl.textContent = note;
          dom.append(noteEl);
        }

        const passage = await lookup(ref, phrase).catch(() => null);
        if (current !== n) return;
        if (!passage) {
          quoteEl.textContent = `“${phrase}”`;
          return;
        }
        label.textContent = passage.label;
        const needle = phrase.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
        for (const para of passage.paragraphs) {
          const p = document.createElement("p");
          const at = para.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').indexOf(needle);
          if (at < 0) p.textContent = para;
          else {
            const mark = document.createElement("mark");
            mark.textContent = para.slice(at, at + needle.length);
            p.append(para.slice(0, at), mark, para.slice(at + needle.length));
          }
          quoteEl.append(p);
        }
        if (passage.problem) {
          const warn = document.createElement("p");
          warn.className = "anno-problem";
          warn.textContent = passage.problem;
          dom.append(warn);
        }
      };

      draw(node);
      return {
        dom,
        update: (n) => {
          if (n.type.name !== "annotation") return false;
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
