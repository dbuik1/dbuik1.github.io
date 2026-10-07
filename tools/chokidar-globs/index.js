// Stands in for chokidar in Eleventy's dev server. Eleventy 3 passes glob
// patterns to chokidar, but chokidar 3 depends on `braces` (which has an
// unfixed security advisory) and chokidar 4 dropped glob support. This wraps
// chokidar 4: it watches each glob's base folder and filters events by the
// original patterns.
const path = require("node:path");
const chokidar = require("chokidar4");
const picomatch = require("picomatch");

const isGlob = (p) => /[*?[\]{}()!]/.test(p);
const strip = (p) => p.replace(/^\.\//, "");

// The part of a pattern before its first glob segment, e.g. "./src/**/*.md" -> "./src".
function base(p) {
  const parts = p.split("/");
  const i = parts.findIndex(isGlob);
  return i < 0 ? p : parts.slice(0, i).join("/") || ".";
}

function watch(paths, options = {}) {
  const list = [].concat(paths ?? []).filter((p) => typeof p === "string");
  const root = options.cwd ?? process.cwd();
  const rel = (p) => path.relative(root, path.resolve(root, p)).split(path.sep).join("/");

  const globs = list.filter(isGlob).map(strip);
  const wanted = globs.length ? picomatch(globs, { dot: true }) : () => false;
  const literals = list.filter((p) => !isGlob(p)).map((p) => rel(p));

  const ignoredList = [].concat(options.ignored ?? []);
  const ignoredGlobs = ignoredList.filter((x) => typeof x === "string").map(strip);
  const ignoredFns = ignoredList.filter((x) => typeof x === "function");
  const isIgnored = ignoredGlobs.length ? picomatch(ignoredGlobs, { dot: true }) : () => false;

  const ignored = (p, stats) => {
    const r = rel(p);
    if (r && (isIgnored(r) || isIgnored(`${r}/`))) return true;
    if (ignoredFns.some((fn) => fn(p, stats))) return true;
    if (!stats || stats.isDirectory()) return false;
    if (literals.some((l) => r === l || r.startsWith(`${l}/`))) return false;
    return !wanted(r);
  };

  return chokidar.watch([...new Set(list.map(base))], { ...options, ignored });
}

module.exports = { ...chokidar, watch };
module.exports.default = module.exports;
