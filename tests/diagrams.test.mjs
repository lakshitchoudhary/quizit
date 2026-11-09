import { claimReply, answerReply } from "./model-fixtures.mjs";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  buildDiagram,
  mindmapGraph,
  flowchartGraph,
} from "../extension/diagrams.mjs";
import { validateDiagram, renderDiagram } from "../extension/diagram-view.mjs";
import { parsePack } from "../extension/core.mjs";
import { mergePack } from "../extension/learning.mjs";
const graph = {
  title: "Retrieval practice",
  nodes: [
    { id: "root", label: "Study", detail: "Active recall builds retrieval." },
    { id: "a", label: "Recall", detail: "Try to recall before checking." },
    { id: "b", label: "Review", detail: "Check the answer and review later." },
  ],
  edges: [
    { from: "root", to: "a", label: "" },
    { from: "a", to: "b", label: "Then" },
  ],
};
assert.equal(validateDiagram(graph, "mindmap").nodes.length, 3);
assert.throws(() =>
  validateDiagram(
    { ...graph, edges: [...graph.edges, { from: "b", to: "root", label: "" }] },
    "flowchart",
  ),
);
assert.throws(() =>
  validateDiagram(
    { ...graph, edges: [{ from: "root", to: "missing", label: "" }] },
    "mindmap",
  ),
);
assert.throws(() =>
  validateDiagram(
    { ...graph, nodes: [...graph.nodes, graph.nodes[0]] },
    "mindmap",
  ),
);
const cache = {},
  calls = [];
let released;
const args = {
  id: "source",
  title: "Recall lesson",
  transcript:
    "Recall information before checking the answer. Review difficult information later. ".repeat(
      170,
    ),
  model: "test-local",
  cache,
  released: (ok) => (released = ok),
  call: async (path, body) => {
    const claimResponse = claimReply(body);
    if (claimResponse) return claimResponse;
    const solvedResponse = answerReply(body);
    if (solvedResponse) return solvedResponse;
    calls.push(body);
    return {
      message: {
        content: JSON.stringify(
          body.format?.properties.points
            ? {
                points: [
                  "Retrieve from memory.",
                  "Check the answer.",
                  "Review at intervals.",
                ],
              }
            : body.format?.properties.branches
              ? {
                  title: "Retrieval practice",
                  detail: "Study through retrieval.",
                  branches: ["Recall", "Check", "Review"].map((label) => ({
                    label,
                    detail: label + " important concepts.",
                    children: [],
                  })),
                }
              : graph,
        ),
      },
    };
  },
};
const result = await buildDiagram(args);
assert.equal(released, true);
assert.ok(result.pack.diagram.sourceSections > 1);
assert.equal(result.stats.requests - 1, result.pack.diagram.sourceSections);
assert.deepEqual(calls.at(-1).messages, []);
assert.equal(calls.at(-1).keep_alive, 0);
assert.equal(
  parsePack(JSON.stringify(result.pack), "source").diagram.kind,
  "mindmap",
);
const old = {
  ...result.pack,
  notes: [{ heading: "Original notes" }],
  quiz: [{ question: "Keep me" }],
};
assert.deepEqual(mergePack(old, result.pack, "diagram", true).notes, old.notes);
const before = calls.length;
await buildDiagram(args);
assert.equal(calls.length, before, "cached diagrams do not load a model");
await buildDiagram({ ...args, difficulty: "advanced" });
assert.ok(calls.length > before, "difficulty must isolate cache");
await assert.rejects(
  buildDiagram({
    ...args,
    cache: {},
    call: async () => {
      throw Error("offline");
    },
  }),
  /offline/,
);
const ctrl = new AbortController();
let unload = 0;
await assert.rejects(
  buildDiagram({
    ...args,
    cache: {},
    signal: ctrl.signal,
    call: async (_, body) => {
      const claimResponse = claimReply(body);
      if (claimResponse) return claimResponse;
      const solvedResponse = answerReply(body);
      if (solvedResponse) return solvedResponse;
      if (!body.messages.length) {
        unload++;
        return {};
      }
      ctrl.abort();
      return { message: { content: JSON.stringify(graph) } };
    },
  }),
  /abort/i,
);
assert.equal(unload, 1);
const nested = {
  title: "Learning",
  detail: "Central subject",
  branches: ["Concepts", "Practice", "Feedback"].map((label) => ({
    label,
    detail: "Study " + label,
    children: [{ label: label + " example", detail: "A supported example" }],
  })),
};
assert.equal(validateDiagram(mindmapGraph(nested), "mindmap").nodes.length, 7);
let repairs = 0,
  repairPrompts = [];
