import assert from "node:assert/strict";
import { createOCR } from "../extension/ocr.mjs";
let starts = 0,
  stops = 0;
const factory = async () => {
  starts++;
  return {
    recognize: async () => ({
      data: { text: " Retrieved knowledge. ", confidence: 96 },
    }),
    terminate: async () => {
      stops++;
    },
  };
};
const ocr = await createOCR(undefined, undefined, factory);
assert.deepEqual(await ocr.read("image"), {
  text: "Retrieved knowledge.",
  confidence: 96,
});
await Promise.all([ocr.close(), ocr.close()]);
assert.equal(stops, 1, "worker closes exactly once");
await assert.rejects(ocr.read("image"), /closed/);
const before = new AbortController();
before.abort();
await assert.rejects(createOCR(undefined, before.signal, factory), {
  name: "AbortError",
});
assert.equal(starts, 1, "pre-cancelled imports must not start a worker");
const during = new AbortController();
let resolve;
const starting = createOCR(
  undefined,
  during.signal,
  () =>
    new Promise((r) => {
      resolve = r;
    }),
);
await new Promise((r) => setTimeout(r, 0));
during.abort();
await assert.rejects(starting, { name: "AbortError" });
resolve(await factory());
await new Promise((r) => setTimeout(r, 0));
assert.equal(stops, 2, "late-starting worker is terminated after cancellation");
const active = new AbortController();
const running = await createOCR(undefined, active.signal, async () => ({
  recognize: () => new Promise(() => {}),
  terminate: async () => {
    stops++;
  },
}));
const reading = running.read("image");
active.abort();
await assert.rejects(reading, { name: "AbortError" });
await running.close();
assert.equal(stops, 3, "cancel and close must not terminate twice");
await assert.rejects(
  createOCR(undefined, undefined, async () => {
    throw Error("worker startup failed");
  }),
  /startup failed/,
);
console.log(
  "PASS OCR normal read, startup/read cancellation, idempotent close, startup failures and closed-worker feedback",
);
