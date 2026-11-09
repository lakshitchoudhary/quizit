// Executed in the YouTube tab's isolated world; no page scripts or remote code.
async function readTranscript(expectedId) {
  const current = () => new URL(location.href).searchParams.get("v");
  if (current() !== expectedId)
    throw Error("The video changed. Connect the current video again.");
  const visible = (el) => !!(el && el.getClientRects().length);
  const rows = () =>
    [
      ...document.querySelectorAll(
        "ytd-transcript-segment-renderer, transcript-segment-view-model",
      ),
    ].filter(visible);
  if (!rows().length) {
    const expand = document.querySelector(
      "ytd-watch-metadata #description-inline-expander #expand",
    );
    if (visible(expand)) {
      expand.click();
      await new Promise((r) => setTimeout(r, 350));
    }
    let opened = false;
    for (let i = 0; i < 80 && !rows().length; i++) {
      if (current() !== expectedId)
        throw Error(
          "The video changed during transcript reading. Reconnect it.",
        );
      if (!opened) {
        const button = [
          ...document.querySelectorAll("button, ytd-button-renderer"),
        ].find(
          (el) =>
            visible(el) &&
            /show transcript/i.test(
              [el.textContent, el.getAttribute("aria-label")].join(" "),
            ),
        );
        if (button) {
          button.click();
          opened = true;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  // Allow asynchronously rendered segments to finish arriving before reading them.
  let previous = "",
    stable = 0;
  for (let i = 0; i < 20 && stable < 3; i++) {
    const list = rows(),
      signature = list.length + ":" + (list.at(-1)?.textContent || "");
    stable = signature === previous ? stable + 1 : 0;
    previous = signature;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (current() !== expectedId)
    throw Error("The video changed during transcript reading. Reconnect it.");
  const text = rows()
    .map((row) => {
      const stamp = row
        .querySelector(
          ".segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp",
        )
        ?.textContent?.trim();
      const line = row
        .querySelector(".segment-text, span.ytAttributedStringHost")
        ?.textContent?.trim();
      return line ? `${stamp ? "[" + stamp + "] " : ""}${line}` : "";
    })
    .filter(Boolean)
    .join("\n");
  if (!text)
    throw Error(
      "Open the video description → Show transcript, then try again. If unavailable or your YouTube layout differs, paste a transcript manually.",
    );
  return {
    text,
    title:
      document.querySelector("ytd-watch-metadata h1")?.textContent?.trim() ||
      document.title.replace(/ - YouTube$/, ""),
  };
}
