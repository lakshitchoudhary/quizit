import assert from "node:assert/strict";
import { buildStudyPack } from "../extension/generation.mjs";
import { claimReply, answerReply } from "./model-fixtures.mjs";
let calls = 0,
  unloads = 0;
const out = await buildStudyPack({
  id: "options",
  title: "Option checks",
  model: "mock",
  only: "quiz",
  transcript:
    "A sorted range is halved after comparing its middle element with the target. ".repeat(
      8,
    ),
  call: async (_, body) => {
    const c = claimReply(body);
    if (c) return c;
    const solved = answerReply(body);
    if (solved) return solved;
    if (body.keep_alive === 0) {
      unloads++;
      return {};
    }
    calls++;
    const count = body.format.properties.quiz.minItems;
    if (calls === 3)
      assert.equal(
        count,
        2,
        "only the multi-answer and unsupported items are replaced",
      );
    const judged = !!body.format.properties.quiz.items.properties.verdicts;
    const quiz = Array.from({ length: count }, (_, i) =>
      judged
        ? {
            answer: 0, // An untrusted extra field cannot override application-derived answers.
            verdicts:
              calls === 2 && i === 0
                ? ["supported", "supported", "not_stated", "contradicted"]
                : calls === 2 && i === 1
                  ? ["not_stated", "contradicted", "not_stated", "contradicted"]
                  : ["contradicted", "supported", "not_stated", "contradicted"],
            explanation: "The source supports only the second choice.",
            evidence: 1,
          }
        : {
            question: `${calls === 1 ? "Original" : "Replacement"} concept ${i}?`,
            options: ["Wrong", "Supported answer", "Unstated", "Opposite"],
            answer: 0,
            explanation: "Draft explanation",
            evidence: 1,
          },
    );
    return { message: { content: JSON.stringify({ flashcards: [], quiz }) } };
  },
});
assert.equal(calls, 4);
assert.equal(unloads, 1);
assert.equal(out.pack.quiz.length, 5);
assert.equal(
  out.pack.quiz.filter((q) => q.question.startsWith("Replacement")).length,
  2,
);
for (const q of out.pack.quiz) {
  assert.equal(q.options[q.answer], "Supported answer");
  assert.equal(q.verification.verdicts[q.answer], "supported");
  assert.equal(
    q.verification.verdicts.filter((x) => x === "supported").length,
    1,
  );
}
console.log(
  "PASS zero/multiple supported options rejected, failed items alone repaired, fixed answers derived locally and verdicts shuffled consistently",
);
