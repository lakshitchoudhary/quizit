import { claimReply, answerReply } from "./model-fixtures.mjs";
import assert from "node:assert/strict";
import { buildStudyPack } from "../extension/generation.mjs";
let calls = 0;
const out = await buildStudyPack({
  id: "fixed",
  title: "Fixed options",
  transcript:
    "A source explains that a sorted range is divided in half to narrow the search. ".repeat(
      8,
    ),
  model: "mock",
  only: "quiz",
  call: async (_, body) => {
    const claimResponse = claimReply(body);
    if (claimResponse) return claimResponse;
    const solvedResponse = answerReply(body);
    if (solvedResponse) return solvedResponse;
    if (body.keep_alive === 0) return {};
    calls++;
    if (calls === 1)
      return {
        message: {
          content: JSON.stringify({
            flashcards: [],
            quiz: Array.from({ length: 5 }, (_, i) => ({
              question: `Original question ${i}?`,
              options: [
                "Wrong one",
                "Wrong two",
                "Supported original answer",
                "Wrong three",
              ],
              answer: 0,
              explanation: "Draft answer needs checking.",
              evidence: 1,
            })),
          }),
        },
      };
    assert.equal(
      body.format.properties.quiz.items.properties.question,
      undefined,
      "review cannot rewrite questions",
    );
    return {
      message: {
        content: JSON.stringify({
          flashcards: [],
          quiz: Array.from({ length: 5 }, () => ({
            answer: 2,
            verdicts: [
              "contradicted",
              "contradicted",
              "supported",
              "contradicted",
            ],
            explanation: "The source supports the original third choice.",
            evidence: 1,
            question: "Untrusted replacement?",
            options: ["Injected"],
          })),
        }),
      },
    };
  },
});
assert.equal(calls, 2);
for (const q of out.pack.quiz) {
  assert.match(q.question, /Original question/);
  assert.equal(q.options[q.answer], "Supported original answer");
  assert.equal(q.options.length, 4);
}
console.log(
  "PASS fixed-choice review corrects answer indices without accepting rewritten questions/options",
);
