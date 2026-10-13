import { send, keep, flush } from "./send.js";

const $ = (id) => document.getElementById(id);

// Runs in the page: what it is, the words selected, and where a playing video or recording is.
function grab() {
  const media = [...document.querySelectorAll("video, audio")].find((m) => m.currentTime > 0 && m.duration > 0);
  const html = document.documentElement.outerHTML;
  return {
    url: location.href,
    title: document.title,
    selection: String(getSelection() ?? "").trim(),
    time: media ? Math.floor(media.currentTime) : null,
    html: html.length < 8_000_000 ? html : null,
  };
}

const clock = (t) => {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

function say(text, tone = "") {
  $("state").className = `state ${tone}`;
  $("state").textContent = text;
  $("state").hidden = false;
}

let page = null;

async function start() {
  flush().catch(() => {});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!/^https?:/.test(tab?.url ?? "")) return say("Only web pages can be captured.");
  try {
    [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: grab });
  } catch {
    return say("Chrome doesn't allow capturing this page.");
  }
  $("site").textContent = new URL(page.url).hostname.replace(/^www\./, "");
  $("title").textContent = page.title || page.url;
  $("quote").textContent = page.selection;
  $("quote").hidden = !page.selection;
  $("moment").hidden = page.time === null;
  $("time-label").textContent = page.time === null ? "" : `From ${clock(page.time)}`;
  $("hint").hidden = !!page.selection || page.time !== null;
  $("capture").hidden = false;
  $("write").focus();
}

async function capture(mode) {
  for (const b of document.querySelectorAll("button")) b.disabled = true;
  const item = { ...page, time: page.time !== null && $("use-time").checked ? page.time : null, mode, capturedAt: new Date().toISOString() };
  try {
    const result = await send(item);
    if (mode === "write") {
      await chrome.tabs.create({ url: result.open });
      window.close();
    } else {
      say("Saved for later. It's listed on the editor's start screen.", "ok");
    }
  } catch (e) {
    if (e.refused) {
      say(e.message, "error");
      for (const b of document.querySelectorAll("button")) b.disabled = false;
      return;
    }
    await keep(item);
    say("The editor isn't running, so this is saved for later in Chrome. It moves to the editor's start screen once you run npm run write.", "ok");
  }
}

$("write").addEventListener("click", () => capture("write"));
$("later").addEventListener("click", () => capture("later"));
start();
