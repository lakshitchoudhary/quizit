import assert from "node:assert/strict";
import { extractDocument } from "../extension/documents.mjs";
import { selectPages } from "../extension/pdf-pages.mjs";
import { pdfAddress, fetchPDFFile } from "../extension/pdf-connect.mjs";

// Synthetic PDF constructed in memory: no real study document is committed.
function pdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    "",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [index, title] of [
    [3, "FIRST_ONLY"],
    [5, "SECOND_ONLY"],
  ]) {
    const stream =
      `BT /F1 12 Tf 40 750 Td (${title}) Tj ` +
      "0 -18 Td (Study retrieval practice improves recall.) Tj ".repeat(12) +
      "ET";
    objects[index] =
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const n of offsets.slice(1))
    text += `${String(n).padStart(10, "0")} 00000 n \n`;
  text += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
assert.deepEqual(selectPages("2, 1-2", 2).pages, [1, 2]);
assert.throws(() => selectPages("3", 2));
assert.equal(
  pdfAddress("file:///example/lesson.pdf#page=2"),
  "file:///example/lesson.pdf",
);
const bytes = pdf();
const fetched = await fetchPDFFile(
  "https://example.org/lesson.pdf",
  undefined,
  async () => new Response(bytes),
);
assert.equal(fetched.size, bytes.length);
await assert.rejects(
  fetchPDFFile(
    "https://example.org/a.pdf",
    undefined,
    async () => new Response("not pdf"),
  ),
  /PDF/,
);
const result = await extractDocument(
  new File([bytes], "lesson.pdf"),
  () => {},
  undefined,
  "none",
  "2",
);
assert.deepEqual(result.selection.pages, [2]);
assert.equal(result.selection.total, 2);
assert.match(result.text, /\[Page 2\]/);
assert.match(result.text, /SECOND_ONLY/);
assert.doesNotMatch(result.text, /FIRST_ONLY/);
console.log(
  "PASS real PDF bytes parsed; only selected page extracted; URL and invalid content checks",
);
