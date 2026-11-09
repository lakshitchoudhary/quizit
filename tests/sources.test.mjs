import assert from "node:assert/strict";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import { readPageText, sourceIdentity } from "../extension/sources.mjs";
const content =
  "A study article explains retrieval practice and spaced learning. ".repeat(8);
const html = `<html><head><title>Lesson</title></head><body><nav>PRIVATE_MENU</nav><article><h1>Recall lesson</h1><p>${content}</p><script>UNTRUSTED_SCRIPT</script><aside>UNRELATED_TEXT</aside></article></body></html>`;
const { document, HTMLElement } = parseHTML(html);
HTMLElement.prototype.getClientRects = () => [{}];
const context = vm.createContext({
  document,
  location: { href: "https://example.org/lesson?utm_source=test" },
  URL,
  getComputedStyle: () => ({ visibility: "visible" }),
  window: { getSelection: () => ({ toString: () => content }) },
});
const read = (url, selection = false) =>
  vm.runInContext(
    "(" +
      readPageText.toString() +
      ")(" +
      JSON.stringify(url) +
      "," +
      selection +
      ")",
    context,
  );
const original = document.documentElement.outerHTML;
const out = read("https://example.org/lesson");
assert.ok(out.text.includes("retrieval practice"));
assert.ok(!/PRIVATE_MENU|UNTRUSTED_SCRIPT|UNRELATED_TEXT/.test(out.text));
assert.equal(
  document.documentElement.outerHTML,
  original,
  "capture must not modify the live document",
);
assert.match(read("https://example.org/other").error, /changed/);
assert.equal(
  read("https://example.org/lesson", true).scope,
  "Selected excerpt",
);
assert.equal(
  sourceIdentity("https://example.org/lesson?utm_source=test#section").id,
  "page:https://example.org/lesson",
);
assert.equal(sourceIdentity("edge://settings"), null);
console.log(
  "PASS article selection, menu/script removal, source change guard, tracking removal and non-mutating extraction",
);
