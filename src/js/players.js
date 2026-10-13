// Click-to-load players: the video site's player only loads when the reader
// presses Play, so reading a page sets no cookies from YouTube or Vimeo.
document.addEventListener("click", function (e) {
  var button = e.target.closest(".player-play");
  if (!button) return;
  var box = button.closest(".player");
  var frame = document.createElement("iframe");
  frame.src = box.dataset.src;
  frame.title = box.dataset.title || "Video";
  frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allowFullscreen = true;
  box.replaceChildren(frame);
  box.classList.add("is-playing");
  frame.focus();
});
