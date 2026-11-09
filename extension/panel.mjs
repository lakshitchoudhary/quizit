import { buildDiagram } from "./diagrams.mjs";
import { renderDiagram } from "./diagram-view.mjs";
import { pageRangeKey } from "./pdf-pages.mjs";
import { pdfAddress, fetchPDFFile } from "./pdf-connect.mjs";
import {
  ensureCards,
  schedule,
  dueCards,
  sourceLink,
  mergePack,
  evidenceFor,
} from "./learning.mjs";
import { extractDocument } from "./documents.mjs";
import {
  videoId,
  parsePack,
  promptFor,
  countValue,
  cardOK,
  quizOK,
} from "./core.mjs";
import { buildStudyPack } from "./generation.mjs";
import { sourceIdentity, readPageText } from "./sources.mjs";
import { readCaptions } from "./captions.mjs";
const $ = (id) => document.getElementById(id);
let session = null,
  view = "summary",
  card = 0,
  flipped = false,
  question = 0,
  controller = null,
  revision = 0;
const storage = chrome.storage.local;
let lastPDFFile = null,
  lastPdfAddress = null;
const status = (text, error = false) => {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
};
const run = (fn) => async () => {
  try {
    await fn();
  } catch (e) {
    status(e.message || String(e), true);
  }
};
const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};
const button = (text, fn, cls = "secondary") => {
  const b = node("button", text, cls);
  b.addEventListener("click", run(fn));
  return b;
};
function save() {
  if (!session) return Promise.resolve();
  session.updatedAt = new Date().toISOString();
  return storage.set({
    ["video:" + session.id]: JSON.parse(JSON.stringify(session)),
  });
}
function sourceChanged() {
  const length = $("transcript").value.length;
  $("charCount").textContent = `${length.toLocaleString()} characters`;
  $("sourceBadge").textContent = length >= 150 ? "Ready" : "Needed";
  $("readyBadge").textContent =
    length >= 150 ? "Ready to study" : "Add material";
  $("readyBadge").classList.toggle("ready", length >= 150);
  $("generate").disabled = length < 150 || !!controller;
}
function stop() {
  controller?.abort();
}
function counts() {
  return {
    difficulty: $("difficulty").value,
    cards: countValue($("cardCount").value),
    quiz: countValue($("quizCount").value),
  };
}
function busy(value) {
  $("study").inert = value;
  [
    "generate",
    "creationType",
    "diagramKind",
    "addFile",
    "applyPdfPages",
    "generateNotes",
    "generateCards",
    "generateQuiz",
    "reviewToday",
    "restoreItems",
    "export",
    "choosePdf",
    "enablePdf",
    "pdfFile",
    "pdfOCR",
    "pdfPages",
    "connect",
    "allowArticles",
    "read",
    "readSelection",
    "newText",
    "textFile",
    "openSaved",
    "savedSources",
    "sourceTitle",
    "model",
    "mode",
    "difficulty",
    "ocrMode",
    "cardCount",
    "quizCount",
    "clear",
    "import",
    "copy",
  ].forEach((id) => ($(id).disabled = value));
  $("generate").disabled =
    value || !session || $("transcript").value.trim().length < 150;
  $("creationType").disabled = value || $("mode").value !== "local";
  $("cancel").hidden = !value;
  $("cancel").textContent = "Cancel task";
}
async function connect() {
  view = "summary";
  status("Connecting to the current page…");
  stop();
  const token = ++revision;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const address = pdfAddress(tab?.url);
  if (address) {
    await connectPDF(address, tab.id);
    return;
  }
  if (!tab?.url) {
    $("articleAccess").hidden = false;
    throw Error(
      "Edge has not shared this tab’s address. For automatic PDF detection, click Enable automatic PDF connection below. For websites, Enable article access.",
    );
  }
  if (/^file:/i.test(tab.url)) {
    status(
      "The local file is not recognized as a PDF. Use Choose PDF file below.",
    );
    return;
  }
  const identity = sourceIdentity(tab.url);
  if (!identity)
    throw Error(
      "Open an article, Wikipedia page or YouTube video. For PDFs and other material, use New pasted text.",
    );
  lastPDFFile = null;
  lastPdfAddress = null;
  const { id } = identity;
  const saved = await storage.get("video:" + id);
  if (token !== revision) return;
  session = saved["video:" + id] || {
    id,
    title: (tab.title || "Reading material").replace(/ - YouTube$/, ""),
    transcript: "",
    pack: null,
    answers: {},
    known: [],
  };
  Object.assign(session, identity);
  session.tabId = tab.id;
  card = 0;
  question = 0;
  flipped = false;
  $("articleAccess").hidden = true;
  showSource();
  $("source").open = false;
  $("transcript").value = session.transcript;
  $("json").value = "";
  sourceChanged();
  render();
  status(
    session.pack
      ? "Saved study pack restored. Pick up where you left off."
      : "Source connected. Reading the available text…",
  );
  // Caption capture is independent of AI generation, including in manual mode.
  // Reuse saved transcripts instead of fetching them again on every opening.
  if (session.transcript.trim().length < 150) await readSource();
  if (token !== revision) return;
  if (!session.pack)
    status(
      "Source ready. Choose your counts, then click Start creating or a section button.",
    );
}
async function readSource(selectionOnly = false) {
  stop();
  if (!session) {
    await connect();
    return;
  }
  const token = revision,
    target = session;
  if (target.kind === "text") {
    status("Paste or import your material below, then generate.");
    return;
  }
  if (!target.tabId)
    throw Error(
      "This is a saved session. Connect its source page to read it again.",
    );
  if (target.kind === "article") {
    status(
      selectionOnly ? "Reading your selected passage…" : "Reading the article…",
    );
    let result;
    try {
      [result] = await chrome.scripting.executeScript({
        target: { tabId: target.tabId },
        func: readPageText,
        args: [target.url, selectionOnly],
      });
    } catch {
      $("articleAccess").hidden = false;
      throw Error(
        "Edge blocked reading this page. Use Enable article access above. For PDFs, use Choose PDF file above.",
      );
    }
    if (token !== revision) return;
    const data = result?.result;
    if (!data?.text) {
      if (data?.pdf) {
        $("articleAccess").hidden = true;
        status(
          "This is a PDF viewer. Download the PDF if needed, then use Choose PDF file above.",
        );
        return;
      }
      throw Error(
        data?.error || "Could not read this page. Paste its text instead.",
      );
    }
    session.transcript = data.text;
    session.title = data.title;
    session.scope = data.scope;
    $("transcript").value = data.text;
    showSource();
    sourceChanged();
    await save();
    status(data.scope + " captured. Check the source text before generating.");
    return;
  }
  status("Looking for the video transcript…");
  let captionResult;
  try {
    [captionResult] = await chrome.scripting.executeScript({
      target: { tabId: target.tabId },
      world: "MAIN",
      func: readCaptions,
      args: [target.id],
    });
  } catch (e) {
    captionResult = { result: { error: e.message } };
  }
  if (token !== revision) return;
  if (captionResult?.result?.text) {
    session.transcript = captionResult.result.text;
    session.title = captionResult.result.title;
    $("transcript").value = session.transcript;
    showSource();
    sourceChanged();
    await save();
    status("Full caption track captured.");
    return;
  }
  status("Opening YouTube’s transcript panel… This can take up to 25 seconds.");
  await chrome.scripting.executeScript({
    target: { tabId: target.tabId },
    files: ["transcript.js"],
  });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: target.tabId },
    func: async (id) => {
      try {
        return { value: await readTranscript(id) };
      } catch (e) {
        return { error: e.message };
      }
    },
    args: [target.id],
  });
  if (token !== revision) return;
  if (!result?.result?.value)
    throw Error(
      result?.result?.error ||
        "Could not read the transcript. Paste it manually.",
    );
  $("transcript").value = result.result.value.text;
  session.transcript = $("transcript").value;
  session.title = result.result.value.title;
  $("videoTitle").textContent = session.title;
  sourceChanged();
  await save();
  status(
    "Transcript captured. Check that it covers the full video before generating.",
  );
}
async function prepare() {
  if (!session) await connect();
  session.transcript = $("transcript").value.trim();
  if (session.transcript.length > 150000)
    throw Error(
      "This transcript is too large for this version. Use a shorter section and treat the pack as covering only that section.",
    );
  const prompt = promptFor(
    session.id,
    session.title,
    session.transcript,
    counts(),
  );
  await save();
  return prompt;
}
async function accept(raw, provenance, only = "all") {
  let pack = parsePack(raw, session.id);
  const sameSource = session.packText === session.transcript;
  for (const item of [...(pack.notes || []), ...pack.flashcards, ...pack.quiz])
    if (item.evidence) {
      item.evidence = evidenceFor(
        session.transcript,
        item.evidence.quote || item.evidence,
        item.evidence.section,
      );
    }
  pack = ensureCards(mergePack(session.pack, pack, only, sameSource));
  session.packText = session.transcript;
  session.sourceEdited = false;
  pack.source = {
    kind: session.kind || "youtube",
    url: session.url || "",
    scope: session.scope || "Full supplied text",
  };
  session.pack = pack;
  if (only === "all" || only === "quiz" || !sameSource) session.answers = {};
  if (only === "all" || only === "cards" || !sameSource) session.known = [];
  if (!sameSource) session.reviews = {};
  session.provenance = provenance;
  session.generatedAt = new Date().toISOString();
  if (only !== "all") view = only === "notes" ? "summary" : only;
  card = 0;
  question = 0;
  flipped = false;
  await save();
  await refreshLibrary();
  $("source").open = false;
  $("importSection").open = false;
  $("createPanel").open = false;
  render();
  $("studyNav").scrollIntoView?.({ block: "start" });
  status("Study pack ready. Read the summary, then test your recall.");
}
function render() {
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.view === view);
    b.setAttribute("aria-pressed", String(b.dataset.view === view));
  });
  const root = $("study"),
    p = session?.pack;
  $("createPanel").hidden = view === "review";
  $("packActions").hidden = !p || view === "review";
  if (view === "review") {
    renderReview(root);
    return;
  }
  if (!p) {
    root.replaceChildren(node("div", "", "empty"));
    const e = root.firstChild;
    e.append(
      node("div", "✦", "empty-mark"),
      node("h2", "Less rereading. More remembering."),
      node("p", "Your notes, cards and quiz will appear here."),
    );
    return;
  }
  root.replaceChildren();
  if (view === "diagram") {
    renderDiagram(root, p.diagram);
    return;
  }
  if (view === "summary") {
    root.append(
      node("p", session.provenance || "Imported study pack", "progress"),
      node("p", p.overview, "overview"),
      node("h2", "THE IDEAS TO TAKE WITH YOU", "section-label"),
    );
    p.takeaways.forEach((text, i) => {
      const row = node("div", undefined, "takeaway");
      row.append(
        node("span", String(i + 1).padStart(2, "0"), "number"),
        node("span", text),
      );
      root.append(row);
    });
    if (p.notes?.length) {
      root.append(node("h2", "DETAILED STUDY NOTES", "section-label"));
      p.notes.forEach((n) => {
        const section = node("article", undefined, "note-section");
        section.append(node("h2", n.heading));
        if (n.sourceRange)
          section.append(
            node("p", "Source section · " + n.sourceRange, "hint"),
          );
        section.append(node("p", n.explanation, "note-explanation"));
        if (n.evidence?.quote) {
          const cite = node("details");
          cite.append(
            node(
              "summary",
              n.evidence.page
                ? `Source · page ${n.evidence.page}`
                : n.evidence.time
                  ? `Source · ${n.evidence.time}`
                  : `Source · section ${n.evidence.section}`,
            ),
            node("p", n.evidence.quote),
          );
          section.append(cite);
        }
        const points = node("ul");
        n.keyPoints.forEach((t) => points.append(node("li", t)));
        section.append(points);
        for (const [label, lines] of [
          ["Examples from the source", n.examples],
          ["Limits and unclear details", n.caveats],
        ]) {
          if (lines.length) {
            section.append(node("h3", label));
            lines.forEach((t) =>
              section.append(node("p", t, "note-explanation")),
            );
          }
        }
        root.append(section);
      });
      if (p.coverage)
        root.append(
          node(
            "p",
            p.coverage.sections +
              " source sections processed · " +
              p.coverage.sourceCharacters.toLocaleString() +
              " source characters. " +
              p.coverage.practice,
            "hint",
          ),
        );
    } else
      root.append(
        node(
          "p",
          "Choose Generate notes to add detailed notes for this source.",
          "hint",
        ),
      );
    root.append(
      node(
        "p",
        "AI-generated material can be wrong. Check uncertain claims against the source.",
        "hint",
      ),
    );
  } else if (view === "cards") {
    const cards = p.flashcards.filter((c) => !c.deleted);
    if (!cards.length) {
      root.append(node("p", "No cards yet. Choose Generate cards."));
      return;
    }
    card %= cards.length;
    const c = cards[card];
    root.append(
      node(
        "div",
        `CARD ${card + 1} OF ${cards.length} · ${session.reviews?.[c.id]?.reviews || 0} reviews of this card`,
        "progress",
      ),
    );
    const face = button(
      "",
      () => {
        flipped = !flipped;
        render();
      },
      "flashcard",
    );
    face.setAttribute(
      "aria-label",
      flipped ? "Show question" : "Reveal answer",
    );
    face.append(
      node("span", flipped ? "THE ANSWER" : "RECALL BEFORE REVEALING", "hint"),
      node("span", flipped ? c.back : c.front, "face"),
      node(
        "span",
        flipped ? "Click to see the question" : "Click to reveal answer",
        "hint",
      ),
    );
    root.append(face);
    if (flipped) {
      evidenceUI(root, c, p.source);
      ratingUI(root, c, async () => {
        card = (card + 1) % cards.length;
        flipped = false;
        render();
      });
    }
    itemTools(root, c, "cards");
    const controls = node("div", undefined, "between");
    controls.append(
      button("← Previous", () => {
        card = (card - 1 + cards.length) % cards.length;
        flipped = false;
        render();
      }),
      button("Next →", () => {
        card = (card + 1) % cards.length;
        flipped = false;
        render();
      }),
    );
    root.append(controls);
  } else {
    const quizzes = p.quiz
      .map((q, i) => ({ ...q, originalIndex: i }))
      .filter((q) => !q.deleted);
    if (!quizzes.length) {
      root.append(node("p", "No questions yet. Choose Generate quiz."));
      return;
    }
    if (question >= quizzes.length) {
      const score = quizzes.filter(
        (q) =>
          (session.answers[q.id] ?? session.answers[q.originalIndex]) ===
          q.answer,
      ).length;
      root.append(
        node("p", "YOUR RECALL CHECK", "section-label"),
        node("div", `${score} / ${quizzes.length}`, "result"),
        node(
          "p",
          "Revisit missed concepts, then try again. Scores are saved for this source.",
          "overview",
        ),
        button("Review answers", () => {
          question = 0;
          render();
        }),
        button("Retry quiz", async () => {
          session.answers = {};
          question = 0;
          await save();
          render();
        }),
      );
      return;
    }
    const q = quizzes[question],
      answer = session.answers[q.id] ?? session.answers[q.originalIndex],
      answered = Number.isInteger(answer);
    root.append(
      node("div", `QUESTION ${question + 1} OF ${quizzes.length}`, "progress"),
      node("h2", q.question, "question"),
    );
    q.options.forEach((opt, index) => {
      const b = button(
        `${String.fromCharCode(65 + index)}   ${opt}`,
        async () => {
          session.answers[q.id || q.originalIndex] = index;
          await save();
          render();
        },
        "choice",
      );
      b.disabled = answered;
      if (answered && index === q.answer) b.classList.add("correct");
      else if (answered && index === answer) b.classList.add("wrong");
      root.append(b);
    });
    itemTools(root, p.quiz[q.originalIndex], "quiz");
    if (answered) {
      evidenceUI(root, q, p.source);
      if (
        q.verification?.method === "independent-option-check-v1" &&
        Array.isArray(q.verification.verdicts) &&
        q.verification.verdicts.length === 4 &&
        q.verification.verdicts.every((v) =>
          ["supported", "contradicted", "not_stated"].includes(v),
        )
      ) {
        const checked = node("details");
        checked.append(node("summary", "How the options were checked"));
        q.verification.verdicts.forEach((v, i) =>
          checked.append(
            node("p", `${String.fromCharCode(65 + i)}: ${v.replace("_", " ")}`),
          ),
        );
        checked.append(
          node(
            "p",
            "Model-based source checking is fallible. Inspect the source passage for important claims.",
            "hint",
          ),
        );
        root.append(checked);
      }
      root.append(
        node(
          "div",
          `${answer === q.answer ? "Correct." : "Not quite."} ${q.explanation}`,
          "explanation",
        ),
        button(
          question === quizzes.length - 1 ? "See results →" : "Next question →",
          () => {
            question++;
            render();
          },
        ),
      );
    }
  }
}
async function localFetch(path, body, signal) {
  let res;
  try {
    res = await fetch("http://127.0.0.1:11434/api/" + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (signal?.aborted)
      throw Error(
        "Generation cancelled or timed out. Your previous study pack is unchanged.",
      );
    $("engineStatus").textContent = "Ollama offline · settings";
    throw Error(
      "Cannot reach Ollama. Run SETUP.cmd from the extracted Quizit! folder, then click Check connection in Preferences.",
    );
  }
  if (!res.ok)
    throw Error(
      res.status === 403
        ? "Ollama blocked Quizit!. Quit Ollama from its tray menu, run SETUP.cmd with your Extension ID, then reopen the sidebar."
        : `Ollama returned ${res.status}. Check that the model is installed and has enough memory.`,
    );
  return res.json();
}
async function checkModel(signal) {
  const model = $("model").value.trim();
  if (!model || /cloud/i.test(model))
    throw Error("Choose a locally downloaded model, not a cloud model.");
  const tags = await localFetch(
    "tags",
    null,
    AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)]),
  );
  const found = tags.models?.find(
    (x) => x.name === model || x.name === model + ":latest",
  );
  if (!found || found.remote_model || found.remote_host)
    throw Error(
      `Local model not found. In PowerShell run: ollama pull ${/^[a-zA-Z0-9._:-]+$/.test(model) ? model : "qwen3.5:4b"}`,
    );
  $("engineStatus").textContent = "Local AI ready";
  return model;
}
async function generate(only = "all") {
  if (controller) return;
  if (!session)
    throw Error("Connect a source or create a pasted-text session first.");
  const requested = counts();
  await navigator.locks.request(
    "quizit-generation",
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw Error(
          "Quizit! is generating in another sidebar. Wait for that job to finish.",
        );
      const ctrl = new AbortController();
      controller = ctrl;
      busy(true);
      const timer = setTimeout(() => ctrl.abort(), 60 * 60 * 1000);
      const token = revision,
        target = session;
      let unloadResult = null;
      try {
        await prepare();
        const model = await checkModel(ctrl.signal);
        target.generationCache ||= {};
        const result = await (
          only === "diagram" ? buildDiagram : buildStudyPack
        )({
          id: target.id,
          title: target.title,
          transcript: target.transcript,
          model,
          ...requested,
          only,
          kind: $("diagramKind").value,
          signal: ctrl.signal,
          call: localFetch,
          cache: target.generationCache,
          checkpoint: async (cache) => {
            target.generationCache = cache;
            await storage.set({ ["video:" + target.id]: target });
          },
          onSection: (section, index, total) => {
            if (token !== revision) return;
            let preview = $("generationPreview");
            if (!preview) {
              preview = node("section", undefined, "note-section");
              preview.id = "generationPreview";
              $("study").before(preview);
            }
            preview.append(
              node("h3", `Completed notes · section ${index}/${total}`),
            );
            for (const note of section.notes) {
              preview.append(
                node("h4", note.heading),
                node("p", note.explanation),
              );
            }
          },
          progress: (message) => {
            if (token === revision)
              status(message + ". Keep this sidebar open.");
          },
          released: (ok) => {
            unloadResult = ok;
          },
        });
        if (token !== revision || ctrl.signal.aborted) return;
        await accept(JSON.stringify(result.pack), "Local AI · " + model, only);
        status(
          (only === "diagram"
            ? `Diagram ready · ${result.pack.diagram.nodes.length} points · `
            : `Ready · ${result.pack.flashcards.length} cards · ${result.pack.quiz.length} questions · `) +
            result.stats.seconds +
            "s. " +
            (result.stats.cacheHits
              ? result.stats.cacheHits + " saved sections reused. "
              : "") +
            (unloadResult === true
              ? "Model unloaded; memory released."
              : unloadResult === false
                ? "Unload request failed; Ollama will release the model after its short idle timeout."
                : "Reused saved results without loading the model."),
        );
      } catch (e) {
        const message = ctrl.signal.aborted
          ? "Generation cancelled or timed out. Finished sections are saved; your previous pack is unchanged."
          : e.message;
        if (token === revision)
          status(
            message + (unloadResult === true ? " Model unloaded." : ""),
            true,
          );
      } finally {
        $("generationPreview")?.remove();
        clearTimeout(timer);
        if (controller === ctrl) {
          controller = null;
          busy(false);
        }
      }
    },
  );
}
function modeChanged() {
  const local = $("mode").value === "local";
  $("localSettings").hidden = !local;
  $("localActions").hidden = !local;
  $("manualActions").hidden = local;
  $("creationType").disabled = !local;
  if (!local) $("creationType").value = "all";
  creationChanged();
  return storage.set({
    settings: {
      mode: $("mode").value,
      model: $("model").value.trim(),
      autoGenerate: false,
      creationType: $("creationType").value,
      diagramKind: $("diagramKind").value,
      ocrMode: $("ocrMode").value,
      pdfPages: $("pdfPages").value.trim(),
      ...counts(),
    },
  });
}
function showSource() {
  $("videoTitle").textContent = session.title;
  $("sourceTitle").value = session.title;
  const pdf =
    !!pdfAddress(session.url) || /\.pdf(?:\s|$)/i.test(session.scope || "");
  $("sourceType").textContent = pdf
    ? "PDF DOCUMENT"
    : session.kind === "youtube"
      ? "YOUTUBE VIDEO"
      : session.kind === "article"
        ? "ARTICLE"
        : "YOUR NOTES";
  let origin = "";
  try {
    origin = new URL(session.url).hostname;
  } catch {}
  const pageLabel = (session.scope || "")
    .match(/(?:Pages? [\d, -]+|All \d+ pages)/)?.[0]
    ?.trim();
  $("videoMeta").textContent = pdf
    ? pageLabel
      ? pageLabel + " · Local document"
      : "Local document"
    : session.kind === "text"
      ? "Your notes · saved on this device"
      : origin.replace(/^www\./, "") || "Saved on this device";
  $("createPanel").open = !session.pack;
  $("applyPdfPages").hidden = !(lastPDFFile || lastPdfAddress);
  $("read").textContent =
    session.kind === "youtube" ? "Read YouTube transcript" : "Read page text";
  $("read").hidden = session.kind === "text";
  $("readSelection").hidden = session.kind !== "article";
}
async function refreshLibrary() {
  const all = await storage.get(null);
  for (const [key, s] of Object.entries(all))
    if (
      key.startsWith("video:") &&
      s.pack &&
      (s.packText === undefined ||
        [...s.pack.flashcards, ...s.pack.quiz].some((x) => !x.id))
    ) {
      ensureCards(s.pack);
      s.packText ??= s.transcript;
      await storage.set({ [key]: s });
    }
  $("reviewToday").textContent =
    "Review today · " + dueCards(all).length + " due";
  const select = $("savedSources");
  select.replaceChildren();
  const placeholder = node("option", "Choose saved material");
  placeholder.value = "";
  select.append(placeholder);
  Object.entries(all)
    .filter(
      ([key, v]) =>
        key.startsWith("video:") && v?.id && (v.pack || v.transcript),
    )
    .sort((a, b) =>
      (b[1].updatedAt || b[1].generatedAt || "").localeCompare(
        a[1].updatedAt || a[1].generatedAt || "",
      ),
    )
    .forEach(([key, v]) => {
      const option = node("option", (v.pack ? "✓ " : "") + v.title);
      option.value = key;
      select.append(option);
    });
}
async function newText(
  text = "",
  title = "Untitled reading",
  sourceId = null,
  keepPDF = false,
) {
  if (!keepPDF) {
    lastPDFFile = null;
    lastPdfAddress = null;
  }
  stop();
  ++revision;
  session = {
    id: sourceId || "text:" + crypto.randomUUID(),
    kind: "text",
    title,
    transcript: text,
    pack: null,
    answers: {},
    known: [],
    scope: "Supplied text",
  };
  view = "summary";
  card = question = 0;
  flipped = false;
  showSource();
  $("transcript").value = text;
  $("source").open = !text;
  $("libraryPanel").hidden = true;
  sourceChanged();
  render();
  await save();
  await refreshLibrary();
  status(
    "Add a title and paste text, or import a PDF, DOCX, TXT or Markdown file. Then generate your study pack.",
  );
}
function evidenceUI(root, item, source) {
  const details = node("details", undefined, "box");
  details.append(node("summary", "Source passage"));
  if (item.evidence?.quote) {
    details.append(node("blockquote", item.evidence.quote));
    details.append(
      node(
        "p",
        "Original source context selected by AI. Check whether it supports the answer.",
        "hint",
      ),
    );
    details.append(
      node(
        "p",
        [
          item.evidence.page ? "Page " + item.evidence.page : "",
          item.evidence.time ? "Time " + item.evidence.time : "",
          item.evidence.section ? "Section " + item.evidence.section : "",
        ]
          .filter(Boolean)
          .join(" · "),
        "hint",
      ),
    );
    if (item.edited)
      details.append(
        node(
          "p",
          "Edited answer: check that this passage still supports your correction.",
          "hint",
        ),
      );
  } else
    details.append(
      node(
        "p",
        "This older or imported item has no checked source quotation. Regenerate this section to add citations.",
        "hint",
      ),
    );
  const url = sourceLink(source, item.evidence);
  if (url) {
    const a = node(
      "a",
      item.evidence?.time
        ? "Open video at " + item.evidence.time
        : "Open original source",
    );
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    details.append(a);
  }
  root.append(details);
}
const ratingLocks = new Set();
function ratingUI(root, c, after) {
  const row = node("div", undefined, "review-row"),
    target = session,
    token = revision,
    lockKey = target.id + ":" + c.id;
  let recorded = false;
  for (const [key, label] of [
    ["again", "Again · 10m"],
    ["hard", "Hard"],
    ["good", "Good"],
    ["easy", "Easy"],
  ])
    row.append(
      button(label, async () => {
        if (
          recorded ||
          ratingLocks.has(lockKey) ||
          target !== session ||
          token !== revision
        )
          return;
        recorded = true;
        ratingLocks.add(lockKey);
        row.querySelectorAll("button").forEach((b) => (b.disabled = true));
        try {
          target.reviews ||= {};
          const previous = target.reviews[c.id];
          target.reviews[c.id] = schedule(previous, key);
          try {
            await storage.set({
              ["video:" + target.id]: JSON.parse(JSON.stringify(target)),
            });
          } catch (e) {
            if (previous) target.reviews[c.id] = previous;
            else delete target.reviews[c.id];
            throw e;
          }
          if (target === session && token === revision) {
            await refreshLibrary();
            await after();
          }
        } catch (e) {
          recorded = false;
          row.querySelectorAll("button").forEach((b) => (b.disabled = false));
          throw e;
        } finally {
          ratingLocks.delete(lockKey);
        }
      }),
    );
  root.append(
    row,
    node(
      "p",
      "Again repeats in 10 minutes. First Good: 1 day; Easy: 4 days. Later successful reviews increase the interval.",
      "hint",
    ),
  );
}

