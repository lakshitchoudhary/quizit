import assert from "node:assert/strict";
import { sourceDirectionOK } from "../extension/source-processing.mjs";
const source =
  "If the middle element is greater than the target, search the left half. If the middle element is less than the target, search the right half.";
const q = {
  question:
    "If the middle element is greater than the target, which half is searched?",
  options: ["Right half", "Left half"],
  answer: 0,
};
assert.equal(sourceDirectionOK(source, q), false);
assert.equal(sourceDirectionOK(source, { ...q, answer: 1 }), true);
assert.equal(
  sourceDirectionOK(
    "If the middle element is greater than the target, search the right half.",
    q,
  ),
  true,
  "use the supplied rule rather than assuming ascending order",
);
assert.equal(
  sourceDirectionOK("No explicit direction is specified.", q),
  true,
  "unknown is not a proof or automatic rejection",
);
console.log(
  "PASS explicit source direction contradictions rejected without assuming unstated rules",
);
