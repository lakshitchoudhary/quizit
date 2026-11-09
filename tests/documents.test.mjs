import assert from "node:assert/strict";
import { extractDocument } from "../extension/documents.mjs";
const bytes = Buffer.from(
  "UEsDBBQAAAAIAAAAIQB0JJxTvwAAAD4BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbJWQMU7EQAxFrxJNi3a8oqBASRqgBQouYE2cZMTYHo29S7g9ygJb0FH7/f++3L99VrJu4yI2hNW93gNYWonRolaSjcusjdEtalugYnrHheD2eLyDpOIkfvC9I4z9I814Kt49bU5iWWUIjYqF7uEb3F1DwFpLTuhZBc4y/bEcfgyxUbkwtuZqNxuXAGP/cqbW8kTdKzZ/RqYhwIe2CSZNJybxuIP/8uk850TX/N5WmyYyy7JwidcLY5bfHXB52/gFUEsDBBQAAAAIAAAAIQBhey9DigAAAPIAAAALAAAAX3JlbHMvLnJlbHONzzEOAiEQBdCrkDnAzmphYYDKZluzFyAwuxCBIYBxvb2NxWosbH9+3s+XV4qmB87Nh9LElmJuCnzv5YzYrKdk2sCF8pbiwjWZ3gauKxZjb2YlPI7jCeveAC33ppicgjq5A4j5Wegfm5clWLqwvSfK/cfEVwPEbOpKXcGDq0P3joctRUAt8eOifgFQSwMEFAAAAAgAAAAhAFZAdrHdAAAAUQEAABEAAAB3b3JkL2RvY3VtZW50LnhtbEWQMW7DQAwEv0L4ATojRQpB0QtSJS+gT7RE5I48kJTl/D44uUgzWyzA5e50jIvmvZIEPGsRH4+PyxbRxpQ8b1TRB20kz1ruahXDB7U1HWpLM83kzrLWkt6u1/dUkeUyT8d40+W3a+uwjpi/KIzpgQWaYQ7OBJVQHIwylsKyAssrg1XgRnc1grxR/ulebASuu2Ua4LthpgWMHkzHKc7hUDHIGAvogwyCKw3wSWhC5uCb7mV53QOWrGaUA1D86DauyOJxxqjxyoIF6NkKyvnPMKVeotNOtpOvoul/xPkPUEsBAhQAFAAAAAgAAAAhAHQknFO/AAAAPgEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAAUAAAACAAAACEAYXsvQ4oAAADyAAAACwAAAAAAAAAAAAAAgAHwAAAAX3JlbHMvLnJlbHNQSwECFAAUAAAACAAAACEAVkB2sd0AAABRAQAAEQAAAAAAAAAAAAAAgAGjAQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAArwIAAAAA",
  "base64",
);
const doc = await extractDocument(new File([bytes], "lesson.docx"));
assert.match(doc.text, /Retrieval practice/);
assert.match(doc.text, /original explanation/);
for (const ext of ["txt", "md"]) {
  const source = "Supported source concepts for active recall. ".repeat(12);
  const out = await extractDocument(new File([source], "lesson." + ext));
  assert.equal(out.text, source.trim());
}
await assert.rejects(
  extractDocument(new File(["short"], "short.txt")),
  /Not enough readable/,
);
await assert.rejects(
  extractDocument({ name: "huge.pdf", size: 26 * 1024 * 1024 }),
  /25 MB/,
);
await assert.rejects(
  extractDocument(new File(["x".repeat(150001)], "large.txt")),
  /150,000/,
);
await assert.rejects(
  extractDocument(new File(["data"], "unknown.exe")),
  /Supported files/,
);
const ctrl = new AbortController();
ctrl.abort();
await assert.rejects(
  extractDocument(new File(["data"], "lesson.txt"), () => {}, ctrl.signal),
  { name: "AbortError" },
);
console.log(
  "PASS actual DOCX ZIP parsing, TXT/Markdown extraction, file/text limits, invalid types and pre-cancellation",
);
