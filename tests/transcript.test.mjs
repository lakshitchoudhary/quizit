import vm from "node:vm";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(
  new URL("../extension/transcript.js", import.meta.url),
  "utf8",
);
for (const modern of [false, true]) {
  const row = {
    getClientRects: () => [{}],
    textContent: "0:01 A complete transcript line.",
    querySelector: (s) =>
      s.includes("timestamp") || s.includes("Timestamp")
        ? { textContent: "0:01" }
        : { textContent: "A complete transcript line." },
  };
  let opened = false,
    queries = 0;
  const btn = {
    getClientRects: () => [{}],
    textContent: "Show transcript",
    getAttribute: () => "",
    click: () => {
      opened = true;
    },
  };
  const ctx = {
    URL,
    location: { href: "https://www.youtube.com/watch?v=zyxWVU98765" },
    setTimeout: (fn) => {
      fn();
    },
    document: {
      title: "Video - YouTube",
      querySelector: () => null,
      querySelectorAll: (s) =>
        s.includes("segment")
          ? ++queries > 2 &&
            opened &&
            (!modern || s.includes("transcript-segment-view-model"))
            ? [row]
            : []
          : [btn],
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const result = await ctx.readTranscript("zyxWVU98765");
  assert.equal(result.text, "[0:01] A complete transcript line.");
  assert.ok(opened);
  console.log(
    "PASS " +
      (modern ? "modern" : "legacy") +
      " transcript with delayed rendering",
  );
  ctx.location.href = "https://www.youtube.com/watch?v=abcDEF12345";
  await assert.rejects(ctx.readTranscript("zyxWVU98765"), /video changed/i);
}
const ctx = {
  URL,
  location: { href: "https://www.youtube.com/watch?v=zyxWVU98765" },
  setTimeout: (fn) => fn(),
  document: { querySelector: () => null, querySelectorAll: () => [] },
};
vm.createContext(ctx);
vm.runInContext(source, ctx);
await assert.rejects(ctx.readTranscript("zyxWVU98765"), /Show transcript/);
console.log(
  "PASS missing transcript gives bounded actionable error; changed video rejected",
);
