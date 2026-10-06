// Builds the Compact view of annotations: each annotation's figure gets a popup,
// opened from the highlighted phrase in the text (or a small button when the
// text doesn't quote the phrase). The reader's choice is stored on their device.
(function () {
  var root = document.documentElement;
  var KEY = "annotation-mode";
  if (typeof HTMLElement.prototype.showPopover !== "function") return;

  var phrases = [];
  document.querySelectorAll("figure.annotation").forEach(function (fig) {
    var link = fig.querySelector("figcaption a");
    var stance = fig.querySelector(".stance");
    var label = link ? link.textContent : "Annotation";

    var pop = document.createElement("div");
    pop.id = fig.id + "-pop";
    pop.setAttribute("popover", "");
    pop.className = "anno-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Annotation on " + label);
    var top = document.createElement("div");
    top.className = "anno-pop-top";
    if (link) top.appendChild(link.cloneNode(true));
    var close = document.createElement("button");
    close.type = "button";
    close.className = "anno-close";
    close.textContent = "Close";
    close.addEventListener("click", function () { pop.hidePopover(); });
    top.appendChild(close);
    pop.appendChild(top);
    ["blockquote", ".stance", ".anno-note"].forEach(function (sel) {
      var el = fig.querySelector(sel);
      if (el) pop.appendChild(el.cloneNode(true));
    });
    document.body.appendChild(pop);
    var open = function () { pop.showPopover(); };
    fig.addEventListener("annotation:reveal", function () { target.scrollIntoView({ block: "center" }); });

    var target;
    var phrase = document.querySelector('.anno-phrase[data-anno="' + fig.id + '"]');
    if (phrase) {
      phrase.addEventListener("click", function () { if (root.dataset.annotations === "compact") open(); });
      phrase.addEventListener("keydown", function (e) {
        if (root.dataset.annotations === "compact" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); }
      });
      phrases.push(phrase);
      target = phrase;
    } else {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "anno-chip";
      chip.textContent = label + (stance ? " · " + stance.textContent : "");
      chip.addEventListener("click", open);
      fig.parentNode.insertBefore(chip, fig);
      target = chip;
    }
  });

  function setMode(mode, save) {
    var compact = mode === "compact";
    if (compact) root.dataset.annotations = "compact";
    else delete root.dataset.annotations;
    phrases.forEach(function (p) {
      if (compact) { p.setAttribute("role", "button"); p.setAttribute("tabindex", "0"); p.setAttribute("aria-haspopup", "dialog"); }
      else { p.removeAttribute("role"); p.removeAttribute("tabindex"); p.removeAttribute("aria-haspopup"); }
    });
    document.querySelectorAll(".anno-toggle button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    });
    if (save) { try { localStorage.setItem(KEY, mode); } catch (e) {} }
  }

  document.querySelectorAll(".anno-toggle").forEach(function (t) {
    t.hidden = false;
    t.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.dataset.mode, true); });
    });
  });
  setMode(root.dataset.annotations === "compact" ? "compact" : "expanded", false);

  // A link to a hidden (Compact) annotation scrolls to its phrase or button instead.
  var linked = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (linked && linked.matches("figure.annotation") && root.dataset.annotations === "compact") {
    linked.dispatchEvent(new Event("annotation:reveal"));
  }
})();
