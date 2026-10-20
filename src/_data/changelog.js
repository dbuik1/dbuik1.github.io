import { execFileSync } from "node:child_process";

// Builds the changelog from git history. CI must check out the full history
// (fetch-depth: 0), or only the latest commit is available.
// Only commits that change the published pages are listed: work on the editor,
// the browser extension or the repo's tooling alone doesn't change what readers see.
const SITE_PATHS = [/^src\//, /^eleventy\.config\.js$/];

export default function () {
  let log;
  try {
    log = execFileSync("git", ["log", "--no-merges", "--date=short", "--name-only", "--format=\x1e%H%x1f%ad%x1f%s"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  const days = [];
  for (const entry of log.split("\x1e").filter((e) => e.trim())) {
    const [head, ...files] = entry.split("\n");
    if (!files.some((f) => SITE_PATHS.some((p) => p.test(f)))) continue;
    const [hash, date, rawSubject] = head.split("\x1f");
    // Pull request numbers mean nothing to readers.
    const subject = rawSubject.replace(/\s*\(#\d+\)$/, "");
    let day = days.at(-1);
    if (!day || day.date !== date) {
      day = { date, commits: [] };
      days.push(day);
    }
    day.commits.push({ hash, short: hash.slice(0, 7), subject });
  }
  return days;
}