function itemTools(root, item, type) {
  const row = node("div", undefined, "review-row");
  row.append(
    button("Edit", () => editItem(item, type)),
    button(item.flagged ? "Unflag" : "Flag", async () => {
      item.flagged = !item.flagged;
      await save();
      await refreshLibrary();
      render();
    }),
    button("Delete", async () => {
      item.deleted = true;
      session.answers = {};
      await save();
      await refreshLibrary();
      render();
      status(
        "Item hidden. Restore deleted items in Your study library to undo.",
      );
    }),
  );
  root.append(row);
  if (item.flagged)
    root.append(
      node(
        "p",
        "Flagged for checking · excluded from the daily card queue.",
        "hint",
      ),
    );
}
function editItem(item, type) {
  const root = $("study");
  root.replaceChildren(
    node("h2", type === "cards" ? "Edit flashcard" : "Edit question"),
  );
  const fields = {};
  const field = (key, label, value) => {
    const l = node("label", label),
      input = node("textarea");
    input.value = value;
    input.rows = 3;
    l.append(input);
    root.append(l);
    fields[key] = input;
  };
  if (type === "cards") {
    field("front", "Question", item.front);
    field("back", "Answer", item.back);
  } else {
    field("question", "Question", item.question);
    item.options.forEach((x, i) => field("option" + i, "Option " + (i + 1), x));
    field("answer", "Correct option (1–4)", String(item.answer + 1));
    field("explanation", "Explanation", item.explanation);
  }
  root.append(
    button("Save changes", async () => {
      const patch =
        type === "cards"
          ? { front: fields.front.value.trim(), back: fields.back.value.trim() }
          : {
              question: fields.question.value.trim(),
              options: [0, 1, 2, 3].map((i) =>
                fields["option" + i].value.trim(),
              ),
              answer: Number(fields.answer.value) - 1,
              explanation: fields.explanation.value.trim(),
            };
      if (!(type === "cards" ? cardOK(patch) : quizOK(patch)))
        throw Error(
          "Fill every field. Quiz options must differ; correct option must be 1–4.",
        );
      Object.assign(item, patch, { edited: true });
      delete item.verification; // The previous model checks do not cover an edited item.
      if (session.reviews) delete session.reviews[item.id];
      session.answers = {};
      await save();
      await refreshLibrary();
      render();
      status(
        type === "cards"
          ? "Changes saved. Review progress for this card has been reset."
          : "Question updated. Quiz answers reset so you can retry.",
      );
    }),
    button("Cancel editing", render),
  );
}
let reviewQueue = [],
  reviewCursor = 0,
  reviewFlipped = false;
