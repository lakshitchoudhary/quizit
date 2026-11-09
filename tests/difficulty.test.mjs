import { claimReply, answerReply } from "./model-fixtures.mjs";
import assert from "node:assert/strict";
import { buildStudyPack } from "../extension/generation.mjs";
import { difficultyGuide, promptFor } from "../extension/core.mjs";
let calls = 0;
const prompts = [];
const cache = {};
const options = {
  id: "test",
  title: "Recall",
  transcript:
    "Retrieval practice means recalling information before checking the answer. ".repeat(
      5,
    ),
  model: "mock",
  cards: 5,
  quiz: 5,
  only: "cards",
  cache,
  call: async (_, b) => {
    const claimResponse = claimReply(b);
    if (claimResponse) return claimResponse;
    const solvedResponse = answerReply(b);
    if (solvedResponse) return solvedResponse;
    if (b.keep_alive === 0) return {};
    calls++;
    prompts.push(b.messages[1].content);
    return {
      message: {
        content: JSON.stringify({
          flashcards: Array.from({ length: 5 }, (_, i) => ({
            front: "Question " + String.fromCharCode(65 + i),
            back: "Supported answer",
            evidence: 1,
          })),
          quiz: [],
        }),
      },
    };
  },
};
await buildStudyPack({ ...options, difficulty: "beginner" });
assert.equal(calls, 1);
assert.ok(prompts.every((x) => x.startsWith("Beginner:")));
await buildStudyPack({ ...options, difficulty: "beginner" });
assert.equal(calls, 1);
await buildStudyPack({ ...options, difficulty: "advanced" });
assert.equal(calls, 2);
assert.ok(prompts.slice(1).every((x) => x.startsWith("Advanced:")));
assert.match(
  promptFor("test", "Recall", options.transcript, {
    cards: 5,
    quiz: 5,
    difficulty: "advanced",
  }),
  /Advanced:/,
);
assert.throws(() => difficultyGuide("invalid"));
console.log(
  "PASS difficulty affects drafting, review, manual prompts, and cache isolation; repeated same level reuses results",
);
