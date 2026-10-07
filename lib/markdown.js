// Markdown additions shared by posts, projects and the editable site text.
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import { plugin as xref } from "./xref.js";

// An image alone in its paragraph, `![alt](src "caption")`, becomes a figure
// with the title as its caption.
function figures(md) {
  md.core.ruler.push("figures", (state) => {
    const t = state.tokens;
    for (let i = 1; i < t.length - 1; i++) {
      const inline = t[i];
      if (inline.type !== "inline" || t[i - 1].type !== "paragraph_open" || t[i + 1].type !== "paragraph_close") continue;
      const kids = (inline.children ?? []).filter((k) => !(k.type === "text" && !k.content.trim()));
      if (kids.length !== 1 || kids[0].type !== "image") continue;
      t[i - 1].tag = t[i + 1].tag = "figure";
      t[i - 1].attrJoin("class", "figure");
      inline.children = kids;
      kids[0].meta = { ...(kids[0].meta ?? {}), figure: true };
    }
  });
  const image = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!token.meta?.figure) return image(tokens, idx, options, env, self);
    const caption = token.attrGet("title");
    const attrs = token.attrs.filter(([k]) => k !== "title");
    token.attrs = attrs;
    const img = image(tokens, idx, options, env, self);
    return caption ? `${img}<figcaption>${md.renderInline(caption)}</figcaption>` : img;
  };
}

// Footnotes render as "Notes" with plain numbers, not "[1]".
function notes(md) {
  md.use(footnote);
  const r = md.renderer.rules;
  r.footnote_caption = (tokens, idx) => {
    const n = Number(tokens[idx].meta.id + 1);
    return tokens[idx].meta.subId > 0 ? `${n}:${tokens[idx].meta.subId}` : `${n}`;
  };
  r.footnote_block_open = () => '<section class="footnotes" aria-labelledby="notes-heading">\n<h2 id="notes-heading">Notes</h2>\n<ol class="footnotes-list">\n';
  r.footnote_anchor = (tokens, idx, options, env, slf) => {
    let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
    if (tokens[idx].meta.subId > 0) id += `:${tokens[idx].meta.subId}`;
    return ` <a href="#fnref${id}" class="footnote-backref" aria-label="Back to the text">↩︎</a>`;
  };
}

export function configure(md) {
  md.use(xref);
  md.use(figures);
  md.use(notes);
  return md;
}

export const markdown = configure(new MarkdownIt({ html: true, linkify: false }));