async function nextReview() {
  while (reviewCursor < reviewQueue.length) {
    const entry = reviewQueue[reviewCursor],
      data = await storage.get(entry.key),
      s = data[entry.key];
    const c = s?.pack?.flashcards.find((x) => x.id === entry.id);
    if (
      c &&
      !c.deleted &&
      !c.flagged &&
      (!s.reviews?.[c.id] || s.reviews[c.id].due <= Date.now())
    ) {
      session = s;
      lastPDFFile = null;
      lastPdfAddress = pdfAddress(s.url);
      session.tabId = null;
      showSource();
      $("transcript").value = session.transcript;
      sourceChanged();
      view = "review";
      reviewFlipped = false;
      render();
      return;
    }
    reviewCursor++;
  }
  view = "review";
  render();
}
function renderReview(root) {
  root.replaceChildren(node("h2", "Today’s review"));
  const entry = reviewQueue[reviewCursor];
  if (!entry) {
    root.append(
      node(
        "p",
        "You have finished this queue. Cards rated Again become due in 10 minutes.",
        "overview",
      ),
      button("Refresh due cards", startReview),
    );
    return;
  }
  const c = session?.pack?.flashcards.find((x) => x.id === entry.id);
  if (!c) return;
  root.append(
    node(
      "p",
      entry.title + " · " + (reviewCursor + 1) + " / " + reviewQueue.length,
      "hint",
    ),
  );
  const face = button(
    reviewFlipped ? c.back : c.front,
    () => {
      reviewFlipped = !reviewFlipped;
      render();
    },
    "flashcard",
  );
  face.setAttribute(
    "aria-label",
    reviewFlipped ? "Show question" : "Reveal answer",
  );
  root.append(face);
  if (reviewFlipped) {
    evidenceUI(root, c, session.pack.source);
    ratingUI(root, c, async () => {
      reviewCursor++;
      await nextReview();
    });
  }
  root.append(
    button("Skip for now", async () => {
      reviewCursor++;
      await nextReview();
    }),
  );
}
async function startReview() {
  stop();
  ++revision;
  await refreshLibrary();
  reviewQueue = dueCards(await storage.get(null));
  reviewCursor = 0;
  await nextReview();
}
$("reviewToday").onclick = run(startReview);
$("restoreItems").onclick = run(async () => {
  if (!session?.pack) throw Error("Open saved material first.");
  for (const x of [...session.pack.flashcards, ...session.pack.quiz])
    x.deleted = false;
  await save();
  await refreshLibrary();
  render();
  status("Deleted items restored for this source.");
});

