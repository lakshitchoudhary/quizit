import { claimReply, answerReply } from "./model-fixtures.mjs";
import assert from "node:assert/strict";
import { buildStudyPack } from "../extension/generation.mjs";
let calls = 0;
const result = await buildStudyPack({
  id: "lesson",
  title: "Binary search",
  transcript:
    "Binary search uses a sorted array and halves the search range. The narration describes a base condition at the end of the array and a starting index. ".repeat(
      4,
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
    const count = body.format.properties.quiz.minItems;
    if (calls === 2)
      assert.equal(count, 1, "repair replaces only the unsafe question");
    const quiz = Array.from({ length: count }, (_, i) => ({
      question: `Concept ${String.fromCharCode(65 + i + calls * 5)}?`,
      options: ["Sorted range", "Linear scan", "Random order", "All values"],
      answer: 0,
      verdicts: ["supported", "contradicted", "contradicted", "contradicted"],
      explanation: "The source supports the sorted range.",
      evidence: 1,
    }));
    if (calls === 1)
      quiz[0].question = "What is the base condition for stopping?";
    return { message: { content: JSON.stringify({ flashcards: [], quiz }) } };
  },
});
assert.equal(calls, 3, "draft, selective repair and quiz review");
assert.equal(result.pack.quiz.length, 5);
assert.ok(
  !result.pack.quiz.some((q) =>
    (q.question + q.options[q.answer] + q.explanation).includes(
      "base condition",
    ),
  ),
);
console.log(
  "PASS ambiguous implementation rules rejected and selectively repaired before quiz acceptance",
);
