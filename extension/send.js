// Sends captures to the writing editor on this computer. When it isn't running,
// captures wait in Chrome's storage and are sent the next time it is.
export const EDITOR = "http://127.0.0.1:8081";
const RETRY = "send-waiting";

export async function send(capture) {
  const res = await fetch(`${EDITOR}/api/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(capture),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `The editor refused it (${res.status}).`), { refused: true });
  return data;
}

async function waiting() {
  return (await chrome.storage.local.get({ waiting: [] })).waiting;
}

/** Keeps a capture to send later, as a save for later whatever was asked. */
export async function keep(capture) {
  const list = await waiting();
  list.push({ ...capture, mode: "later" });
  await chrome.storage.local.set({ waiting: list });
  await chrome.alarms.create(RETRY, { periodInMinutes: 1 });
}

/** Sends whatever is waiting; returns how many are still waiting. */
export async function flush() {
  const list = await waiting();
  const left = [];
  for (const capture of list) {
    try {
      await send(capture);
    } catch (e) {
      // A capture the editor refuses would never go through, so it isn't retried.
      if (!e.refused) left.push(capture);
    }
  }
  await chrome.storage.local.set({ waiting: left });
  if (!left.length) await chrome.alarms.clear(RETRY);
  return left.length;
}

export const isRetry = (alarm) => alarm.name === RETRY;
export const waitingCount = async () => (await waiting()).length;