$("newText").onclick = run(() => newText());
$("readSelection").onclick = run(() => readSource(true));
let editTimer;
function saveSourceEdits() {
  clearTimeout(editTimer);
  const target = session,
    token = revision;
  if (!target) return;
  target.title = $("sourceTitle").value.trim() || "Untitled reading";
  if (target.transcript !== $("transcript").value) target.sourceEdited = true;
  target.transcript = $("transcript").value;
  $("videoTitle").textContent = target.title;
  editTimer = setTimeout(() => {
    if (token === revision)
      save()
        .then(refreshLibrary)
        .catch((e) => status(e.message, true));
  }, 250);
}
$("sourceTitle").addEventListener("input", saveSourceEdits);
$("sourceTitle").onchange = run(async () => {
  if (session) {
    session.title = $("sourceTitle").value.trim() || "Untitled reading";
    showSource();
    await save();
    await refreshLibrary();
  }
});
async function importFile(file, ocrMode) {
  if (!file) return;
  lastPDFFile = /\.pdf$/i.test(file.name) ? file : null;
  lastPdfAddress = null;
  $("applyPdfPages").hidden = !lastPDFFile;
  const ctrl = new AbortController();
  controller = ctrl;
  busy(true);
  status("Reading document locally…");
  try {
    const result = await extractDocument(
      file,
      status,
      ctrl.signal,
      ocrMode,
      $("pdfPages").value,
    );
    controller = null;
    await newText(
      result.text,
      result.title + (result.selection ? " · " + result.selection.label : ""),
      null,
      true,
    );
    session.pdfRange = $("pdfPages").value;
    session.scope =
      "Imported " +
      result.filename +
      (result.selection ? " · " + result.selection.label : "");
    await save();
    showSource();
    $("materialOptions").open = false;
    $("articleAccess").hidden = true;
    status(
      "Document imported. " +
        (result.warnings.join(" ") ||
          "Check the extracted text, set your counts, then click Start creating."),
    );
  } catch (e) {
    if (ctrl.signal.aborted)
      status("Document import cancelled. Previous source kept.");
    else {
      if (/page range|selected text|OCR/i.test(e.message)) {
        $("materialOptions").open = true;
        $("pdfPages").focus?.();
      }
      throw e;
    }
  } finally {
    if (controller === ctrl) controller = null;
    busy(false);
    $("textFile").value = "";
    $("pdfFile").value = "";
  }
}
$("textFile").onchange = run(() =>
  importFile($("textFile").files[0], ocrChoice()),
);
async function connectPDF(address, tabId) {
  const token = revision;
  lastPDFFile = null;
  lastPdfAddress = address;
  $("applyPdfPages").hidden = false;
  $("articleAccess").hidden = true;
  $("pdfAddress").textContent = "PDF address: " + address;
  if (
    address.startsWith("file:") &&
    !(await chrome.extension.isAllowedFileSchemeAccess())
  ) {
    showPDFSetup();
    status(
      "PDF address detected. In edge://extensions → Quizit! → Details, enable Allow access to file URLs. Then click Connect current page again.",
    );
    return;
  }
  const range = pageRangeKey($("pdfPages").value);
  const key =
    "pdf:" +
    address +
    (range === "all" ? "" : "|pages:" + range) +
    (ocrChoice() === "none" ? "" : "|ocr:" + ocrChoice());
  const saved = await storage.get("video:" + key);
  if (token !== revision) return;
  if (saved["video:" + key]?.transcript) {
    session = saved["video:" + key];
    session.tabId = tabId;
    card = question = 0;
    flipped = false;
    showSource();
    $("transcript").value = session.transcript;
    sourceChanged();
    render();
    status("Saved PDF restored. No AI generation started.");
    return;
  }
  const ctrl = new AbortController();
  controller = ctrl;
  busy(true);
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    status("Reading PDF directly from its address…");
    let file;
    try {
      file = await fetchPDFFile(address, ctrl.signal);
      clearTimeout(timer);
    } catch (e) {
      throw Error(
        e.message + " If Edge blocks file access, use Choose PDF file.",
      );
    }
    const result = await extractDocument(
      file,
      status,
      ctrl.signal,
      ocrChoice(),
      $("pdfPages").value,
    );
    ctrl.signal.throwIfAborted();
    if (token !== revision) return;
    controller = null;
    await newText(
      result.text,
      result.title + (result.selection ? " · " + result.selection.label : ""),
      key,
      true,
    );
    session.pdfRange = $("pdfPages").value;
    session.url = address;
    session.tabId = tabId;
    session.scope =
      "PDF · " +
      result.filename +
      (result.selection ? " · " + result.selection.label : "");
    await save();
    await refreshLibrary();
    showSource();
    status(
      "PDF connected. " +
        (result.warnings.join(" ") ||
          "Set your counts and click Start creating."),
    );
  } catch (e) {
    if (/page range|selected text|OCR/i.test(e.message))
      $("materialOptions").open = true;
    status(ctrl.signal.aborted ? "PDF connection cancelled." : e.message, true);
  } finally {
    clearTimeout(timer);
    if (controller === ctrl) controller = null;
    busy(false);
  }
}
$("enablePdf").onclick = run(async () => {
  const granted = await chrome.permissions.request({ permissions: ["tabs"] });
  if (!granted) {
    status(
      "Tab-address access was not granted. Use Choose PDF file instead.",
      true,
    );
    return;
  }
  await connect();
});

