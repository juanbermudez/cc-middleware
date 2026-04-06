// Expandable diagram overlay
// Makes all .diagram-expandable images open in a full-screen overlay on click
(function () {
  function setupDiagramOverlays() {
    document.querySelectorAll("img.diagram-expandable").forEach(function (img) {
      if (img.dataset.overlayBound) return;
      img.dataset.overlayBound = "true";
      img.addEventListener("click", function () {
        var overlay = document.createElement("div");
        overlay.className = "diagram-overlay";

        var fullImg = document.createElement("img");
        fullImg.src = img.src;
        fullImg.alt = img.alt || "Diagram";

        var hint = document.createElement("div");
        hint.className = "close-hint";
        hint.textContent = "Click anywhere or press Esc to close";

        overlay.appendChild(fullImg);
        overlay.appendChild(hint);

        overlay.addEventListener("click", function () {
          overlay.remove();
        });

        document.addEventListener(
          "keydown",
          function handler(e) {
            if (e.key === "Escape") {
              overlay.remove();
              document.removeEventListener("keydown", handler);
            }
          }
        );

        document.body.appendChild(overlay);
      });
    });
  }

  // Run on load and on navigation (Mintlify is an SPA)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupDiagramOverlays);
  } else {
    setupDiagramOverlays();
  }

  // Re-run on route changes (MutationObserver catches SPA navigation)
  var observer = new MutationObserver(function () {
    setupDiagramOverlays();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
