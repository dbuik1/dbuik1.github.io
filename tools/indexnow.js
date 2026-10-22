// Tells Bing and the other IndexNow search engines which pages a deploy added,
// changed or removed, so they are recrawled within minutes instead of days.
// Run by the deploy workflow after the site is live:
//   node tools/indexnow.js <commit before the push> <commit after it>
// Only uses Node's own modules, so it runs without installing anything.
import { execFileSync } from "node:child_process";
import site from "../src/_data/site.js";

const [before, after = "HEAD"] = process.argv.slice(2);

// Which pages a changed source file affects.
function urlsFor(file) {
  let m;
  if ((m = file.match(/^src\/blog\/\d{4}-\d\d-\d\d-([^/]+)\.md$/))) return [`/blog/${m[1]}/`, "/blog/", "/"];
  if ((m = file.match(/^src\/projects\/([^/]+)\.md$/))) return [`/projects/${m[1]}/`, "/projects/", "/"];
  if ((m = file.match(/^src\/notes\/\d{4}-\d\d-\d\d-([^/]+)\.md$/))) return [`/notes/${m[1]}/`, "/notes/"];
  if (file.startsWith("src/_text/home-")) return ["/"];
  if (file.startsWith("src/_text/colophon") || file.startsWith("src/_text/level-")) return ["/colophon/"];
  return [];
}

let files = [];
const known = (sha) => sha && !/^0+$/.test(sha);
if (known(before)) {
  try {
    files = execFileSync("git", ["diff", "--name-only", before, after], { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch (e) {
    console.log(`Couldn't compare ${before} with ${after}, so only the home page is submitted: ${e.message}`);
  }
}
const urls = [...new Set(files.flatMap(urlsFor))];
if (!urls.length) urls.push("/");

const host = new URL(site.url).host;
const body = {
  host,
  key: site.indexNowKey,
  keyLocation: `${site.url}/${site.indexNowKey}.txt`,
  urlList: urls.map((u) => new URL(u, site.url).href),
};
let res;
try {
  res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
} catch (e) {
  console.log(`Couldn't reach IndexNow: ${e.message}`);
  process.exit(0);
}
console.log(`IndexNow answered ${res.status} for:\n${body.urlList.join("\n")}`);
// 200 and 202 mean accepted. Anything else is reported but doesn't fail the deploy.
if (![200, 202].includes(res.status)) console.log(await res.text());