$("choosePdf").onclick = () => {
  $("pdfFile").click();
};
$("pdfFile").onchange = run(() =>
  importFile($("pdfFile").files[0], ocrChoice()),
);

$("openSaved").onclick = run(async () => {
  const key = $("savedSources").value;
  if (!key) return;
  const data = await storage.get(key);
  if (!data[key]) throw Error("Saved source no longer exists.");
  stop();
  ++revision;
  session = data[key];
  lastPDFFile = null;
  lastPdfAddress = pdfAddress(session.url);
  if (session.pdfRange !== undefined) $("pdfPages").value = session.pdfRange;
  session.kind ||= "youtube";
  session.tabId = null;
  view = "summary";
  card = question = 0;
  flipped = false;
  showSource();
  $("transcript").value = session.transcript;
  sourceChanged();
  render();
  $("libraryPanel").hidden = true;
  status("Saved material restored. No AI generation needed.");
});
$("settingsButton").onclick = () => {
  $("settings").hidden = !$("settings").hidden;
};
// Request synchronously from this click, before any await: browsers require a user gesture.
$("allowArticles").onclick = run(async () => {
  const granted = await chrome.permissions.request({
    origins: ["https://*/*", "http://*/*"],
  });
  if (!granted) {
    status(
      "Article access was not granted. You can try again or use New pasted text.",
      true,
    );
    return;
  }
  $("articleAccess").hidden = true;
  await connect();
});
$("connect").onclick = run(async () => {
  $("connect").disabled = true;
  try {
    await connect();
  } finally {
    $("connect").disabled = false;
  }
});
$("read").onclick = run(readSource);
$("copy").onclick = run(async () => {
  const prompt = await prepare();
  await navigator.clipboard.writeText(prompt);
  $("importSection").open = true;
  status(
    "Prompt copied. Paste it into this chat, then import the JSON response below.",
  );
});
$("import").onclick = run(async () => {
  await prepare();
  await accept($("json").value, "Imported from your AI chat");
});
$("generate").onclick = run(() => generate($("creationType").value));
$("generateNotes").onclick = run(() => generate("notes"));
$("generateCards").onclick = run(() => generate("cards"));
$("generateQuiz").onclick = run(() => generate("quiz"));
$("cancel").onclick = () => {
  stop();
  status("Generation cancelled.");
};
$("test").onclick = run(async () => {
  const model = await checkModel(AbortSignal.timeout(5000));
  status(`Connected to Ollama · ${model} is installed locally.`);
});
$("mode").onchange = run(async () => {
  stop();
  await modeChanged();
  checkAIReadiness();
});
$("model").onchange = run(async () => {
  await modeChanged();
  checkAIReadiness();
});

