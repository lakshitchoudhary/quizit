import assert from "node:assert/strict";
import {
  sharedClaims,
  validClaims,
  claimPassages,
} from "../extension/claims.mjs";
const parts = [
  "[Page 1] A sorted array supports eliminating half of the search range after a middle comparison. ".repeat(
    4,
  ),
  "[Page 2] A guard failure exits a trace; a hot exit may later be recorded as a branch trace. ".repeat(
    4,
  ),
];
let calls = 0;
const cache = {};
const options = {
  parts,
  model: "local",
  cache,
  call: async (_, b) => {
    calls++;
    assert.equal(b.keep_alive, "15s");
    return {
      message: {
        content: JSON.stringify({
          claims: [{ statement: "A conditional source claim.", passage: 1 }],
        }),
      },
    };
  },
};
const first = await sharedClaims(options);
assert.equal(calls, 2);
assert.equal(first.cacheHits, 0);
assert.ok(first.claims.every((c) => parts[c.section - 1].includes(c.quote)));
await sharedClaims({ ...options, difficulty: "advanced", only: "diagram" });
assert.equal(calls, 2, "output/level changes reuse the same source analysis");
await sharedClaims({ ...options, model: "different" });
assert.equal(calls, 4, "model changes invalidate claims");
await sharedClaims({ ...options, parts: [parts[0] + " New qualification."] });
assert.equal(calls, 5, "source edits invalidate claims");
assert.equal(
  validClaims(
    {
      claims: [
        {
          statement: "Invented",
          quote: "A fabricated quotation that is not in the source.",
        },
      ],
    },
    parts[0],
  ),
  false,
);
const fallback = await sharedClaims({
  ...options,
  cache: {},
  call: async () => ({
    message: {
      content: '{"claims":[{"statement":"Bad reference","passage":999}]}',
    },
  }),
});
assert.equal(fallback.fallbackSections, 2);
assert.ok(fallback.claims.every((c) => parts[c.section - 1].includes(c.quote)));
assert.deepEqual(
  [...new Set(claimPassages(first.claims).map((c) => c.section))],
  [1, 2],
);
let quotaCalls = 0;
await assert.rejects(
  sharedClaims({
    ...options,
    cache: {},
    call: async (...args) => {
      quotaCalls++;
      return options.call(...args);
    },
    checkpoint: async () => {
      throw Error("quota");
    },
  }),
  /quota/,
);
assert.equal(quotaCalls, 1, "storage errors must not trigger model retries");
const ctrl = new AbortController();
ctrl.abort();
await assert.rejects(sharedClaims({ ...options, signal: ctrl.signal }), {
  name: "AbortError",
});
console.log(
  "PASS shared source/model cache isolation, literal citations, invalid-reference fallback, section distribution, quota propagation and cancellation",
);