const flow = {
  title: "Study process",
  steps: ["Read", "Recall", "Check"].map((label) => ({
    label,
    detail: label + " source material",
    nextLabel: "",
    branches: [],
  })),
};
assert.equal(
  validateDiagram(flowchartGraph(flow), "flowchart").nodes.length,
  3,
);
await buildDiagram({
  ...args,
  cache: {},
  transcript: "Source-grounded explanation. ".repeat(10),
  kind: "flowchart",
  call: async (_, body) => {
    const claimResponse = claimReply(body);
    if (claimResponse) return claimResponse;
    const solvedResponse = answerReply(body);
    if (solvedResponse) return solvedResponse;
    if (!body.messages.length) return {};
    repairs++;
    repairPrompts.push(body.messages.at(-1).content);
    return {
      message: {
        content: JSON.stringify(
          repairs === 1
            ? {
                ...flow,
                steps: [
                  { ...flow.steps[0], detail: "" },
                  flow.steps[1],
                  flow.steps[2],
                ],
              }
            : flow,
        ),
      },
    };
  },
});
assert.equal(repairs, 3);
assert.match(repairPrompts[1], /Validation error:/);
assert.match(repairPrompts[1], /Previous JSON/);
let checkpointCalls = 0;
await assert.rejects(
  buildDiagram({
    ...args,
    cache: {},
    checkpoint: async () => {
      checkpointCalls++;
      throw Error("Storage quota reached");
    },
  }),
  /Storage quota/,
);
assert.equal(
  checkpointCalls,
  1,
  "storage errors must not be retried as model errors",
);
const { document } = parseHTML(
  '<html><body><section id="root"></section></body></html>',
);
globalThis.document = document;
const dangerous = structuredClone(result.pack.diagram);
dangerous.nodes[0].label = "<script>alert(1)</script>";
renderDiagram(document.getElementById("root"), dangerous);
assert.equal(document.querySelector("script"), null);
assert.equal(
  document.querySelectorAll("svg g").length,
  result.pack.diagram.nodes.length,
);
assert.match(
  document.getElementById("root").textContent,
  /Read important points/,
);
assert.ok(document.querySelector('[aria-label="Zoom in"]'));
assert.ok(document.querySelector("svg").getAttribute("viewBox"));
delete globalThis.document;
console.log(
  "PASS diagram validation, all-section processing, caching/difficulty, pack import/merge, error/cancel unload and safe SVG rendering",
);
{
  let arrangements = 0,
    unloads = 0;
  const guarded = await buildDiagram({
    id: "ambiguous-map",
    title: "Binary search",
    model: "mock",
    transcript:
      "Binary search finds an element in a sorted array. A base condition reaches the end of the array. The starting index and ending index are described vaguely. Search halves the range. ".repeat(
        3,
      ),
    call: async (_, body) => {
      if (body.keep_alive === 0) {
        unloads++;
        return {};
      }
      const c = claimReply(body);
      if (c) return c;
      arrangements++;
      return {
        message: {
          content: JSON.stringify({
            title: "Binary search",
            detail: "Search a sorted array.",
            branches: [
              {
                label:
                  arrangements === 1 ? "Base condition" : "Search strategy",
                detail:
                  arrangements === 1
                    ? "Stops at the end of the array."
                    : "Halve the search range.",
                children: [],
              },
              {
                label: "Comparison",
                detail: "Compare middle values.",
                children: [],
              },
              { label: "Prerequisite", detail: "Sorted input.", children: [] },
            ],
          }),
        },
      };
    },
  });
  assert.equal(arrangements, 2);
  assert.equal(unloads, 1);
  assert.ok(
    guarded.pack.diagram.nodes.every(
      (n) => !/base condition|stops/i.test(n.label + " " + n.detail),
    ),
  );
  console.log(
    "PASS diagrams reject and repair vague implementation rules instead of presenting them as exact algorithms",
  );
}