$("pdfPages").onchange = run(modeChanged);
$("ocrMode").onchange = run(modeChanged);
$("creationType").onchange = run(modeChanged);
$("diagramKind").onchange = run(modeChanged);
$("difficulty").onchange =
  $("cardCount").onchange =
  $("quizCount").onchange =
    run(modeChanged);
for (const id of ["cardCount", "quizCount"])
  $(id).addEventListener("input", () => {
    try {
      counts();
    } catch {
      return;
    }
    modeChanged().catch((e) => status(e.message, true));
  });
$("transcript").addEventListener("input", () => {
  saveSourceEdits();
  sourceChanged();
  if (controller) {
    stop();
    status("Generation cancelled because the transcript changed.");
  }
});
$("transcript").addEventListener(
  "change",
  run(async () => {
    if (session) {
      session.transcript = $("transcript").value;
      await save();
    }
  }),
);
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      view = b.dataset.view;
      render();
    }),
);
$("export").onclick = run(() => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(session.pack, null, 2)], {
      type: "application/json",
    }),
  );
  const a = node("a");
  a.href = url;
  a.download = `quizit-${session.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 70)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("clear").onclick = run(async () => {
  if (!confirm("Delete this source’s saved text, study pack and progress?"))
    return;
  stop();
  ++revision;
  await storage.remove("video:" + session.id);
  session.pack = null;
  session.packText = null;
  session.reviews = {};
  session.generationCache = {};
  session.transcript = "";
  session.answers = {};
  session.known = [];
  $("transcript").value = "";
  sourceChanged();
  render();
  await refreshLibrary();
  status("This saved session was deleted.");
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (
    session?.tabId === tabId &&
    change.url &&
    sourceIdentity(change.url)?.id !== session.id
  ) {
    stop();
    ++revision;
    status(
      "The tab changed pages. This pack still belongs to the previous source; click Connect current page to switch.",
    );
  }
});
chrome.tabs.onActivated.addListener(() => {
  status(
    "Tab changed. Click Connect current page if you want to switch your study session.",
  );
});

function ocrChoice() {
  return ["none", "missing", "all"].includes($("ocrMode").value)
    ? $("ocrMode").value
    : "missing";
}
function creationChanged() {
  const kind = $("creationType").value;
  $("diagramOptions").hidden = kind !== "diagram";
  $("quizCountLabel").hidden = !["all", "quiz"].includes(kind);
  $("cardCountLabel").hidden = !["all", "cards"].includes(kind);
}
function showPDFSetup() {
  $("settings").hidden = false;
  $("settings").querySelector("details").open = true;
}
async function checkAIReadiness() {
  const el = $("engineStatus");
  if ($("mode").value !== "local") {
    el.textContent = "Manual AI mode";
    return;
  }
  try {
    const tags = await localFetch("tags", null, AbortSignal.timeout(4000));
    const models = (tags.models || []).filter(
      (m) => !m.remote_model && !m.remote_host && !/cloud/i.test(m.name),
    );
    let found = models.find(
      (m) =>
        m.name === $("model").value || m.name === $("model").value + ":latest",
    );
    if (!found && models.length === 1) {
      found = models[0];
      $("model").value = found.name;
      await modeChanged();
    }
    el.textContent = found ? "Local AI ready" : "Choose a model in Settings";
  } catch {
    el.textContent = "Ollama offline · settings";
  }
}
$("copyId").onclick = run(async () => {
  await navigator.clipboard.writeText(chrome.runtime.id);
  status(
    "Extension ID copied. Run SETUP.cmd from the extracted Quizit! folder and paste it when asked.",
  );
});
$("libraryButton").onclick = () => {
  $("libraryPanel").hidden = !$("libraryPanel").hidden;
};
$("closeLibrary").onclick = () => {
  $("libraryPanel").hidden = true;
};
$("addFile").onclick = () => {
  $("textFile").click();
};
$("pdfHelp").onclick = showPDFSetup;
$("engineStatus").onclick = () => {
  $("settings").hidden = false;
};
$("applyPdfPages").onclick = run(async () => {
  if (lastPDFFile) await importFile(lastPDFFile, ocrChoice());
  else {
    const address = lastPdfAddress || pdfAddress(session?.url);
    if (address) {
      stop();
      ++revision;
      await connectPDF(address, session?.tabId || null);
    }
  }
});

document.documentElement.dataset.panelReady = "true";
$("connect").disabled = false;
await run(async () => {
  const { settings } = await storage.get("settings");
  if (settings) {
    $("creationType").value = [
      "all",
      "notes",
      "cards",
      "quiz",
      "diagram",
    ].includes(settings.creationType)
      ? settings.creationType
      : "all";
    $("ocrMode").value = ["none", "missing", "all"].includes(settings.ocrMode)
      ? settings.ocrMode
      : "missing";
    $("pdfPages").value = settings.pdfPages || "";
    $("mode").value = settings.mode;
    $("model").value = settings.model || "qwen3.5:4b";
    $("difficulty").value = ["beginner", "standard", "advanced"].includes(
      settings.difficulty,
    )
      ? settings.difficulty
      : "standard";
    $("cardCount").value = settings.cards || 5;
    $("quizCount").value = settings.quiz || 5;
  } else {
    $("mode").value = "local";
  }
  $("diagramKind").value =
    settings.diagramKind === "flowchart" ? "flowchart" : "mindmap";
  $("extensionId").textContent = `Extension ID: ${chrome.runtime.id}`;
  await modeChanged();
  await refreshLibrary();
  try {
    await connect();
  } catch (e) {
    status(e.message, true);
  }
})();
checkAIReadiness();
