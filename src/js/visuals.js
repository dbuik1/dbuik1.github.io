// Visuals in a page. An embedded visual shows its poster and a Run button, and
// nothing of it loads until the button is pressed; then the button becomes a
// sandboxed frame. Each frame reports its height, so it fits its content
// without a scroll bar of its own. Without JavaScript the Run button is a link
// to the visual's own page.
(() => {
  const frames = new Set();
  const MAX_HEIGHT = 3000;

  const theme = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const sendTheme = (frame) => frame.contentWindow?.postMessage({ type: "davidbuik:theme", theme: theme() }, "*");

  function watch(frame) {
    frames.add(frame);
    frame.addEventListener("load", () => sendTheme(frame));
    // A visual sized to the window (100vh) grows a little each time the frame
    // grows; after a burst of growth like that, its last height is kept.
    frame.growth = [];
  }

  addEventListener("message", (e) => {
    const d = e.data;
    if (!d || d.type !== "davidbuik:height" || typeof d.height !== "number") return;
    for (const frame of frames) {
      if (frame.contentWindow !== e.source) continue;
      const now = Date.now();
      const current = frame.getBoundingClientRect().height;
      if (d.height > current) {
        frame.growth = frame.growth.filter((t) => now - t < 2000).concat(now);
        if (frame.growth.length > 6) return;
      }
      frame.style.height = `${Math.min(MAX_HEIGHT, Math.max(120, Math.ceil(d.height)))}px`;
      frame.classList.add("is-sized");
    }
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => frames.forEach(sendTheme));

  document.querySelectorAll("iframe.visual-frame").forEach(watch);

  document.addEventListener("click", (e) => {
    const run = e.target.closest("a.visual-run");
    if (!run || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    const stage = run.closest(".visual-stage");
    const frame = document.createElement("iframe");
    frame.className = "visual-frame";
    frame.src = run.dataset.src;
    frame.title = run.dataset.title;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("allow", "fullscreen");
    frame.style.aspectRatio = run.dataset.ratio;
    watch(frame);
    stage.replaceWith(frame);
    frame.focus();
  });
})();
