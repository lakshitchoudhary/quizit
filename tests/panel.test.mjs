import { pageRangeKey } from "../extension/pdf-pages.mjs";
import { pdfAddress } from "../extension/pdf-connect.mjs";
import * as learning from "../extension/learning.mjs";
import { parseHTML } from "linkedom";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import * as core from "../extension/core.mjs";
import * as sources from "../extension/sources.mjs";
const { document, HTMLSelectElement } = parseHTML(
  await readFile(new URL("../extension/panel.html", import.meta.url), "utf8"),
);
Object.defineProperty(HTMLSelectElement.prototype, "value", {
  get() {
    return this._value ?? this.querySelector("option")?.value ?? "";
  },
  set(v) {
    this._value = v;
  },
  configurable: true,
});
let tab = { id: 3 },
  deny = false,
  grant = false,
  requests = 0;
const stored = {
  settings: {
    mode: "local",
    model: "qwen3.5:4b",
    autoGenerate: true,
    cards: 5,
    quiz: 5,
  },
};
const chrome = {
  extension: { isAllowedFileSchemeAccess: async () => false },
  permissions: {
    request: async () => {
      requests++;
      if (grant)
        tab = { id: 3, url: "https://example.org/lesson", title: "Lesson" };
      return grant;
    },
  },
  runtime: { id: "test" },
  storage: {
    local: {
      get: async (k) => (k === null ? stored : { [k]: stored[k] }),
      set: async (o) => Object.assign(stored, structuredClone(o)),
      remove: async (k) => delete stored[k],
    },
  },
  tabs: {
    query: async () => [tab],
    onUpdated: { addListener() {} },
    onActivated: { addListener() {} },
  },
  scripting: {
    executeScript: async () => {
      if (deny) throw Error("access denied");
      return [
        {
          result: {
            title: "Test article",
            text: "Grounded reading text. ".repeat(30),
            scope: "Main article text",
          },
        },
      ];
    },
  },
};
const ctx = vm.createContext({
  document,
  chrome,
  ...core,
  ...sources,
  ...learning,
  pdfAddress,
  pageRangeKey,
  console,
  setTimeout,
  clearTimeout,
  URL,
  JSON,
  AbortController,
  AbortSignal,
  crypto,
});
const code = (
  await readFile(new URL("../extension/panel.mjs", import.meta.url), "utf8")
).replace(/^import[\s\S]*?from\s*["'][^"']+["'];?\s*/gm, "");
await vm.runInContext("(async()=>{" + code + "})()", ctx);
assert.equal(document.documentElement.dataset.panelReady, "true");
assert.match(
  document.getElementById("status").textContent,
  /Enable automatic PDF connection/,
);
assert.equal(document.getElementById("connect").disabled, false);
assert.equal(requests, 0, "startup must not request broad access");
assert.equal(document.getElementById("articleAccess").hidden, false);
await document.getElementById("allowArticles").onclick();
assert.match(document.getElementById("status").textContent, /not granted/);
grant = true;
await document.getElementById("allowArticles").onclick();
assert.equal(requests, 2);
assert.match(document.getElementById("status").textContent, /Source ready/);
assert.equal(stored.settings.autoGenerate, false);
assert.equal(document.getElementById("autoGenerate"), null);
assert.ok(document.getElementById("transcript").value.length > 150);
assert.equal(
  document.getElementById("source").open,
  false,
  "captured text stays behind the source editor",
);
deny = true;
tab = { id: 4, url: "https://example.org/other", title: "Other" };
await document.getElementById("connect").onclick();
assert.match(
  document.getElementById("status").textContent,
  /Enable article access/,
);
assert.equal(document.getElementById("connect").disabled, false);
console.log(
  "PASS actual panel initialization, missing page access feedback, Connect click capture, visible source, denied injection feedback and button recovery",
);

tab = { id: 8, url: "file:///C:/study/lecture.pdf" };
await document.getElementById("connect").onclick();
assert.match(
  document.getElementById("status").textContent,
  /Allow access to file URLs/,
);
assert.match(
  document.getElementById("pdfAddress").textContent,
  /file:\/\/\/C:\/study\/lecture.pdf/,
);
assert.equal(document.getElementById("articleAccess").hidden, true);
console.log(
  "PASS current PDF address detected and missing file permission explained",
);

