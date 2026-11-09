import { selectPages } from "./pdf-pages.mjs";
import { createOCR } from "./ocr.mjs";
export async function extractDocument(
  file,
  progress = () => {},
  signal,
  ocrMode = "missing",
  pageRange = "",
) {
  if (!file || file.size > 25 * 1024 * 1024)
    throw Error("Choose a document under 25 MB.");
  if (!["none", "missing", "all"].includes(ocrMode))
    throw Error("Choose a valid OCR mode.");
  signal?.throwIfAborted();
  const ext = file.name.split(".").pop().toLowerCase();
  let text = "",
    warnings = [],
    ocr,
    selection;
  const recognize = async (image) => {
    ocr ||= await createOCR(progress, signal);
    const result = await ocr.read(image);
    if (result.confidence < 70)
      warnings.push(
        "OCR confidence is low. Check the extracted text carefully.",
      );
    return result.text;
  };
  try {
    if (["txt", "md"].includes(ext)) text = await file.text();
    else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      if (ocrMode === "none")
        throw Error("Choose an English OCR mode before importing an image.");
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 2500 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        try {
          text = await recognize(canvas);
        } finally {
          canvas.width = canvas.height = 0;
        }
      } finally {
        bitmap.close();
      }
    } else if (ext === "docx") {
      const bundled = await import("./vendor/mammoth.browser.js");
      const result = await (
        globalThis.mammoth || bundled.default
      ).extractRawText({ arrayBuffer: await file.arrayBuffer() });
      text = result.value;
      warnings = result.messages.map((m) => m.message);
    } else if (ext === "pdf") {
      const pdfjs = await import("./vendor/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "./vendor/pdf.worker.min.mjs",
        import.meta.url,
      ).href;
      const task = pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        isEvalSupported: false,
        useWasm: false,
        cMapUrl: new URL("./vendor/cmaps/", import.meta.url).href,
        cMapPacked: true,
        standardFontDataUrl: new URL(
          "./vendor/standard_fonts/",
          import.meta.url,
        ).href,
      });
      try {
        const pdf = await task.promise;
        selection = selectPages(pageRange, pdf.numPages);
        progress(
          "PDF: " + pdf.numPages + " pages · reading " + selection.label,
        );
        const empty = [];
        for (const [index, i] of selection.pages.entries()) {
          signal?.throwIfAborted();
          progress(
            "Reading PDF page " +
              i +
              " · selected " +
              (index + 1) +
              " / " +
              selection.pages.length,
          );
          const page = await pdf.getPage(i),
            content = await page.getTextContent();
          let body = content.items
            .map((x) => ("str" in x ? x.str + (x.hasEOL ? "\n" : " ") : ""))
            .join("")
            .trim();
          if (
            ocrMode === "all" ||
            (ocrMode === "missing" && body.length < 80)
          ) {
            progress("OCR PDF page " + i + " / " + pdf.numPages);
            const original = page.getViewport({ scale: 1 });
            const scale = Math.min(
              2.5,
              2500 / Math.max(original.width, original.height),
            );
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const render = page.render({
              canvasContext: canvas.getContext("2d"),
              viewport,
              background: "white",
            });
            const cancel = () => render.cancel();
            signal?.addEventListener("abort", cancel, { once: true });
            try {
              await render.promise;
              signal?.throwIfAborted();
              body = await recognize(canvas);
            } finally {
              signal?.removeEventListener("abort", cancel);
              canvas.width = canvas.height = 0;
            }
          }
          if (body.length < 20) empty.push(i);
          text += "\n\n[Page " + i + "]\n" + body;
          page.cleanup();
          signal?.throwIfAborted();
          if (text.length > 150000)
            throw Error(
              "The selected text exceeds 150,000 characters. Choose a smaller PDF page range, for example 1-20, then click Apply.",
            );
        }
        if (empty.length)
          warnings.push(
            "Little or no readable text on pages " +
              empty.join(", ") +
              (ocrMode === "none"
                ? ". Choose OCR for scanned pages."
                : ". OCR could not read those pages reliably."),
          );
      } catch (e) {
        if (e.name === "PasswordException")
          throw Error("This PDF needs a password. Import an unlocked copy.");
        throw e;
      } finally {
        await task.destroy();
      }
    } else
      throw Error(
        "Supported files: PDF, DOCX, TXT, Markdown, PNG, JPEG and WebP.",
      );
    signal?.throwIfAborted();
    if (text.length > 150000)
      throw Error(
        "The selected text exceeds 150,000 characters. Choose a smaller PDF page range, for example 1-20, then click Apply.",
      );
    if (text.replace(/\[Page \d+\]/g, "").trim().length < 150)
      throw Error(
        "Not enough readable text. Enable OCR for scans, or use a clearer image with at least 150 characters.",
      );
    if (ocr)
      warnings.push(
        "English OCR used. Check names, numbers, formulas and reading order before generating.",
      );
    return {
      text: text.trim(),
      title: file.name.replace(/\.[^.]+$/, ""),
      warnings: [...new Set(warnings)],
      filename: file.name,
      selection,
    };
  } finally {
    await ocr?.close();
  }
}
