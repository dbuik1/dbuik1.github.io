import { flush, isRetry } from "./send.js";

chrome.alarms.onAlarm.addListener((alarm) => {
  if (isRetry(alarm)) flush();
});
chrome.runtime.onStartup.addListener(() => flush());