let pdfReads = 0;
chrome.extension.isAllowedFileSchemeAccess = async () => true;
ctx.fetchPDFFile = async (address) => {
  pdfReads++;
  assert.equal(address, "file:///C:/study/lecture.pdf");
  return {};
};
ctx.extractDocument = async () => ({
  text: "Verified PDF text for study. ".repeat(10),
  title: "Lecture",
  filename: "lecture.pdf",
  warnings: [],
});
await document.getElementById("connect").onclick();
assert.equal(pdfReads, 1);
assert.match(document.getElementById("status").textContent, /PDF connected/);
assert.ok(stored["video:pdf:file:///C:/study/lecture.pdf|ocr:missing"]);
assert.equal(
  Object.keys(stored).filter((k) => k.startsWith("video:text:")).length,
  0,
);
await document.getElementById("connect").onclick();
assert.equal(
  pdfReads,
  1,
  "saved PDF should restore without rereading or generation",
);
console.log(
  "PASS direct PDF capture after permission, stable saved identity and saved-PDF reuse",
);
const auditKey = "video:audit-review";
stored[auditKey] = {
  id: "audit-review",
  title: "Audit review",
  kind: "text",
  transcript: "Supported reading text. ".repeat(10),
  known: [],
  answers: {},
  reviews: {},
  pack: {
    schemaVersion: 2,
    title: "Audit",
    overview: "",
    takeaways: [],
    notes: [],
    flashcards: [1, 2, 3].map((i) => ({
      id: "audit-card-" + i,
      front: "Question " + i,
      back: "Answer " + i,
    })),
    quiz: [],
  },
};
await document.getElementById("reviewToday").onclick();
assert.equal(
  document.getElementById("packActions").hidden,
  true,
  "daily queue must hide source-level deletion/export",
);
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
document.querySelector('[aria-label="Reveal answer"]').click();
await tick();
let good = [
  ...document.getElementById("study").querySelectorAll("button"),
].find((b) => b.textContent === "Good");
good.click();
good.click();
await tick();
assert.equal(
  stored[auditKey].reviews["audit-card-1"].reviews,
  1,
  "double click must count once",
);
assert.equal(stored[auditKey].reviews["audit-card-2"], undefined);
assert.match(document.getElementById("study").textContent, /2 \/ 3/);
stored[auditKey].reviews["audit-card-3"] = {
  due: Date.now() + 86400000,
  interval: 1,
  reviews: 1,
};
document.querySelector('[aria-label="Reveal answer"]').click();
await tick();
good = [...document.getElementById("study").querySelectorAll("button")].find(
  (b) => b.textContent === "Good",
);
good.click();
await tick();
assert.match(
  document.getElementById("study").textContent,
  /finished this queue/,
);
console.log(
  "PASS rapid rating clicks counted once, stale rescheduled cards skipped, source actions hidden in review queue",
);
let generatedChoice = null;
ctx.navigator = { locks: { request: async (...args) => args.at(-1)({}) } };
ctx.fetch = async () => ({
  ok: true,
  json: async () => ({ models: [{ name: "qwen3.5:4b" }] }),
});
ctx.buildStudyPack = async (options) => {
  generatedChoice = options.only;
  await options.onSection(
    {
      notes: [
        { heading: "Preview topic", explanation: "Finished section preview" },
      ],
    },
    1,
    2,
  );
  assert.match(
    document.getElementById("generationPreview").textContent,
    /Finished section preview/,
  );
  options.released(true);
  return {
    pack: {
      schemaVersion: 2,
      videoId: options.id,
      title: options.title,
      overview: "Source overview",
      takeaways: ["Point one", "Point two", "Point three"],
      notes: [
        {
          heading: "Topic",
          explanation: "Supported details",
          keyPoints: ["Supported point"],
          examples: [],
          caveats: [],
        },
      ],
      flashcards: [],
      quiz: [],
    },
    stats: { seconds: 0, cacheHits: 0 },
  };
};
await document.getElementById("newText").onclick();
document.getElementById("transcript").value =
  "Source information for a meaningful study session. ".repeat(10);
document.getElementById("creationType").value = "notes";
await document.getElementById("creationType").onchange();
assert.equal(
  generatedChoice,
  null,
  "changing inputs must not start generation",
);
assert.equal(document.getElementById("quizCountLabel").hidden, true);
assert.equal(document.getElementById("cardCountLabel").hidden, true);
await document.getElementById("generate").onclick();
assert.equal(generatedChoice, "notes");
assert.equal(
  document.getElementById("generationPreview"),
  null,
  "preview must clear after completion",
);
assert.equal(document.getElementById("createPanel").open, false);
assert.match(document.getElementById("study").textContent, /Supported details/);
console.log(
  "PASS single Create action dispatches selected output, input changes do not generate, irrelevant counts hidden, finished output opens without setup",
);
let diagramCalls = 0;
ctx.renderDiagram = (root, diagram) => {
  root.textContent = diagram
    ? "Rendered map: " + diagram.title
    : "Create a map";
};
ctx.buildDiagram = async (options) => {
  diagramCalls++;
  assert.equal(options.kind, "flowchart");
  options.released(true);
  return {
    pack: {
      schemaVersion: 2,
      videoId: options.id,
      title: options.title,
      overview: "",
      takeaways: [],
      notes: [],
      flashcards: [],
      quiz: [],
      diagram: {
        kind: "flowchart",
        title: "Lesson map",
        nodes: [
          { id: "r", label: "Learn", detail: "Learn the topic" },
          { id: "a", label: "Recall", detail: "Recall from memory" },
          { id: "b", label: "Review", detail: "Check your answer" },
        ],
        edges: [
          { from: "r", to: "a", label: "" },
          { from: "a", to: "b", label: "" },
        ],
      },
    },
    stats: { seconds: 0, cacheHits: 0 },
  };
};
document.getElementById("creationType").value = "diagram";
await document.getElementById("creationType").onchange();
document.getElementById("diagramKind").value = "flowchart";
await document.getElementById("diagramKind").onchange();
assert.equal(diagramCalls, 0, "selecting diagram options must not generate");
assert.equal(document.getElementById("diagramOptions").hidden, false);
await document.getElementById("generate").onclick();
assert.equal(diagramCalls, 1);
assert.match(
  document.getElementById("study").textContent,
  /Rendered map: Lesson map/,
);
assert.equal(
  document.querySelector('[data-view="diagram"]').getAttribute("aria-pressed"),
  "true",
);
const diagramSession = Object.values(stored).find(
  (s) => s?.pack?.diagram?.title === "Lesson map",
);
assert.equal(diagramSession.pack.notes[0].explanation, "Supported details");
assert.equal(document.getElementById("diagramKind").disabled, false);
console.log(
  "PASS diagram options wait for Create, dispatch flowchart, preserve notes, save and open Map tab",
);
const readsBeforeSwitch = pdfReads;
document.getElementById("pdfFile").files = [{ name: "pending.pdf" }];
await document.getElementById("pdfFile").onchange();
document.getElementById("savedSources").value =
  "video:pdf:file:///C:/study/lecture.pdf|ocr:missing";
