import { videoId } from "./core.mjs";

export function sourceIdentity(raw) {
  const id = videoId(raw);
  if (id) return { id, kind: "youtube", url: raw };
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    return { id: "page:" + url.href, kind: "article", url: url.href };
  } catch {
    return null;
  }
}

// Self-contained: injected into the page with activeTab permission after a user gesture.
export function readPageText(expectedUrl, selectionOnly = false) {
  const here = new URL(location.href),
    expected = new URL(expectedUrl);
  here.hash = expected.hash = "";
  for (const url of [here, expected])
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  if (here.href !== expected.href)
    return { error: "The page changed. Connect the current page again." };
  if (document.contentType === "application/pdf")
    return {
      pdf: true,
      error: "Use Choose PDF file to read this PDF locally.",
    };
  const title =
    document.querySelector("h1")?.innerText?.trim() || document.title;
  if (selectionOnly) {
    const text = window.getSelection()?.toString().trim() || "";
    return text.length >= 150
      ? { text, title, scope: "Selected excerpt" }
      : { error: "Select at least 150 characters in the page first." };
  }
  const candidates = [
    ...document.querySelectorAll(
      '.mw-parser-output, article, [role="main"], main',
    ),
  ];
  const visible = (e) =>
    e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
  const clean = (root) => {
    const clone = root.cloneNode(true);
    // Work only on a detached clone. Never change the user's page.
    clone
      .querySelectorAll(
        'script, style, noscript, nav, header, footer, aside, form, button, input, textarea, select, [hidden], [aria-hidden="true"], .mw-editsection, .ambox, .metadata, .hatnote, .navbox, .toc, .reflist, .reference',
      )
      .forEach((e) => e.remove());
    clone
      .querySelectorAll(
        "p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,tr,section,div,br",
      )
      .forEach((e) => {
        e.prepend("\n");
        e.append("\n");
      });
    return clone.textContent
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n(?:\s*\n)+/g, "\n\n")
      .trim();
  };
  const wiki = candidates.find(
    (e) => e.matches(".mw-parser-output") && visible(e),
  );
  const articles = candidates.filter((e) => e.matches("article") && visible(e));
  const choices = wiki
    ? [wiki]
    : articles.length
      ? articles
      : candidates.filter(visible);
  let text = choices.map(clean).sort((a, b) => b.length - a.length)[0];
  let scope = "Main article text";
  if (!text || text.length < 150) {
    text = clean(document.body);
    scope = "Page text — check for menus or unrelated content";
  }
  if (text.length < 150)
    return {
      error:
        "Not enough readable text. Wait for the page to load, select an excerpt, or paste the material.",
    };
  if (text.length > 150000)
    return {
      error:
        "This page is too long. Select the section you want to study and use Read selection.",
    };
  return { text, title, scope };
}
