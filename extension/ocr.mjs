export async function createOCR(progress = () => {}, signal, workerFactory) {
  signal?.throwIfAborted();
  const createWorker =
    workerFactory ||
    (await import("./vendor/ocr/tesseract.esm.min.js")).default.createWorker;
  const base = new URL("./vendor/ocr/", import.meta.url).href;
  let worker, closing;
  const terminate = () => {
    if (!worker) return Promise.resolve();
    closing ||= Promise.resolve().then(() => worker.terminate());
    return closing;
  };
  const pending = Promise.resolve().then(() =>
    createWorker("eng", 1, {
      workerPath: base + "worker.min.js",
      corePath: base,
      langPath: base,
      workerBlobURL: false,
      logger: (m) =>
        !signal?.aborted &&
        progress(
          "OCR · " +
            m.status +
            (Number.isFinite(m.progress)
              ? " · " + Math.round(m.progress * 100) + "%"
              : ""),
        ),
    }),
  );
  pending
    .then((w) => {
      worker = w;
      if (signal?.aborted) terminate().catch(() => {});
    })
    .catch(() => {});
  async function cancellable(promise) {
    signal?.throwIfAborted();
    let listener;
    const aborted = new Promise((_, reject) => {
      listener = () => {
        terminate().catch(() => {});
        reject(new DOMException("OCR cancelled", "AbortError"));
      };
      signal?.addEventListener("abort", listener, { once: true });
      if (signal?.aborted) listener();
    });
    try {
      return await Promise.race([promise, aborted]);
    } finally {
      signal?.removeEventListener("abort", listener);
    }
  }
  worker = await cancellable(pending);
  return {
    async read(image) {
      if (closing)
        throw Error("OCR worker is closed. Reopen the document to retry.");
      signal?.throwIfAborted();
      const { data } = await cancellable(worker.recognize(image));
      return { text: data.text.trim(), confidence: data.confidence };
    },
    async close() {
      await terminate();
    },
  };
}
