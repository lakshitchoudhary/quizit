import { claimReply, answerReply } from "./model-fixtures.mjs";
import assert from "node:assert/strict";
import { buildStudyPack } from "../extension/generation.mjs";
import { countValue, parsePack } from "../extension/core.mjs";
const transcript =
  "[0:00] " +
  "A sorted array lets a middle comparison eliminate one half. Every iteration reduces the search interval. ".repeat(
    90,
  ) +
  "[10:00] Final topic: invariant and termination.";
const notes = {
  overview: "A detailed orientation.",
  takeaways: ["Sorted data", "Halving the interval", "Termination"],
  notes: [0, 1].map((i) => ({
    evidence: 1,
    heading: "Topic " + i,
    explanation: "Explanation with detail.",
    keyPoints: ["A supported point."],
    examples: [],
    caveats: [],
  })),
};
let serial = 0,
  loads = 0,
  unloads = 0,
  sourcePrompts = [];
const call = async (path, body) => {
  const claimResponse = claimReply(body);
  if (claimResponse) return claimResponse;
  const solvedResponse = answerReply(body);
  if (solvedResponse) return solvedResponse;
  if (body.keep_alive === 0) {
    unloads++;
    assert.deepEqual(body.messages, []);
    return { done: true };
  }
  loads++;
  assert.equal(body.keep_alive, "15s");
  assert.equal(typeof body.think, "boolean");
  let result;
  if (body.format.properties.notes) {
    sourcePrompts.push(body.messages[1].content);
    result = notes;
  } else {
    const c = body.format.properties.flashcards.minItems,
      q = body.format.properties.quiz.minItems;
    result = {
      flashcards: Array.from({ length: c }, () => ({
        front: "Card " + ++serial + "?",
        back: "Answer",
        supported: true,
        evidence: 1,
      })),
      quiz: Array.from({ length: q }, () => ({
        question: "Question " + ++serial + "?",
        options: ["Linear", "Constant", "Logarithmic", "Quadratic"],
        answer: 2,
        verdicts: ["contradicted", "contradicted", "supported", "contradicted"],
        explanation: "Explanation",
        evidence: 1,
      })),
    };
  }
  return {
    done: true,
    done_reason: "stop",
    message: { content: JSON.stringify(result) },
  };
};
const base = {
  id: "abcDEF12345",
  title: "Video",
  transcript,
  model: "test",
  call,
  signal: new AbortController().signal,
};
const cache = {};
const first = await buildStudyPack({ ...base, cards: 10, quiz: 20, cache });
assert.equal(first.pack.flashcards.length, 10);
assert.equal(first.pack.quiz.length, 20);
assert.equal(unloads, 1);
assert.ok(sourcePrompts.some((p) => p.includes("Final topic")));
assert.equal(first.pack.coverage.sections, 2);
assert.ok(first.pack.quiz.every((q) => q.options[q.answer] === "Logarithmic"));
assert.equal(parsePack(JSON.stringify(first.pack), base.id).notes.length, 4);
const before = loads;
await buildStudyPack({ ...base, cards: 10, quiz: 20, cache });
assert.equal(loads, before);
assert.equal(unloads, 1);
await buildStudyPack({ ...base, cards: 15, quiz: 20, cache });
assert.equal(
  sourcePrompts.length,
  2,
  "notes should be cached when counts change",
);
for (const n of [5, 10, 15, 20, 50, 100]) assert.equal(countValue(n), n);
for (const n of [0, 6, 101, NaN, "5x"]) assert.throws(() => countValue(n));
let cancelledUnload = 0;
const ctrl = new AbortController();
await assert.rejects(
  buildStudyPack({
    ...base,
    signal: ctrl.signal,
    call: async (p, b) => {
      const claimResponse = claimReply(b);
      if (claimResponse) return claimResponse;
      const solvedResponse = answerReply(b);
      if (solvedResponse) return solvedResponse;
      if (b.keep_alive === 0) {
        cancelledUnload++;
        return {};
      }
      ctrl.abort();
      throw Error("cancel");
    },
  }),
);
assert.equal(cancelledUnload, 1);
let errorUnload = 0;
await assert.rejects(
  buildStudyPack({
    ...base,
    call: async (p, b) => {
      const claimResponse = claimReply(b);
      if (claimResponse) return claimResponse;
      const solvedResponse = answerReply(b);
      if (solvedResponse) return solvedResponse;
      if (b.keep_alive === 0) {
        errorUnload++;
        return {};
      }
      return { done_reason: "length" };
    },
  }),
  /output budget/,
);
assert.equal(errorUnload, 1);
const old = {
  videoId: base.id,
  title: "Old",
  overview: "Old summary",
  takeaways: ["a", "b", "c"],
  flashcards: first.pack.flashcards.slice(0, 3),
  quiz: first.pack.quiz.slice(0, 3),
};
assert.ok(parsePack(JSON.stringify(old), base.id));
console.log(
  "PASS: exact asymmetric counts; complete section coverage; cached reuse; count change avoids notes regeneration; answer rotation; cancellation/error unload; backward compatibility.",
);