await document.getElementById("openSaved").onclick();
document.getElementById("pdfPages").value = "2";
await document.getElementById("applyPdfPages").onclick();
assert.equal(
  pdfReads,
  readsBeforeSwitch + 1,
  "Apply must read the opened saved PDF address, not the previous pending file",
);
console.log(
  "PASS switching saved sources clears pending PDF identity before applying a range",
);
// Failure/recovery checks run through the actual panel handlers.
await document.getElementById("newText").onclick();
document.getElementById("transcript").value =
  "A supported source for reliable retrieval practice. ".repeat(12);
document.getElementById("creationType").value = "notes";
ctx.fetch = async () => {
  throw Error("connection refused");
};
await document.getElementById("generate").onclick();
assert.match(document.getElementById("status").textContent, /SETUP.cmd/);
assert.match(document.getElementById("engineStatus").textContent, /offline/);
assert.equal(document.getElementById("generate").disabled, false);
assert.equal(document.getElementById("cancel").hidden, true);
let copiedId;
ctx.navigator.clipboard = {
  writeText: async (text) => {
    copiedId = text;
  },
};
await document.getElementById("copyId").onclick();
assert.equal(copiedId, "test");
ctx.fetch = async () => ({
  ok: true,
  json: async () => ({ models: [{ name: "qwen3.5:4b" }] }),
});
ctx.navigator.locks.request = async (...args) => args.at(-1)(null);
await document.getElementById("generate").onclick();
assert.match(document.getElementById("status").textContent, /another sidebar/);
ctx.navigator.locks.request = async (...args) => args.at(-1)({});
ctx.buildStudyPack = async () => {
  throw Error("Storage quota exceeded");
};
await document.getElementById("generate").onclick();
assert.match(document.getElementById("status").textContent, /Storage quota/);
assert.equal(document.getElementById("generate").disabled, false);
assert.equal(document.getElementById("generationPreview"), null);
assert.equal(
  document.getElementById("engineStatus").textContent,
  "Local AI ready",
);
console.log(
  "PASS offline feedback, copy ID, generation lock denial, storage failure and button recovery",
);
// Verification details must follow shuffled choices and disappear after manual edits.
stored[auditKey].pack = {
  schemaVersion: 2,
  title: "Check display",
  overview: "",
  takeaways: [],
  notes: [],
  flashcards: [],
  quiz: [
    {
      id: "checked-question",
      question: "Which choice is supported?",
      options: ["Wrong", "Supported", "Unknown", "Opposite"],
      answer: 1,
      explanation: "The second choice follows the source.",
      verification: {
        method: "independent-option-check-v1",
        corroborated: true,
        verdicts: ["contradicted", "supported", "not_stated", "contradicted"],
      },
    },
  ],
};
stored[auditKey].answers = {};
document.getElementById("savedSources").value = auditKey;
await document.getElementById("openSaved").onclick();
await document.querySelector('[data-view="quiz"]').onclick();
assert.doesNotMatch(
  document.getElementById("study").textContent,
  /How the options were checked/,
);
document.querySelectorAll(".choice")[1].click();
await tick();
assert.match(
  document.getElementById("study").textContent,
  /How the options were checked/,
);
assert.match(document.getElementById("study").textContent, /B: supported/);
[...document.querySelectorAll("#study button")]
  .find((b) => b.textContent === "Edit")
  .click();
[...document.querySelectorAll("#study button")]
  .find((b) => b.textContent === "Save changes")
  .click();
await tick();
assert.equal(stored[auditKey].pack.quiz[0].verification, undefined);
assert.doesNotMatch(
  document.getElementById("study").textContent,
  /How the options were checked/,
);
console.log(
  "PASS answer-check details appear only after answering; manual edits invalidate prior verification",
);
