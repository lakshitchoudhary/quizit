import { claimReply, answerReply } from "./model-fixtures.mjs";
import assert from "node:assert/strict";
import {
  schedule,
  dueCards,
  evidenceFor,
  sourceLink,
  mergePack,
  ensureCards,
} from "../extension/learning.mjs";
import { buildStudyPack } from "../extension/generation.mjs";
const now = Date.UTC(2026, 9, 26);
let s = schedule(null, "good", now);
assert.equal(s.due, now + 86400000);
assert.equal(schedule(s, "good", now).interval, 3);
assert.equal(schedule(s, "again", now).due, now + 600000);
assert.equal(schedule(null, "easy", now).interval, 4);
const p = ensureCards({
  flashcards: [
    { front: "Q", back: "A" },
    { front: "Q2", back: "A2", flagged: true },
  ],
  quiz: [],
});
const records = {
  "video:x": { title: "X", pack: p, reviews: { [p.flashcards[0].id]: s } },
};
assert.equal(dueCards(records, now).length, 0);
assert.equal(dueCards(records, now + 86400000).length, 1);
p.flashcards[0].deleted = true;
assert.equal(dueCards(records, now + 86400000).length, 0);
const source =
  "[Page 2]\n[1:23] A supporting source sentence that explains the answer.";
const e = evidenceFor(
  source,
  "A supporting source sentence that explains the answer.",
  1,
);
assert.equal(e.page, 2);
assert.equal(e.time, "1:23");
assert.equal(
  evidenceFor(
    "[0:01] Earlier. [0:20] A later supporting source passage.",
    "[0:20] A later supporting source passage.",
    1,
  ).time,
  "0:20",
);
assert.equal(
  evidenceFor(
    "[Page 1] Earlier. [Page 2] A later supporting source passage.",
    "[Page 2] A later supporting source passage.",
    2,
  ).page,
  2,
);
assert.match(
  sourceLink(
    { kind: "youtube", url: "https://www.youtube.com/watch?v=abcDEF12345" },
    e,
  ),
  /t=83s/,
);
assert.equal(
  evidenceFor(source, "A fabricated source quotation here", 1),
  null,
);
assert.equal(sourceLink({ url: "javascript:alert(1)" }, e), null);
const old = {
  notes: [{ heading: "Keep" }],
  flashcards: [{ front: "Old" }],
  quiz: [{ question: "Keep" }],
};
const fresh = { schemaVersion: 2, flashcards: [{ front: "New" }] };
assert.deepEqual(mergePack(old, fresh, "cards", true).notes, old.notes);
assert.deepEqual(mergePack(old, fresh, "cards", true).quiz, old.quiz);
assert.equal(mergePack(old, fresh, "cards", false), fresh);
for (const only of ["notes", "cards", "quiz"]) {
  let noteCalls = 0,
    practiceCalls = 0;
  const transcript =
    "A supporting source sentence explains the answer. ".repeat(10);
  const out = await buildStudyPack({
    id: "x",
    title: "Lesson",
    transcript,
    model: "mock",
    only,
    call: async (_, b) => {
      const claimResponse = claimReply(b);
      if (claimResponse) return claimResponse;
      const solvedResponse = answerReply(b);
      if (solvedResponse) return solvedResponse;
      if (b.keep_alive === 0) return {};
      let result;
      if (b.format.properties.notes) {
        noteCalls++;
        result = {
          overview: "Overview",
          takeaways: ["a", "b", "c"],
          notes: [0, 1].map((x) => ({
            evidence: 1,
            heading: "Heading",
            explanation: "Detail",
            keyPoints: ["Point"],
            examples: [],
            caveats: [],
          })),
        };
      } else {
        practiceCalls++;
        result = {
          flashcards: Array.from(
            { length: b.format.properties.flashcards.minItems },
            (_, i) => ({
              front: "Card " + String.fromCharCode(65 + i),
              back: "Answer",
              evidence: 1,
            }),
          ),
          quiz: Array.from(
            { length: b.format.properties.quiz.minItems },
            (_, i) => ({
              question: "Question " + i,
              options: ["One", "Two", "Three", "Four"],
              answer: 0,
              verdicts: [
                "supported",
                "contradicted",
                "contradicted",
                "contradicted",
              ],
              explanation: "Explanation",
              evidence: 1,
            }),
          ),
        };
      }
      return { message: { content: JSON.stringify(result) } };
    },
  });
  assert.equal(noteCalls, only === "notes" ? 1 : 0);
  assert.equal(practiceCalls, only === "notes" ? 0 : only === "cards" ? 1 : 2);
  assert.equal(out.pack.flashcards.length, only === "cards" ? 5 : 0);
  assert.equal(out.pack.quiz.length, only === "quiz" ? 5 : 0);
}
console.log(
  "PASS schedule intervals/due dates, excluded flags/deletions, exact evidence, timestamps/pages, safe links, selective merge and zero unwanted generation calls",
);

import { shuffleChoices } from "../extension/learning.mjs";
const hostile = ensureCards({
  flashcards: [
    { id: "__proto__", front: "Q", back: "A" },
    { id: "same", front: "Q2", back: "A2" },
    { id: "same", front: "Q3", back: "A3" },
  ],
  quiz: [],
});
assert.ok(hostile.flashcards.every((c) => c.id !== "__proto__"));
assert.equal(new Set(hostile.flashcards.map((c) => c.id)).size, 3);
const shuffled = shuffleChoices(
  { question: "Q", options: ["One", "Two", "Three", "Four"], answer: 2 },
  () => 0,
);
assert.equal(shuffled.options[shuffled.answer], "Three");
assert.deepEqual(
  new Set(shuffled.options),
  new Set(["One", "Two", "Three", "Four"]),
);
assert.notDeepEqual(shuffled.options, ["One", "Two", "Three", "Four"]);
console.log(
  "PASS unsafe/duplicate imported IDs normalized and shuffled quiz keeps the correct answer",
);
