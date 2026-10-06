import { execFileSync } from "node:child_process";

// Builds the changelog from git history. CI must check out the full history
// (fetch-depth: 0), or only the latest commit is available.
export default function () {
  let log;
  try {
    log = execFileSync("git", ["log", "--no-merges", "--date=short", "--format=%H%x1f%ad%x1f%s"], { encoding: "utf8" });
  } catch {
    return [];
  }
  const days = [];
  for (const line of log.trim().split("\n").filter(Boolean)) {
    const [hash, date, subject] = line.split("\x1f");
    let day = days.at(-1);
    if (!day || day.date !== date) {
      day = { date, commits: [] };
      days.push(day);
    }
    day.commits.push({ hash, short: hash.slice(0, 7), subject });
  }
  return days;
}
