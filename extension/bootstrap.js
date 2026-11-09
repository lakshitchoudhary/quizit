// A classic-script loader can show failures even if module initialization fails.
const startupStatus = document.getElementById("status");
function startupFailure(error) {
  if (document.documentElement.dataset.panelReady === "true") {
    startupStatus.textContent =
      "Quizit! encountered an error: " + (error?.message || String(error));
    startupStatus.classList.add("error");
    return;
  }
  startupStatus.textContent =
    "Quizit! 1.1.0 could not start: " +
    (error?.message || String(error)) +
    ". Reload Quizit! on edge://extensions, close this sidebar, then open it again.";
  startupStatus.classList.add("error");
}
document
  .getElementById("reloadPanel")
  .addEventListener("click", () => location.reload());
window.addEventListener("error", (event) =>
  startupFailure(event.error || event.message),
);
window.addEventListener("unhandledrejection", (event) =>
  startupFailure(event.reason),
);
setTimeout(() => {
  if (document.documentElement.dataset.panelReady !== "true")
    startupFailure(new Error("interface initialization did not finish"));
}, 8000);
import("./panel.mjs").catch(startupFailure);
