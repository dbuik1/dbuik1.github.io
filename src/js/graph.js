// The graph page: every post, project, tag and annotated passage as a dot,
// with lines for cross-links, tags, project links and annotations.
// Drag the background to move, scroll or pinch to zoom, drag a dot to pull it,
// and select a dot (click, tap or Enter) to open it. Hovering or focusing a dot
// highlights it and its neighbours. The list under the drawing has the same
// connections without JavaScript.
(() => {
  const root = document.getElementById("graph");
  const svg = document.getElementById("graph-canvas");
  if (!root || !svg || !window.d3 || !d3.forceSimulation) return;

  const NS = "http://www.w3.org/2000/svg";
  const KIND_NAMES = { post: "Post", project: "Project", tag: "Tag", passage: "Annotated passage", fragment: "Fragment" };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const el = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  let data;
  let sim;
  let view = { x: 0, y: 0, k: 1 };
  const shown = new Set(["post", "project", "tag", "passage", "fragment"]);
  const scene = el("g");
  const linkLayer = el("g", { class: "graph-links" });
  const nodeLayer = el("g", { class: "graph-nodes" });
  scene.append(linkLayer, nodeLayer);
  svg.append(scene);

  const size = () => ({ w: svg.clientWidth || 600, h: svg.clientHeight || 500 });
  const radius = (n) => (n.kind === "tag" ? 3.5 : 5) + Math.sqrt(n.degree) * 2.2;
  const applyView = () => {
    scene.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`);
    svg.classList.toggle("is-zoomed", view.k > 2.4);
    // Labels stay the same size on screen at any zoom.
    svg.style.setProperty("--zoom", view.k);
  };

  function fit() {
    const nodes = data.nodes.filter((n) => shown.has(n.kind));
    if (!nodes.length) return;
    const { w, h } = size();
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(1.5, 0.9 / Math.max((x1 - x0 + 80) / w, (y1 - y0 + 80) / h));
    view = { k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k };
    applyView();
  }

  // ---- Highlighting a dot and its neighbours ----
  const focusLine = document.getElementById("graph-focus");
  function highlight(n) {
    svg.classList.toggle("has-active", !!n);
    for (const g of nodeLayer.children) {
      const d = g.__node;
      g.classList.toggle("is-active", d === n);
      g.classList.toggle("is-near", !!n && n.near.has(d.id));
    }
    for (const line of linkLayer.children) {
      const l = line.__link;
      line.classList.toggle("is-near", !!n && (l.source === n || l.target === n));
    }
    focusLine.textContent = n
      ? `${n.title}: ${KIND_NAMES[n.kind]}${n.level ? `, ${n.level}` : ""}. Connects to ${n.near.size}.`
      : "";
  }

  // ---- Drawing ----
  function draw() {
    const nodes = data.nodes.filter((n) => shown.has(n.kind));
    const ids = new Set(nodes.map((n) => n.id));
    const links = data.links.filter((l) => ids.has(l.sourceId) && ids.has(l.targetId));
    for (const n of nodes) n.near = new Set();
    // Only the best-connected dots are labelled until you zoom in or point at one.
    const degrees = nodes.map((n) => n.degree).sort((a, b) => b - a);
    const hub = Math.max(3, degrees[Math.floor(degrees.length * 0.15)] ?? 0);
    for (const l of links) {
      l.source = data.byId.get(l.sourceId);
      l.target = data.byId.get(l.targetId);
      l.source.near.add(l.targetId);
      l.target.near.add(l.sourceId);
    }

    linkLayer.replaceChildren(
      ...links.map((l) => {
        const line = el("line", { class: `graph-link link-${l.kind}` });
        line.__link = l;
        return line;
      })
    );
    nodeLayer.replaceChildren(
      ...nodes.map((n) => {
        const a = el("a", { href: n.url, class: `graph-node node-${n.kind}${n.degree >= hub ? " is-hub" : ""}` });
        a.setAttribute("aria-label", `${n.title} (${KIND_NAMES[n.kind]})`);
        const r = radius(n);
        a.append(el("circle", { r }), Object.assign(el("text", { x: r + 4, y: 4 }), { textContent: n.title }));
        a.__node = n;
        a.addEventListener("pointerenter", () => highlight(n));
        a.addEventListener("pointerleave", () => highlight(null));
        a.addEventListener("focus", () => highlight(n));
        a.addEventListener("blur", () => highlight(null));
        a.addEventListener("click", (e) => {
          if (a.__dragged) e.preventDefault();
          a.__dragged = false;
        });
        dragNode(a, n);
        return a;
      })
    );

    sim?.stop();
    sim = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).distance((l) => (l.kind === "tag" ? 45 : 70)).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-160))
      .force("x", d3.forceX().strength(0.04))
      .force("y", d3.forceY().strength(0.04))
      .force("collide", d3.forceCollide((n) => radius(n) + 6))
      .stop();
    // Settle the layout before showing it, so nothing jumps on arrival.
    for (let i = 0; i < 300; i++) sim.tick();
    sim.on("tick", position);
    position();
  }

  function position() {
    for (const line of linkLayer.children) {
      const { source: s, target: t } = line.__link;
      line.setAttribute("x1", s.x);
      line.setAttribute("y1", s.y);
      line.setAttribute("x2", t.x);
      line.setAttribute("y2", t.y);
    }
    for (const g of nodeLayer.children) g.setAttribute("transform", `translate(${g.__node.x} ${g.__node.y})`);
  }

  // ---- Pointer handling: drag dots, pan, zoom ----
  const toScene = (e) => {
    const box = svg.getBoundingClientRect();
    return { x: (e.clientX - box.left - view.x) / view.k, y: (e.clientY - box.top - view.y) / view.k };
  };

  function dragNode(a, n) {
    a.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const start = { x: e.clientX, y: e.clientY };
      a.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (!a.__dragged && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        a.__dragged = true;
        const p = toScene(ev);
        n.fx = p.x;
        n.fy = p.y;
        if (reduceMotion) {
          n.x = p.x;
          n.y = p.y;
          position();
        } else sim.alphaTarget(0.25).restart();
      };
      const up = () => {
        a.removeEventListener("pointermove", move);
        n.fx = n.fy = null;
        if (!reduceMotion) sim.alphaTarget(0);
      };
      a.addEventListener("pointermove", move);
      a.addEventListener("pointerup", up, { once: true });
      a.addEventListener("pointercancel", up, { once: true });
    });
  }

  const pointers = new Map();
  let pinch = null;
  svg.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("is-panning");
    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), k: view.k };
    }
  });
  svg.addEventListener("pointermove", (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    if (pointers.size === 1) {
      view.x += e.clientX - last.x;
      view.y += e.clientY - last.y;
      applyView();
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [p, q] = [...pointers.values()];
      const box = svg.getBoundingClientRect();
      zoomAt((p.x + q.x) / 2 - box.left, (p.y + q.y) / 2 - box.top, (pinch.k * Math.hypot(p.x - q.x, p.y - q.y)) / pinch.d);
    }
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) svg.classList.remove("is-panning");
  };
  svg.addEventListener("pointerup", release);
  svg.addEventListener("pointercancel", release);

  function zoomAt(px, py, k) {
    k = Math.min(6, Math.max(0.2, k));
    view = { k, x: px - ((px - view.x) / view.k) * k, y: py - ((py - view.y) / view.k) * k };
    applyView();
  }
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const box = svg.getBoundingClientRect();
      zoomAt(e.clientX - box.left, e.clientY - box.top, view.k * Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false }
  );

  // ---- Controls ----
  for (const box of root.querySelectorAll("[data-kind]")) {
    box.addEventListener("change", () => {
      shown[box.checked ? "add" : "delete"](box.dataset.kind);
      draw();
      fit();
    });
  }
  document.getElementById("graph-reset").addEventListener("click", fit);

  fetch("/graph.json")
    .then((r) => r.json())
    .then((json) => {
      data = json;
      data.byId = new Map(data.nodes.map((n) => [n.id, n]));
      for (const l of data.links) {
        l.sourceId = l.source;
        l.targetId = l.target;
      }
      // Kinds the site doesn't have yet get no checkbox.
      for (const box of root.querySelectorAll("[data-kind]")) {
        if (!data.nodes.some((n) => n.kind === box.dataset.kind)) box.closest("label").hidden = true;
      }
      root.hidden = false;
      document.getElementById("graph-list").open = false;
      draw();
      fit();
    })
    .catch(() => {});
})();
