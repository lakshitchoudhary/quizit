import { claimReply, answerReply } from "./model-fixtures.mjs";
import assert from "node:assert/strict";
import {
  guardImplementationNote,
  cleanSource,
  sourceSections,
  practicePassages,
} from "../extension/source-processing.mjs";
import { buildStudyPack } from "../extension/generation.mjs";
const pdf = [1, 2, 3]
  .map(
    (i) =>
      `[Page ${i}]\nRepeated journal header\nUnique body ${i} discusses impor-\ntant ideas.\nRepeated footer`,
  )
  .join("\n");
const clean = cleanSource(pdf);
assert.ok(!clean.includes("Repeated journal header"));
assert.ok(clean.includes("important ideas"));
assert.ok(clean.includes("[Page 3]"));
const text =
  "An English concept with a typographic dash — is explained. ".repeat(180);
assert.ok(
  sourceSections(text).length < 4,
  "one typographic character must not force 2200-character chunks",
);
const parts = [
  "EARLY concept. ".repeat(450),
  "LATE distinct concept. ".repeat(350),
];
const selected = practicePassages(parts, 0, 1);
assert.deepEqual([...new Set(selected.map((x) => x.section))], [1, 2]);
assert.ok(selected.every((x) => x.source.includes(x.quote)));
let loads = 0,
  unloads = 0;
const result = await buildStudyPack({
  id: "test",
  title: "Lesson",
  transcript: parts.join("\n"),
  model: "mock",
  only: "cards",
  call: async (_, body) => {
    const claimResponse = claimReply(body);
    if (claimResponse) return claimResponse;
    const solvedResponse = answerReply(body);
    if (solvedResponse) return solvedResponse;
    if (body.keep_alive === 0) {
      unloads++;
      return {};
    }
    loads++;
    const count = body.format.properties.flashcards.minItems;
    if (loads === 2)
      assert.equal(count, 1, "repair must regenerate only one missing card");
    return {
      message: {
        content: JSON.stringify({
          flashcards: Array.from(
            { length: loads === 1 ? 4 : count },
            (_, i) => ({
              front: `Concept ${String.fromCharCode(65 + loads)} ${String.fromCharCode(65 + i)}?`,
              back: "Supported answer",
              evidence: 1,
            }),
          ),
          quiz: [],
        }),
      },
    };
  },
});
assert.equal(result.pack.flashcards.length, 5);
assert.equal(loads, 2);
assert.equal(unloads, 1);
let reviewed = 0;
const checked = await buildStudyPack({
  id: "risk",
  title: "Lesson",
  transcript: parts.join("\n"),
  model: "mock",
  only: "cards",
  call: async (_, body) => {
    const claimResponse = claimReply(body);
    if (claimResponse) return claimResponse;
    const solvedResponse = answerReply(body);
    if (solvedResponse) return solvedResponse;
    if (body.keep_alive === 0) return {};
    reviewed++;
    const count = body.format.properties.flashcards.minItems;
    if (reviewed === 2)
      assert.equal(count, 1, "only the risky card should be reviewed");
    const flashcards = Array.from({ length: count }, (_, i) => ({
      front: `Supported concept ${String.fromCharCode(65 + i)}?`,
      back: "A conceptual explanation.",
      evidence: 1,
    }));
    if (reviewed === 1)
      flashcards[0] = {
        front: "What is the base case?",
        back: "When the ending index reaches the end.",
        evidence: 1,
      };
    else flashcards[0].front = "What relationship connects the concepts?";
    return { message: { content: JSON.stringify({ flashcards, quiz: [] }) } };
  },
});
assert.equal(reviewed, 2);
assert.ok(!JSON.stringify(checked.pack.flashcards).includes("base case"));
console.log(
  "PASS conservative cleaning, Unicode chunk sizing, distributed literal evidence, selective repair and immediate unload",
);

const guarded = guardImplementationNote({
  explanation:
    "Binary search halves the range. A base condition stops when it reaches the end of the array.",
  keyPoints: ["Set the ending index to the middle value."],
  examples: [],
  caveats: [],
});
assert.equal(guarded.explanation, "Binary search halves the range.");
assert.ok(guarded.caveats.length);
