import assert from "node:assert/strict";
import { buildStudyPack } from "../extension/generation.mjs";
import { claimReply } from "./model-fixtures.mjs";
let generation = 0,
  judges = 0,
  solvers = 0,
  unloads = 0;
const out = await buildStudyPack({
  id: "corroboration",
  title: "Independent answer solving",
  model: "mock",
  only: "quiz",
  transcript:
    "A sorted range is halved after comparing its middle element with the target. ".repeat(
      8,
    ),
  call: async (_, body) => {
    if (body.keep_alive === 0) {
      unloads++;
      return {};
    }
    const claim = claimReply(body);
    if (claim) return claim;
    const props = body.format.properties;
    if (props.answers) {
      solvers++;
      const n = props.answers.minItems;
      return {
        message: {
          content: JSON.stringify({
            answers: Array.from({ length: n }, (_, i) =>
              solvers === 1 && i === 0 ? "C" : "B",
            ),
          }),
        },
      };
    }
    const count = props.quiz.minItems;
    if (props.quiz.items.properties.verdicts) {
      judges++;
      assert.equal(count, judges === 1 ? 5 : 1);
      return {
        message: {
          content: JSON.stringify({
            flashcards: [],
            quiz: Array.from({ length: count }, () => ({
              verdicts: [
                "contradicted",
                "supported",
                "not_stated",
                "contradicted",
              ],
              explanation: "Only the second choice follows the source.",
              evidence: 1,
            })),
          }),
        },
      };
    }
    generation++;
    assert.equal(count, generation === 1 ? 5 : 1);
    return {
      message: {
        content: JSON.stringify({
          flashcards: [],
          quiz: Array.from({ length: count }, (_, i) => ({
            question: `${generation === 1 ? "Original" : "Replacement"} supported concept ${i}?`,
            options: ["Wrong", "Supported answer", "Unstated", "Opposite"],
            answer: 0,
            explanation: "Draft explanation",
            evidence: 1,
          })),
        }),
      },
    };
  },
});
assert.equal(unloads, 1);
assert.equal(generation, 2);
assert.equal(judges, 2);
assert.equal(solvers, 2);
assert.equal(
  out.pack.quiz.filter((q) => q.question.startsWith("Replacement")).length,
  1,
);
assert.ok(
  out.pack.quiz.every(
    (q) =>
      q.options[q.answer] === "Supported answer" && q.verification.corroborated,
  ),
);
console.log(
  "PASS separate solver disagreement rejects and repairs only that item; successful checks retained; model unloaded",
);
