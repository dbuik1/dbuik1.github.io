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
    label: "Colophon: opening",
    url: "/colophon/",
    placeholder: "[How and why this site is made, in your words, including what you think about AI being used to build it, and that you write all the writing yourself.]",
  },
  {
    name: "colophon-levels",
    label: "Colophon: Research levels",
    url: "/colophon/#levels",
    placeholder: "[What the research levels are for, and how a piece moves from one to the next]",
  },
  ...levels.map((l) => ({
    name: `level-${l.slug}`,
    label: `Colophon: ${l.name}`,
    inline: true,
    url: `/colophon/#${l.slug}`,
    placeholder: `[What “${l.name}” means, in your words]`,
  })),
  {
    name: "colophon-importance",
    label: "Colophon: Importance",
    url: "/colophon/#importance",
    placeholder: "[What a post’s importance (low, medium or high) means, and how it combines with the research level on the Search grid]",
  },
  {
    name: "colophon-notes",
    label: "Colophon: Notes",
    url: "/colophon/#notes",
    placeholder: "[What notes are: single pieces of knowledge, facts and quotes, kept to build the longer writing on.]",
  },
  {
    name: "colophon-commentary",
    label: "Colophon: Commentary",
    url: "/colophon/#commentary",
    placeholder: "[What commentary is: your responses to articles, videos, podcasts and posts, each with the source shown.]",
  },
  {
    name: "colophon-visuals",
    label: "Colophon: Visuals",
    url: "/colophon/#visuals",
    placeholder: "[What the visuals are: animations, simulations and interactive diagrams, most of them made to sit inside your writing.]",
  },
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
