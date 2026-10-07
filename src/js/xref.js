// Cross-link previews and the reading overlay.
//
// Hovering or focusing a cross-link shows a preview card. Clicking it, or
// "Read here" in the card, opens the linked post over the current one; links
// inside it can be followed the same way, and Back (the button, Esc or the
// browser's own Back) steps out one level at a time to where you were reading.
// Ctrl/Cmd/middle-click and "Open page" still go to the page itself.
(() => {
  if (!("fetch" in window) || !window.HTMLDialogElement) return;

  const SELECTOR = "a.xref";
  const normalise = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const cache = new Map();

  // ---- Loading a linked page ----
  function load(href) {
    const url = new URL(href, location.href);
    const key = url.pathname;
    if (!cache.has(key)) {
      cache.set(
        key,
        fetch(key)
          .then((r) => {
            if (!r.ok) throw new Error(r.status);
            return r.text();
          })
          .then((html) => {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const article = doc.querySelector("article.post");
            if (!article) throw new Error("no article");
            article.querySelectorAll("script, .anno-toggle").forEach((n) => n.remove());
            return {
              url: key,
              title: article.querySelector("h1")?.textContent.trim() ?? doc.title,
              description: doc.querySelector('meta[name="description"]')?.content ?? "",
              article,
            };
          })
          .catch((e) => {
            cache.delete(key);
            throw e;
          })
      );
    }
    return cache.get(key);
  }

  // A Range over the first occurrence of `quote` in `root`, matching across
  // elements, with curly quotes and runs of spaces treated as plain ones.
  function findQuote(root, quote) {
    if (!quote) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const map = [];
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest("figure.annotation, .footnotes, .bibliography, .footnote-ref")) continue;
      const s = node.data;
      for (let i = 0; i < s.length; i++) {
        const c = /\s/.test(s[i]) ? " " : normalise(s[i]);
        if (c === " " && text.endsWith(" ")) continue;
        text += c;
        map.push([node, i]);
      }
    }
    const at = text.indexOf(quote);
    if (at < 0) return null;
    const range = document.createRange();
    const [startNode, startOffset] = map[at];
    const [endNode, endOffset] = map[at + quote.length - 1];
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset + 1);
    return range;
  }

  function highlight(range) {
    if (!range) return;
    if (window.CSS?.highlights && window.Highlight) {
      CSS.highlights.set("xref-target", new Highlight(range));
    } else if (range.startContainer === range.endContainer) {
      range.surroundContents(document.createElement("mark"));
    }
  }

  // ---- Preview card ----
  const card = document.createElement("div");
  card.className = "xref-preview";
  card.setAttribute("role", "dialog");
  // As a popover the card joins the top layer, so it also shows above the reading overlay.
  const usePopover = "popover" in HTMLElement.prototype;
  if (usePopover) card.popover = "manual";
  else card.hidden = true;
  document.body.append(card);
  let open = false;

  let current = null; // the link the card belongs to
  let showTimer = 0;
  let hideTimer = 0;

  function excerpt(page, quote) {
    const body = page.article.querySelector(".post-body") ?? page.article;
    const box = document.createElement("div");
    box.className = "xref-excerpt";
    let source = null;
    if (quote) {
      source = [...body.querySelectorAll("p, li, h2, h3, blockquote")].find((el) =>
        normalise(el.textContent.replace(/\s+/g, " ")).includes(quote)
      );
    }
    if (source) {
      const p = source.cloneNode(true);
      p.querySelectorAll(".footnote-ref").forEach((n) => n.remove());
      box.append(p);
      const range = findQuote(p, quote);
      if (range && range.startContainer === range.endContainer) range.surroundContents(document.createElement("mark"));
    } else {
      const text = page.description && !/^Personal website/.test(page.description) ? page.description : body.querySelector("p")?.textContent ?? "";
      box.append(Object.assign(document.createElement("p"), { textContent: text.length > 320 ? `${text.slice(0, 300).trim()}…` : text }));
    }
    return box;
  }

  async function show(link) {
    clearTimeout(hideTimer);
    if (current === link && open) return;
    current = link;
    let page;
    try {
      page = await load(link.href);
    } catch {
      return;
    }
    if (current !== link) return;
    const heading = Object.assign(document.createElement("p"), { className: "xref-title", textContent: page.title });
    heading.id = "xref-preview-title";
    const meta = page.article.querySelector(".post-meta")?.cloneNode(true);
    const actions = document.createElement("p");
    actions.className = "xref-actions";
    const read = Object.assign(document.createElement("button"), { type: "button", textContent: "Read here" });
    read.addEventListener("click", () => {
      hide();
      openReader(link);
    });
    const openPage = Object.assign(document.createElement("a"), { href: link.href, textContent: "Open page" });
    actions.append(read, openPage);
    card.replaceChildren(heading, ...(meta ? [meta] : []), excerpt(page, link.dataset.quote), actions);
    card.setAttribute("aria-labelledby", heading.id);
    link.setAttribute("aria-describedby", "xref-preview-title");
    if (usePopover) {
      if (open) card.hidePopover();
      card.showPopover();
    } else card.hidden = false;
    open = true;
    place(link);
  }

  function place(link) {
    const r = link.getBoundingClientRect();
    const gutter = 16;
    const width = Math.min(card.offsetWidth, window.innerWidth - gutter * 2);
    let left = Math.min(Math.max(gutter, r.left), window.innerWidth - width - gutter);
    let top = r.bottom + 8;
    if (top + card.offsetHeight > window.innerHeight - gutter && r.top - card.offsetHeight - 8 > gutter) {
      top = r.top - card.offsetHeight - 8;
    }
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function hide() {
    clearTimeout(showTimer);
    if (!open) return;
    if (usePopover) card.hidePopover();
    else card.hidden = true;
    open = false;
    current?.removeAttribute("aria-describedby");
    current = null;
  }

  const linkFrom = (e) => e.target.closest?.(SELECTOR);

  document.addEventListener("mouseover", (e) => {
    const link = linkFrom(e);
    if (link) {
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(link), 350);
    } else if (card.contains(e.target)) {
      clearTimeout(hideTimer);
    }
  });
  document.addEventListener("mouseout", (e) => {
    if (linkFrom(e) || card.contains(e.target)) {
      clearTimeout(showTimer);
      const to = e.relatedTarget;
      if (to && (card.contains(to) || to === current)) return;
      hideTimer = setTimeout(hide, 250);
    }
  });
  document.addEventListener("focusin", (e) => {
    const link = linkFrom(e);
    if (link && link.matches(":focus-visible")) show(link);
    else if (!card.contains(e.target)) hide();
  });

  // Keyboard: Tab from a link with an open card moves into the card; Esc closes it.
  const focusables = (root) => [...root.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")].filter((el) => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null);
  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") {
      const link = current;
      hide();
      link?.focus();
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (e.key !== "Tab") return;
    const inCard = focusables(card);
    if (document.activeElement === current && !e.shiftKey && inCard.length) {
      e.preventDefault();
      inCard[0].focus();
    } else if (card.contains(document.activeElement)) {
      const i = inCard.indexOf(document.activeElement);
      if (e.shiftKey && i === 0) {
        e.preventDefault();
        current.focus();
      } else if (!e.shiftKey && i === inCard.length - 1) {
        // Leaving the card carries on from the link, as if the card weren't there.
        e.preventDefault();
        const link = current;
        hide();
        const all = focusables(link.closest("dialog") ?? document.body);
        (all[all.indexOf(link) + 1] ?? link).focus();
      }
    }
  });

  // Touch: the first tap shows the card; its buttons do the rest.
  let touched = false;
  document.addEventListener("pointerdown", (e) => {
    touched = e.pointerType === "touch";
    if (!card.contains(e.target) && !linkFrom(e)) hide();
  });

  document.addEventListener("click", (e) => {
    const link = linkFrom(e);
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (touched && current !== link) {
      show(link);
      return;
    }
    hide();
    openReader(link);
  });

  // ---- Reading overlay ----
  const reader = document.createElement("dialog");
  reader.className = "reader";
  reader.setAttribute("aria-labelledby", "reader-title");
  reader.innerHTML = `
    <div class="reader-bar">
      <button type="button" class="reader-back"></button>
      <ol class="reader-trail" aria-label="Where you've been"></ol>
      <a class="reader-open">Open page</a>
    </div>
    <div class="reader-scroll"><div class="reader-page"></div></div>`;
  document.body.append(reader);
  const back = reader.querySelector(".reader-back");
  const trail = reader.querySelector(".reader-trail");
  const openLink = reader.querySelector(".reader-open");
  const scroller = reader.querySelector(".reader-scroll");
  const pageBox = reader.querySelector(".reader-page");

  const homeTitle = document.querySelector("article.post h1, main h1")?.textContent.trim() || document.title;
  const stack = []; // [{ page, quote, scroll, opener }]

  function render() {
    const top = stack[stack.length - 1];
    const article = top.page.article.cloneNode(true);
    article.querySelector("h1")?.setAttribute("id", "reader-title");
    article.querySelector("h1")?.setAttribute("tabindex", "-1");
    pageBox.replaceChildren(article);
    openLink.href = top.page.url;
    const previous = stack.length > 1 ? stack[stack.length - 2].page.title : homeTitle;
    back.textContent = `← Back to ${previous}`;
    trail.replaceChildren(
      ...[homeTitle, ...stack.map((s) => s.page.title)].map((t, i, all) => {
        const li = Object.assign(document.createElement("li"), { textContent: t });
        if (i === all.length - 1) li.setAttribute("aria-current", "page");
        return li;
      })
    );
    window.CSS?.highlights?.delete("xref-target");
    const range = findQuote(article.querySelector(".post-body") ?? article, top.quote);
    highlight(range);
    if (top.scroll != null) scroller.scrollTop = top.scroll;
    else if (range) {
      scroller.scrollTop = 0;
      const rect = range.getBoundingClientRect();
      scroller.scrollTop = rect.top - scroller.getBoundingClientRect().top - scroller.clientHeight / 3;
    } else scroller.scrollTop = 0;
    article.querySelector("h1")?.focus({ preventScroll: true });
  }

  async function openReader(link) {
    let page;
    try {
      page = await load(link.href);
    } catch {
      location.href = link.href;
      return;
    }
    if (stack.length) stack[stack.length - 1].scroll = scroller.scrollTop;
    stack.push({ page, quote: link.dataset.quote ?? null, scroll: null, opener: link });
    history.pushState({ xrefDepth: stack.length }, "");
    if (!reader.open) {
      reader.showModal();
      document.documentElement.classList.add("reader-open");
    }
    render();
  }

  // Closes layers until `depth` remain.
  function closeTo(depth) {
    let opener = null;
    while (stack.length > depth) opener = stack.pop().opener;
    if (stack.length) {
      render();
      if (opener && reader.contains(opener)) opener.focus();
    } else if (reader.open) {
      reader.close();
      document.documentElement.classList.remove("reader-open");
      window.CSS?.highlights?.delete("xref-target");
      opener?.focus();
    }
  }

  window.addEventListener("popstate", (e) => closeTo(e.state?.xrefDepth ?? 0));
  back.addEventListener("click", () => history.back());
  reader.addEventListener("cancel", (e) => {
    e.preventDefault();
    if (!open) history.back();
  });

  // Links to notes and other places in the same post scroll the overlay, not the page behind it.
  reader.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const target = pageBox.querySelector(`[id="${CSS.escape(decodeURIComponent(a.hash.slice(1)))}"]`);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ block: "center" });
    target.classList.add("reader-flash");
    setTimeout(() => target.classList.remove("reader-flash"), 1500);
  });
})();
