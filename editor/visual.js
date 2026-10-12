import { Node } from "@tiptap/core";
import { quote, quotable } from "./annotation.js";

// A visual placed in the text: {% visual "slug" %} or {% visual "slug", "caption" %}.
const PATTERN = /^\{%-?\s*visual\s+(["'])([a-z0-9-]+)\1(?:\s*,\s*(["'])([\s\S]*?)\3)?\s*-?%\}[ \t]*(?:\n|$)/;

export function visualMarkdown({ slug, caption }) {
  const text = (caption || "").replace(/\s+/g, " ").trim();
  return `{% visual ${quote(slug)}${text ? `, ${quote(text)}` : ""} %}`;
}

const $ = (id) => document.getElementById(id);
let visuals = [];
let onDone = null;

/** Visuals the picker offers: [{ slug, title, poster }]. */
export function setVisuals(list) {
  visuals = list;
  $("visual-choice").replaceChildren(
    ...visuals.map((v) => Object.assign(document.createElement("option"), { value: v.slug, textContent: v.title + (v.draft ? " (draft)" : "") }))
  );
  $("visual-none").hidden = visuals.length > 0;
  $("visual-choose-fields").hidden = visuals.length === 0;
  $("visual-save").disabled = visuals.length === 0;
}

export const visualTitle = (slug) => visuals.find((v) => v.slug === slug)?.title ?? slug;
const posterOf = (slug) => (visuals.find((v) => v.slug === slug)?.poster ? `/visual-poster/${slug}.png` : null);

export function initVisualPicker() {
  $("visual-form").addEventListener("submit", (e) => {
    const caption = $("visual-caption").value.trim();
    if (!quotable(caption)) {
      e.preventDefault();
      $("visual-problem").textContent = "The caption can use double quotes or single quotes, but not both.";
      return;
    }
    onDone?.({ slug: $("visual-choice").value, caption });
  });
}

/** Opens the picker; `done` gets { slug, caption }, or isn't called when cancelled. */
export function openVisualPicker(attrs, done) {
  onDone = done;
  $("visual-problem").textContent = "";
  if (attrs?.slug) $("visual-choice").value = attrs.slug;
  $("visual-caption").value = attrs?.caption ?? "";
  $("visual-save").textContent = attrs ? "Save" : "Insert visual";
  $("visual-dialog").showModal();
}

/** @param {{ onEdit: (attrs: object, update: (attrs: object) => void) => void }} options */
export const VisualEmbed = Node.create({
  name: "visualEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { onEdit: () => {} };
  },

  addAttributes() {
    return { slug: { default: "" }, caption: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "figure[data-visual]" }];
  },

  renderHTML({ node }) {
    return ["figure", { "data-visual": "" }, visualMarkdown(node.attrs)];
  },

  markdownTokenizer: {
    name: "visualEmbed",
    level: "block",
    start: (src) => {
      const m = src.match(/^\{%-?\s*visual\b/m);
      return m ? m.index : -1;
    },
    tokenize: (src) => {
      const m = src.match(PATTERN);
      if (!m) return undefined;
      return { type: "visualEmbed", raw: m[0], attributes: { slug: m[2], caption: m[4] ?? "" } };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("visualEmbed", token.attributes, []);
  },

  renderMarkdown(node) {
    return visualMarkdown(node.attrs);
  },

  addNodeView() {
    const { onEdit } = this.options;
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("figure");
      dom.className = "visual editor-visual";
      dom.contentEditable = "false";
      let current = node;

      const update = (attrs) => {
        const pos = getPos();
        if (typeof pos === "number") editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, attrs), true)).run();
      };

      const draw = (n) => {
        const { slug, caption } = n.attrs;
        const stage = Object.assign(document.createElement("div"), { className: "visual-stage" });
        const poster = posterOf(slug);
        if (poster) stage.append(Object.assign(document.createElement("img"), { className: "visual-poster", src: poster, alt: "" }));
        stage.append(Object.assign(document.createElement("span"), { className: "visual-run", textContent: visualTitle(slug) }));
        const cap = document.createElement("figcaption");
        if (caption) cap.append(caption, " ");
        if (!visuals.some((v) => v.slug === slug)) {
          cap.append(Object.assign(document.createElement("span"), { className: "anno-problem", textContent: `There's no visual called “${slug}”.` }), " ");
        }
        const edit = Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: "Edit" });
        edit.addEventListener("click", () => onEdit({ ...current.attrs }, update));
        const remove = Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: "Remove" });
        remove.addEventListener("click", () => {
          const pos = getPos();
          if (typeof pos === "number") editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
        });
        cap.append(edit, " ", remove);
        dom.replaceChildren(stage, cap);
      };

      draw(node);
      return {
        dom,
        update: (n) => {
          if (n.type.name !== "visualEmbed") return false;
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
