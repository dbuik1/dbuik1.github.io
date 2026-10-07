// Short pieces of site text kept as Markdown files in src/_text/, so they can be
// edited in the writing editor. An empty or missing file shows its placeholder.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdown } from "./markdown.js";
import levels from "../src/_data/levels.js";

export const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/_text");

// `inline` texts are one line with no paragraphs. `url` is where the text shows.
export const texts = [
  { name: "home-intro", label: "Home page introduction", inline: true, url: "/", placeholder: "[Your one-line introduction]" },
  { name: "home-about", label: "Home page paragraph", url: "/", placeholder: "[A short paragraph about you, in your words]" },
  {
    name: "colophon",
    label: "Colophon",
    url: "/colophon/",
    placeholder: "[How and why this site is made, in your words, including that the code is AI-built while the writing is yours.]",
  },
  {
    name: "ai",
    label: "AI and this site",
    url: "/ai/",
    placeholder: "[What you think about how AI is used to make this site, and that you write all the writing yourself]",
  },
  {
    name: "levels-intro",
    label: "Research levels introduction",
    url: "/levels/",
    placeholder: "[What the research levels are for, and how a piece moves from one to the next]",
  },
  ...levels.map((l) => ({
    name: `level-${l.slug}`,
    label: `Research level: ${l.name}`,
    inline: true,
    url: `/levels/#${l.slug}`,
    placeholder: `[What “${l.name}” means, in your words]`,
  })),
];

export const file = (name) => path.join(DIR, `${name}.md`);

export function read(name) {
  return existsSync(file(name)) ? readFileSync(file(name), "utf8").trim() : "";
}

export function render(name) {
  const t = texts.find((x) => x.name === name);
  if (!t) throw new Error(`There's no site text called “${name}”.`);
  const source = read(name);
  if (!source) {
    return t.inline
      ? `<span class="placeholder-inline">${t.placeholder}</span>`
      : `<p class="placeholder">${t.placeholder}</p>`;
  }
  return t.inline ? markdown.renderInline(source.replace(/\s*\n\s*/g, " ")) : markdown.render(source);
}
