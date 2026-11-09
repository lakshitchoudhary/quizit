export function pdfAddress(raw) {
  try {
    const u = new URL(raw);
    if (
      ["file:", "http:", "https:"].includes(u.protocol) &&
      /\.pdf$/i.test(u.pathname)
    ) {
      u.hash = "";
      return u.href;
    }
    if (["edge:", "chrome:", "chrome-extension:"].includes(u.protocol)) {
      for (const key of ["file", "url", "src"]) {
        const nested = u.searchParams.get(key);
        if (!nested) continue;
        const address = pdfAddress(nested);
        if (address) return address;
      }
    }
  } catch {}
  return null;
}
export async function fetchPDFFile(address, signal, fetcher = fetch) {
  const url = pdfAddress(address);
  if (!url) throw Error("The current tab does not expose a PDF address.");
  const response = await fetcher(url, { signal, credentials: "omit" });
  if (!response.ok && response.status !== 0)
    throw Error("PDF could not be read (" + response.status + ").");
  const limit = 25 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit)
    throw Error("Choose a PDF under 25 MB.");
  const reader = response.body?.getReader();
  if (!reader) throw Error("The PDF response is empty.");
  const pieces = [];
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error("Choose a PDF under 25 MB.");
      pieces.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const piece of pieces) {
    bytes.set(piece, offset);
    offset += piece.length;
  }
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
    throw Error(
      "That address did not return a PDF. Use Choose PDF file instead.",
    );
  let filename = "document.pdf";
  try {
    filename =
      decodeURIComponent(new URL(url).pathname.split("/").pop()) || filename;
  } catch {}
  return new File([bytes], filename, { type: "application/pdf" });
}
