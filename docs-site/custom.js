// Expandable diagram overlay
// Makes all .diagram-expandable images open in a full-screen overlay on click
(function () {
  function openOverlay(img) {
    if (document.querySelector(".diagram-overlay")) return;

    var overlay = document.createElement("div");
    overlay.className = "diagram-overlay";

    var fullImg = document.createElement("img");
    fullImg.src = img.src;
    fullImg.alt = img.alt || "Diagram";

    var hint = document.createElement("div");
    hint.className = "close-hint";
    hint.textContent = "Click anywhere or press Esc to close";

    function cleanup() {
      overlay.remove();
      document.removeEventListener("keydown", handleKeydown);
    }

    function handleKeydown(e) {
      if (e.key === "Escape") {
        cleanup();
      }
    }

    overlay.appendChild(fullImg);
    overlay.appendChild(hint);

    overlay.addEventListener("click", function (e) {
      e.stopPropagation();
      cleanup();
    });

    document.addEventListener("keydown", handleKeydown);
    document.body.appendChild(overlay);
  }

  function setupDiagramOverlays() {
    document.querySelectorAll("img.diagram-expandable").forEach(function (img) {
      if (img.dataset.overlayBound) return;
      img.dataset.overlayBound = "true";
      // Disable Mintlify's built-in medium-zoom on these images
      img.setAttribute("data-zoom-disabled", "true");
      img.setAttribute("data-zoomable", "false");
      img.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openOverlay(img);
      }, true);
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
