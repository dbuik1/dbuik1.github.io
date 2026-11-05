// A word-level diff of two texts, drawn the way a reviewer reads it: removed
// words struck through, added words underlined, long unchanged stretches
// shortened to their ends.

const TOKEN = /\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}_'’-]/gsu;
const MAX_CELLS = 4_000_000;
const KEEP = 160;

function lcsOps(a, b) {
  const n = a.length, m = b.length;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) ops.push(["=", a[i++]]), j++;
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) ops.push(["-", a[i++]]);
    else ops.push(["+", b[j++]]);
  }
  while (i < n) ops.push(["-", a[i++]]);
  while (j < m) ops.push(["+", b[j++]]);
  return ops;
}

function tokenOps(a, b, whole) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const ma = a.slice(p, a.length - s), mb = b.slice(p, b.length - s);
  let mid;
  if (!ma.length || !mb.length || ma.length * mb.length <= MAX_CELLS) mid = lcsOps(ma, mb);
  else if (!whole) return null;
  else mid = [["-", ma.join("")], ["+", mb.join("")]];
  return [...a.slice(0, p).map((t) => ["=", t]), ...mid, ...a.slice(a.length - s).map((t) => ["=", t])];
}

// diff returns runs of [op, text], op being "=", "-" or "+".
export function diff(before, after) {
  const a = before.match(TOKEN) ?? [], b = after.match(TOKEN) ?? [];
  // Too many words to compare one by one: compare lines instead.
  const ops = tokenOps(a, b, false) ?? tokenOps(before.split(/(?<=\n)/), after.split(/(?<=\n)/), true);
  // A lone unchanged space between two changes reads better as part of them.
  for (let k = 1; k < ops.length - 1; k++) {
    if (ops[k][0] === "=" && /^[ \t]+$/.test(ops[k][1]) && ops[k - 1][0] !== "=" && ops[k + 1][0] !== "=") {
      ops.splice(k, 1, ["-", ops[k][1]], ["+", ops[k][1]]);
    }
  }
  const runs = [];
  const del = [], ins = [];
  const flush = () => {
    if (del.length) runs.push(["-", del.join("")]), (del.length = 0);
    if (ins.length) runs.push(["+", ins.join("")]), (ins.length = 0);
  };
  for (const [op, t] of ops) {
    if (op === "-") del.push(t);
    else if (op === "+") ins.push(t);
    else {
      flush();
      if (runs.length && runs.at(-1)[0] === "=") runs.at(-1)[1] += t;
      else runs.push(["=", t]);
    }
  }
  flush();
  return runs;
}

const count = (s) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;

// renderDiff fills box with the diff and returns a one-line summary.
export function renderDiff(box, before, after) {
  const runs = diff(before, after);
  box.replaceChildren();
  let removed = 0, added = 0;
  runs.forEach(([op, t], k) => {
    if (op === "-") {
      removed += count(t);
      box.append(Object.assign(document.createElement("del"), { textContent: t }));
    } else if (op === "+") {
      added += count(t);
      box.append(Object.assign(document.createElement("ins"), { textContent: t }));
    } else if (t.length > KEEP * 2 + 40) {
      const head = k === 0 ? "" : t.slice(0, KEEP);
      const tail = k === runs.length - 1 ? "" : t.slice(-KEEP);
      const gap = Object.assign(document.createElement("span"), { className: "diff-gap", textContent: ` … ${count(t.slice(head.length, t.length - tail.length))} words unchanged … ` });
      box.append(head, gap, tail);
    } else box.append(t);
  });
  if (!removed && !added) return before === after ? "Lia's version is the same as yours." : "Only spacing or punctuation changes.";
  const parts = [];
  if (removed) parts.push(`${removed} ${removed === 1 ? "word" : "words"} removed`);
  if (added) parts.push(`${added} ${added === 1 ? "word" : "words"} added`);
  return parts.join(", ") + ".";
}
